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
4. History: past sessions, plus weekly sets per muscle vs 10–20 band and trends for key lifts (this replaces the old separate Progress screen)

Mobile-first, one-handed use, large tap targets.

## Design (light, editorial, minimal)
Feel: chic, calm, minimal. Lots of whitespace, thin hairlines, no
heavy borders, no shadows, no gradients.
Themes: follows the phone's system setting; light when there's no
preference. A System / Light / Dark toggle on the Today screen is
remembered on the device, and an inline script in the page head
applies it before first paint (no flash of the wrong theme).
Colours are named tokens in `app/globals.css` (paper, ink, muted,
hairline, fill, accent, green/yellow/red tint/text/dot); both themes
use the same names.
Light colours:
- Paper background #F6F4EF, ink text #1C1B19, muted text #6B675F
- Hairlines #DAD5CB, subtle fill #ECE8E0, accent terracotta #A6532F
  (used sparingly: logo "wise", "NOW" markers)
- Readiness cards (soft tint background / text / dot):
  Green #E3EAE1 / #2F5A3C / #3F7A52
  Yellow #F4EAD2 / #6E5210 / #C9962B
  Red #F3DEDA / #8E2F24 / #B8453A
Dark colours:
- Background #141311, text #EDE9E1, muted text #9A958B
- Hairlines #2E2B27, subtle fill #1F1D1A, accent terracotta #D07A55
- Selected pills and the primary button invert: #EDE9E1 fill with
  #141311 text
- Readiness cards (tint background / text / dot):
  Green #1E2A21 / #A8CDB0 / #5FA374
  Yellow #2E2718 / #E6C47A / #D6A640
  Red #2F1D1A / #E8A79C / #D0645A
Type (load with next/font/google so fonts are bundled at build):
- Instrument Serif: headlines and all big numbers; italic for accents
- Instrument Sans: body text and buttons (400/500)
- JetBrains Mono: small labels, 10.5px, UPPERCASE, 0.14em letter
  spacing, muted color
Shapes and components (shared pieces live in `components/ui.tsx`):
- 1px hairline dividers between sections; sections labeled like
  "01  SLEEP" in mono
- Buttons, chips, segmented choices: pills (fully rounded).
  Selected = solid ink fill with paper text. Unselected = 1px
  hairline outline.
- Primary button: ink pill, 54px tall, paper text, label left and a
  thin arrow icon right
- Rows 14px radius, cards 20px radius
- Inputs: no box, just a 1px hairline underline, mono label above
- Page side padding 28px; touch targets at least 44px
Readiness: a soft tinted card with a small colored dot and a serif
label ("Yellow day"), never a saturated full-width block. Always
paired with text, never color alone.

## Data (Supabase)
`profiles`, `exercises` (static seed, ~40), `checkins`, `sessions`, `set_logs`. RLS: users only see their own rows.

## Safety
- Pain flow tells the user to get it checked by a medic/doctor (never diagnose). No "not medical advice" notes elsewhere in the app.
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
5. Session generation (engine -> Claude -> validator -> UI), plus starting weights from "weight × reps": estimate a 1-rep max with the Epley formula, round down to the exercise's increment; if the user skips starting weights, the first session is a calibration session
6. Set logging + progression from history + end-of-workout rating and note
7. Coach chat: Claude proposes changes to today's session, the engine validates them against the guardrails, and the user previews and accepts. Pain exclusions can never be overridden; volume never exceeds the green-day plan
8. History dashboard (past sessions + weekly sets per muscle + key-lift trends)
9. Eval set (20 check-in scenarios with expected behaviors)

## Out of scope for now
- Progress photos

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
15. Starting loads: estimate a 1-rep max from the user's last solid set (Epley: weight × (1 + reps/30); 1 rep = the weight itself), then work backwards using the **top** of the exercise's rep range plus its low-end target RIR (e.g. 5–10 at RIR 2 → 10 + 2 = 12), rounded **down** to the exercise's increment, never below one increment. Starting slightly light is intended; double progression corrects it within a session. No starting data (or a bodyweight exercise) → calibration: "Pick a weight you could lift for about 10 reps with 2 left in reserve."
16. Onboarding starting sets are "weight × reps", reps 1–12, both boxes or neither. Above 10 reps the form says the estimate is less precise. Rows saved before slice 5a have no reps; the session builder (5b) treats them as 5 reps.

Engine assumptions made while building slice 2 (not yet confirmed by the owner):
- Bodyweight setup assumes a pull-up bar and a sturdy low bar or table (for rows and curls).
- Templates aim for the bottom of each weekly band; they don't yet shorten sessions to the user's session length (the time modifier handles that on the day).
- A muscle counts as "trained" in a session if it gets at least 1 hard set (using the counting in decision 2).
- Unit gym: dumbbell exercises stop adding weight at 20 kg.
- Default rest is the middle of the range (150 s compounds, 90 s isolation); time estimates assume 40 s of work per set.
- A key lift is "stalled" when neither of the last 2 weeks beat its best from before those weeks.
- Onboarding values: goal = strength / muscle / general (only strength changes rep ranges); energy and soreness are scored 1–5.

## Status
Current: slice 5a (starting weights) done. Onboarding now asks for "your last solid set" (weight × reps, reps 1–12, optional per lift) and saves the reps. The engine has `estimateOneRepMax`, `startingLoad` and `startingLoadFor` (in `lib/engine/startingLoad.ts`, fully tested), which give a starting weight or a calibration marker. Nothing uses them yet. Next: slice 5b (session builder: engine -> Claude -> validator -> UI), which will call `startingLoadFor`. It will also apply the unit-gym dumbbell cap, since 5a's key lifts don't use dumbbells.

Manual steps needed in Supabase (SQL Editor), in order:
1. `supabase/migrations/0001_profiles_and_onboarding.sql` (if not already run), and confirm email confirmations are off (Authentication → Providers → Email).
2. `supabase/migrations/0002_checkins.sql` (the `checkins` table with Row Level Security).
3. `supabase/migrations/0003_starting_weights_reps.sql` (adds the `reps` column to `starting_weights`; run it before testing the onboarding preview).
