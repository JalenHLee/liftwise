@AGENTS.md

# Liftwise

## What we're building
Liftwise is an AI fitness coach: a mobile-first web app. Each day the user does a 30-second check-in (sleep, energy, soreness, pain, time available). The app adapts that day's workout using evidence-based rules, explains every change, logs sets, and progresses load over time.

The owner is a product manager, not an engineer. Explain every change in plain English and prefer simple solutions.

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- Supabase: auth + Postgres, Row Level Security on every user table
- Claude API via `@anthropic-ai/sdk`, model `claude-sonnet-5`, called ONLY from server code
- Vitest for tests
- Vercel deploys from GitHub (`main` = production, every PR gets a preview URL)
- There is no local machine: always run `npm test` and `npm run build` before pushing

## Core principle
The rules engine (pure TypeScript in `/lib/engine`) is the source of truth for all numbers: sets, reps, load, RIR, rest.
Claude only: (1) interprets the free-text check-in note, (2) picks exercise swaps from allowed library IDs, (3) writes short explanations.
Claude returns JSON. Validate it (IDs exist, volume within bounds, no excluded muscles). If invalid, use the rules-only plan.

## Training rules ("optimal" standard)
- Weekly volume: 10–20 hard sets per muscle (beginner 10–12, intermediate 12–16). Max 10 hard sets per muscle per session.
- Frequency: each muscle trained at least 2x/week.
- Reps: compounds 5–10 (strength goal 3–6); isolation 10–20.
- Effort: compounds RIR 2–3, isolation RIR 1–2.
- Rest: compounds 120–180s, isolation 60–120s.

Double progression (per exercise):
- All sets at top of rep range at target RIR -> next time +2.5 kg upper body / +5 kg lower body (or smallest increment)
- Within range -> same load, aim +1 rep
- Below bottom of range 2 sessions in a row -> reduce load 5–10%

Deload: every 6th week, OR 2+ key lifts stalled for 2 weeks, OR 3+ red days in 7 -> one week at 50% sets, same load, RIR 4.

Readiness (from check-in):
- Green: plan as written, progression allowed
- Yellow (sleep < 6h OR energy <= 2/5 OR any muscle soreness 3/5): -1 set per exercise, RIR >= 3, no load increases
- Red (sleep < 5h AND energy <= 2/5, OR 3+ muscles at soreness >= 4/5): ~50% volume or technique/mobility session, hold load

Modifiers (apply at any readiness):
- Muscle soreness >= 4/5 -> halve that muscle's sets or swap to a lower-stress exercise
- Pain flag -> exclude every exercise loading that area; show "get it checked by a medic/doctor"; never diagnose
- Short on time -> drop accessories first, keep compounds, never cut rest below minimums

Program templates (never let Claude invent programs):
- 2–3 days/week -> Full Body
- 4 days/week -> Upper/Lower
- 5–6 days/week -> Push/Pull/Legs

## Screens
1. Onboarding: goal, days/week, session length, equipment (full gym / unit gym / bodyweight), experience, optional starting weights
2. Today: check-in card -> "Build my session"
3. Session: exercises with sets x reps x weight, target RIR, rest timer, inline set logging, "Adjusted" badge with reason
4. Progress: weekly sets per muscle vs 10–20 band, trends for key lifts

Mobile-first, one-handed use, large tap targets.

## Design
- The readiness signal is the brand: today's readiness (green /
  yellow / red) visibly shapes the screen through a subtle accent
  color or glow, not just a status label.
- Numbers are the hero: weights, reps and sets use big, bold,
  confident numerals, readable mid-set.
- Dark-first and gym-ready: high contrast, readable in a dim gym,
  large tap targets placed in the thumb zone.
- Calm, not hype: feels like a smart coach, not a flashy fitness app.
  Minimal and precise, one accent color at a time.
- Small moments of delight: satisfying feedback when logging a set,
  subtle animation when the plan adjusts.
- Mobile-first (design at 390px width first), one-handed use.

## Data (Supabase)
`profiles`, `exercises` (static seed, ~40), `checkins`, `sessions`, `set_logs`. RLS: users only see their own rows.

## Safety
- "Not medical advice" note on onboarding and in the pain flow
- Secrets only in env vars, never in code: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`

## How to work with me
- Read this file first. Propose a short plan and wait for approval before coding.
- One slice per session. Do not add features I didn't ask for.
- Write tests for all engine logic.
- When done: explain what changed in plain English, tell me how to test it on the Vercel preview, and update Status below.

## Build order
1. Scaffold: Next.js, Tailwind, Vitest, placeholder home page
2. Exercise library + rules engine + tests
3. Supabase auth + onboarding
4. Daily check-in
5. Session generation (engine -> Claude -> validator -> UI)
6. Set logging + progression from history
7. Progress screen
8. Eval set (20 check-in scenarios with expected behaviors)

## Decisions
Owner-approved clarifications of the rules above. Follow these; ask before changing them.

1. Yellow soreness: any muscle at soreness 3 **or higher** makes the day Yellow.
2. Weekly set counting: 1 set for the exercise's main muscle, 0.5 for each secondary muscle.
3. 5 days/week = Push, Pull, Legs, Upper, Lower (plain PPL would train legs only once).
4. Equipment setups:
   - Full gym: everything in the library.
   - Unit gym: squat rack + barbell, smith machine, incline bench, flat bench press, dumbbells up to 20 kg, shoulder press machine, single-stack cable machine, cable row, lat pulldown. No leg press, leg extension, leg curl, calf machine or dip station.
   - Bodyweight: no weights (see assumptions below).
5. Weight cut after 2 bad sessions in a row: 10%, rounded down to the exercise's increment.
6. A session is "bad" only if the **first** working set is below the bottom of the rep range.
7. "Top of range at target RIR" means every set hit the top of the range and no set was harder than the target (logged RIR ≥ the low end of the target).
8. Bodyweight exercises progress by raising the rep target instead of adding load.
9. Red day: the engine gives about 50% of the sets. A technique/mobility session is deferred until the library has mobility exercises.
10. Stacking: effects multiply but never go below 1 set per exercise. Order: deload → readiness → pain → soreness → time.
11. Short on time: drop isolation exercises from the end first, then trim sets from the last compound backwards (min 1 set each). Rest is never cut.
12. "Every 6th week" is counted from the last deload of any kind, so an early deload resets the count.
13. Key lifts (for the stall trigger): back squat, bench press, deadlift, overhead press, barbell row, pull-up.
14. Weekly hard-set bands: beginner 10–12, intermediate 12–16, **advanced 14–20**.

Engine assumptions made while building slice 2 (not yet confirmed by the owner):
- Bodyweight setup assumes a pull-up bar and a sturdy low bar or table (for rows and curls).
- Templates aim for the bottom of each weekly band; they don't yet shorten sessions to the user's session length (the time modifier handles that on the day).
- A muscle counts as "trained" in a session if it gets at least 1 hard set (using the counting in decision 2).
- Unit gym: dumbbell exercises stop adding weight at 20 kg.
- Default rest is the middle of the range (150 s compounds, 90 s isolation); time estimates assume 40 s of work per set.
- A key lift is "stalled" when neither of the last 2 weeks beat its best from before those weeks.
- Onboarding values: goal = strength / muscle / general (only strength changes rep ranges); energy and soreness are scored 1–5.

## Status
Current: slice 2 (exercise library + rules engine) done. Next: slice 3 (Supabase auth + onboarding).
