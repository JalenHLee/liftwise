-- Slice 6: set logging, finishing a workout, progression from history.
--
-- set_logs: one row per logged set. The id is made on the phone when the set is logged, so if
-- the network drops and the phone retries, the same set is saved once (an upsert on id), never
-- twice. Progression and the stalled-lifts deload read these rows whether or not the session
-- was marked finished.
-- Row Level Security: a user only sees their own rows, and can only log sets into their own
-- sessions.

create table if not exists set_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references sessions (id) on delete cascade,
  exercise_id text not null check (char_length(exercise_id) between 1 and 80),
  -- 1 = the first working set of that exercise in the session.
  set_number smallint not null check (set_number between 1 and 20),
  -- Null for bodyweight exercises.
  weight_kg numeric(6, 2) check (weight_kg is null or (weight_kg > 0 and weight_kg < 1000)),
  reps smallint not null check (reps between 0 and 100),
  -- Reps in reserve; 4 means "4 or more".
  rir smallint not null check (rir between 0 and 4),
  -- When the set was logged on the phone (may be earlier than when it reached the server).
  logged_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists set_logs_session on set_logs (session_id);
create index if not exists set_logs_user_exercise on set_logs (user_id, exercise_id, logged_at desc);

alter table set_logs enable row level security;

drop policy if exists "Users can view their own sets" on set_logs;
create policy "Users can view their own sets"
  on set_logs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can log sets into their own sessions" on set_logs;
create policy "Users can log sets into their own sessions"
  on set_logs for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid())
  );

drop policy if exists "Users can correct their own sets" on set_logs;
create policy "Users can correct their own sets"
  on set_logs for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid())
  );

drop policy if exists "Users can delete their own sets" on set_logs;
create policy "Users can delete their own sets"
  on set_logs for delete
  using (auth.uid() = user_id);

-- Finishing a workout: when it was marked done (null = not finished; partial sessions are
-- fine), the "How did it go?" rating and note, and the exercises the user skipped.
alter table sessions add column if not exists completed_at timestamptz;
alter table sessions add column if not exists rating smallint check (rating between 1 and 5);
alter table sessions add column if not exists note text check (note is null or char_length(note) <= 500);
alter table sessions add column if not exists skipped_exercise_ids text[] not null default '{}';
