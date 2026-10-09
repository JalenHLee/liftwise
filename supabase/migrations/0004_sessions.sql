-- Slice 5b: today's generated session.
-- One row per user per local day, linked to that day's check-in. The whole plan is kept as
-- jsonb (exercises, sets, reps, weights, tags, explanations), plus what Claude replied and what
-- the validator decided, so evals and debugging can replay exactly what happened.
-- Row Level Security means a user only ever sees their own rows.

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The user's own calendar date (their phone's clock), same as checkins.checkin_date.
  session_date date not null,
  checkin_id uuid not null references checkins (id) on delete cascade,
  -- The check-in's updated_at when this session was built; if the check-in is edited later the
  -- Session screen asks the user to rebuild.
  checkin_updated_at timestamptz not null,

  -- Which program day this is. Days rotate in order: the next session uses day_index + 1.
  template text not null
    check (template in ('full_body', 'upper_lower', 'push_pull_legs', 'push_pull_legs_upper_lower')),
  day_index smallint not null check (day_index between 0 and 5),
  day_name text not null,
  is_deload boolean not null default false,

  -- Readiness snapshot used for this session (includes anything Claude read in the note).
  readiness_level text not null check (readiness_level in ('green', 'yellow', 'red')),
  readiness_reasons text[] not null default '{}',

  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  -- 'ai' = Claude's suggestions passed the validator; 'rules' = the rules-only plan.
  source text not null check (source in ('ai', 'rules')),
  -- Set whenever Claude was asked, even if its reply wasn't used.
  model text,
  prompt_version text,
  ai_raw_output text,
  validation jsonb not null default '{}'::jsonb,

  -- 1 = first build; each rebuild adds 1. At most 3 rebuilds a day (cost control).
  build_count smallint not null default 1 check (build_count between 1 and 4),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, session_date)
);

create index if not exists sessions_user_date on sessions (user_id, session_date desc);

alter table sessions enable row level security;

drop policy if exists "Users can view their own sessions" on sessions;
create policy "Users can view their own sessions"
  on sessions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own sessions" on sessions;
create policy "Users can insert their own sessions"
  on sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own sessions" on sessions;
create policy "Users can update their own sessions"
  on sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own sessions" on sessions;
create policy "Users can delete their own sessions"
  on sessions for delete
  using (auth.uid() = user_id);
