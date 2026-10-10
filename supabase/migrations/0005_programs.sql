-- Slice 5c: each user's active program, stored as data.
-- One row per user. A program has a name, a source ('template' = generated from one of the
-- app's splits, 'custom' = built by the user, from slice 8) and ordered days, kept as jsonb:
--   [{ "name": "Upper", "exercises": [{ "exerciseId": "barbell-bench-press", "sets": 4,
--                                        "repMin": 6, "repMax": 8 }, ...] }, ...]
-- repMin/repMax are optional overrides (custom programs); without them the rep range comes from
-- the user's goal. The app checks every field when it reads the row.
-- Users from before this slice get a row created from their current template the first time
-- it's needed, so their sessions don't change.
-- Row Level Security means a user only ever sees their own row.

create table if not exists programs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  source text not null check (source in ('template', 'custom')),
  -- The split a template program was generated from; null for custom programs.
  split text check (split in ('full_body', 'upper_lower', 'push_pull_legs', 'push_pull_legs_upper_lower')),
  days jsonb not null check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) between 1 and 6),
  -- Set when the user replaces their program: sessions built before this don't count for the
  -- rotation, so the new program starts at day 1. Null = never replaced.
  rotation_reset_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source = 'custom' or split is not null)
);

alter table programs enable row level security;

drop policy if exists "Users can view their own program" on programs;
create policy "Users can view their own program"
  on programs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own program" on programs;
create policy "Users can insert their own program"
  on programs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own program" on programs;
create policy "Users can update their own program"
  on programs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own program" on programs;
create policy "Users can delete their own program"
  on programs for delete
  using (auth.uid() = user_id);

-- Sessions record which program they came from; allow 'custom' for slice 8.
alter table sessions drop constraint if exists sessions_template_check;
alter table sessions add constraint sessions_template_check
  check (template in ('full_body', 'upper_lower', 'push_pull_legs', 'push_pull_legs_upper_lower', 'custom'));
