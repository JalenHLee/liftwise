export const MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const PAIN_AREAS = [
  "neck",
  "shoulder",
  "elbow",
  "wrist",
  "lower_back",
  "hip",
  "knee",
  "ankle",
] as const;
export type PainArea = (typeof PAIN_AREAS)[number];

export const MOVEMENT_PATTERNS = [
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "squat",
  "lunge",
  "hinge",
  "hip_extension",
  "knee_extension",
  "knee_flexion",
  "elbow_flexion",
  "elbow_extension",
  "shoulder_raise",
  "chest_fly",
  "calf_raise",
  "core",
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const EQUIPMENT = [
  "barbell",
  "squat_rack",
  "flat_bench",
  "incline_bench",
  "dumbbells",
  "smith_machine",
  "cable",
  "cable_row",
  "lat_pulldown",
  "shoulder_press_machine",
  "leg_press",
  "leg_extension",
  "leg_curl",
  "calf_machine",
  "dip_station",
  "pullup_bar",
  "low_bar",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export type ExerciseType = "compound" | "isolation";

export type Exercise = {
  id: string;
  name: string;
  primaryMuscle: Muscle;
  secondaryMuscles: Muscle[];
  pattern: MovementPattern;
  /** Everything needed; an empty list means bodyweight only. */
  equipment: Equipment[];
  type: ExerciseType;
  /** 0 = bodyweight exercise, progressed by reps instead of load. */
  loadIncrementKg: number;
  loadsAreas: PainArea[];
  keyLift: boolean;
};

export const GOALS = ["strength", "muscle", "general"] as const;
export type Goal = (typeof GOALS)[number];

export const EXPERIENCES = ["beginner", "intermediate", "advanced"] as const;
export type Experience = (typeof EXPERIENCES)[number];

export const EQUIPMENT_SETUPS = ["full_gym", "unit_gym", "bodyweight"] as const;
export type EquipmentSetup = (typeof EQUIPMENT_SETUPS)[number];

export const READINESS_LEVELS = ["green", "yellow", "red"] as const;
export type Readiness = (typeof READINESS_LEVELS)[number];

export type PlannedExercise = {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  rirMin: number;
  rirMax: number;
  restSeconds: number;
  /** Plain-English reasons for every change made to this exercise today. */
  adjustments: string[];
};

export type CheckIn = {
  sleepHours: number;
  /** 1 (very low) to 5 (great). */
  energy: number;
  /** 1 (none) to 5 (very sore), per muscle. Missing = 1. */
  soreness: Partial<Record<Muscle, number>>;
  painAreas: PainArea[];
  minutesAvailable: number;
};
