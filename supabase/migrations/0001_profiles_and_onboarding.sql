-- Slice 3: profiles + starting weights captured during onboarding.
-- Both tables are owned one-to-one by an auth.users row and locked down
-- with Row Level Security so a user can only ever see their own data.

create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  goal text not null check (goal in ('strength', 'muscle', 'general')),
  days_per_week smallint not null check (days_per_week between 2 and 6),
  session_minutes smallint not null check (session_minutes in (30, 45, 60, 75, 90)),
  equipment text not null check (equipment in ('full_gym', 'unit_gym', 'bodyweight')),
  experience text not null check (experience in ('beginner', 'intermediate', 'advanced')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own profile"
  on profiles for delete
  using (auth.uid() = user_id);

-- Optional starting weights for the key lifts (lib/engine/types.ts KEY_LIFTS,
-- currently: back squat, bench press, deadlift, overhead press, barbell row,
-- pull-up). Pull-up is bodyweight and never gets a row here.
create table if not exists starting_weights (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null check (
    exercise_id in (
      'back-squat',
      'barbell-bench-press',
      'deadlift',
      'overhead-press',
      'barbell-row'
    )
  ),
  weight_kg numeric(5, 2) not null check (weight_kg > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table starting_weights enable row level security;

create policy "Users can view their own starting weights"
  on starting_weights for select
  using (auth.uid() = user_id);

create policy "Users can insert their own starting weights"
  on starting_weights for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own starting weights"
  on starting_weights for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own starting weights"
  on starting_weights for delete
  using (auth.uid() = user_id);
