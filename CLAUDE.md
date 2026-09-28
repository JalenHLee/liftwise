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

## Status
Current: slice 1 (scaffold) done. Next: slice 2 (exercise library + rules engine).
