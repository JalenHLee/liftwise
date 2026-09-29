-- Slice 4: the daily check-in.
-- One row per user per local day. Saving again the same day updates that row (upsert on
-- user_id + checkin_date). Every value is limited to the rules engine's vocabulary
-- (lib/engine/types.ts), and Row Level Security means a user only ever sees their own rows.

-- Soreness is stored as {"quads": 3, ...}: only muscles the user rated 2-5.
-- A muscle that is missing means "none" (1 in the engine's 1-5 scale).
create or replace function public.is_valid_soreness(s jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(s) = 'object'
    and not exists (
      select 1
      from jsonb_each(s) as e
      where e.key <> all (array[
              'chest', 'back', 'shoulders', 'biceps', 'triceps',
              'quads', 'hamstrings', 'glutes', 'calves', 'core'
            ])
         or jsonb_typeof(e.value) <> 'number'
         or e.value::text !~ '^[1-5]$'
    );
$$;

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The user's own calendar date (their phone's clock), not UTC.
  checkin_date date not null,

  sleep_hours numeric(3, 1) not null
    check (sleep_hours between 0 and 14 and sleep_hours * 2 = round(sleep_hours * 2)),
  energy smallint not null check (energy between 1 and 5),
  soreness jsonb not null default '{}'::jsonb check (public.is_valid_soreness(soreness)),
  -- Empty list = no pain.
  pain_areas text[] not null default '{}'
    check (pain_areas <@ array['neck', 'shoulder', 'elbow', 'wrist', 'lower_back', 'hip', 'knee', 'ankle']::text[]),
  minutes_available smallint not null check (minutes_available in (30, 45, 60, 75, 90)),
  note text check (note is null or char_length(note) <= 500),

  -- Snapshot of what the app said that day, so History still shows it if the rules change.
  -- Rewritten every time the check-in is edited.
  readiness_level text not null check (readiness_level in ('green', 'yellow', 'red')),
  readiness_reasons text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, checkin_date)
);

alter table checkins enable row level security;

drop policy if exists "Users can view their own check-ins" on checkins;
create policy "Users can view their own check-ins"
  on checkins for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own check-ins" on checkins;
create policy "Users can insert their own check-ins"
  on checkins for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own check-ins" on checkins;
create policy "Users can update their own check-ins"
  on checkins for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own check-ins" on checkins;
create policy "Users can delete their own check-ins"
  on checkins for delete
  using (auth.uid() = user_id);
