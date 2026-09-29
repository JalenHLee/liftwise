-- Slice 5a: a starting weight is now "weight × reps" (the user's last solid
-- set), so the engine can estimate a 1-rep max and pick a load for any rep
-- range. Non-destructive: adds one column, drops nothing.
-- Existing rows keep reps = null; the session builder treats those as 5 reps.

alter table starting_weights
  add column if not exists reps smallint check (reps between 1 and 12);
