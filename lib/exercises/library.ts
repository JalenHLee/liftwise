import type { Exercise } from "@/lib/engine/types";

// Within each muscle, better options come first: templates pick the first one
// the user's equipment allows.
export const EXERCISES: Exercise[] = [
  // Chest
  { id: "barbell-bench-press", name: "Barbell bench press", primaryMuscle: "chest", secondaryMuscles: ["triceps", "shoulders"], pattern: "horizontal_push", equipment: ["barbell", "flat_bench"], type: "compound", loadIncrementKg: 2.5, loadsAreas: ["shoulder", "elbow", "wrist"], keyLift: true },
  { id: "incline-dumbbell-press", name: "Incline dumbbell press", primaryMuscle: "chest", secondaryMuscles: ["shoulders", "triceps"], pattern: "horizontal_push", equipment: ["dumbbells", "incline_bench"], type: "compound", loadIncrementKg: 2, loadsAreas: ["shoulder", "elbow", "wrist"], keyLift: false },
  { id: "dumbbell-bench-press", name: "Dumbbell bench press", primaryMuscle: "chest", secondaryMuscles: ["triceps", "shoulders"], pattern: "horizontal_push", equipment: ["dumbbells", "flat_bench"], type: "compound", loadIncrementKg: 2, loadsAreas: ["shoulder", "elbow", "wrist"], keyLift: false },
  { id: "dip", name: "Dip", primaryMuscle: "chest", secondaryMuscles: ["triceps", "shoulders"], pattern: "horizontal_push", equipment: ["dip_station"], type: "compound", loadIncrementKg: 0, loadsAreas: ["shoulder", "elbow", "wrist"], keyLift: false },
  { id: "push-up", name: "Push-up", primaryMuscle: "chest", secondaryMuscles: ["triceps", "shoulders"], pattern: "horizontal_push", equipment: [], type: "compound", loadIncrementKg: 0, loadsAreas: ["shoulder", "elbow", "wrist"], keyLift: false },
  { id: "cable-fly", name: "Cable fly", primaryMuscle: "chest", secondaryMuscles: [], pattern: "chest_fly", equipment: ["cable"], type: "isolation", loadIncrementKg: 2.5, loadsAreas: ["shoulder"], keyLift: false },

  // Back
  { id: "pull-up", name: "Pull-up", primaryMuscle: "back", secondaryMuscles: ["biceps"], pattern: "vertical_pull", equipment: ["pullup_bar"], type: "compound", loadIncrementKg: 0, loadsAreas: ["shoulder", "elbow"], keyLift: true },
  { id: "barbell-row", name: "Barbell row", primaryMuscle: "back", secondaryMuscles: ["biceps"], pattern: "horizontal_pull", equipment: ["barbell"], type: "compound", loadIncrementKg: 2.5, loadsAreas: ["lower_back", "shoulder", "elbow"], keyLift: true },
  { id: "lat-pulldown", name: "Lat pulldown", primaryMuscle: "back", secondaryMuscles: ["biceps"], pattern: "vertical_pull", equipment: ["lat_pulldown"], type: "compound", loadIncrementKg: 5, loadsAreas: ["shoulder", "elbow"], keyLift: false },
  { id: "seated-cable-row", name: "Seated cable row", primaryMuscle: "back", secondaryMuscles: ["biceps"], pattern: "horizontal_pull", equipment: ["cable_row"], type: "compound", loadIncrementKg: 5, loadsAreas: ["shoulder", "elbow"], keyLift: false },
  { id: "one-arm-dumbbell-row", name: "One-arm dumbbell row", primaryMuscle: "back", secondaryMuscles: ["biceps"], pattern: "horizontal_pull", equipment: ["dumbbells", "flat_bench"], type: "compound", loadIncrementKg: 2, loadsAreas: ["shoulder", "elbow"], keyLift: false },
  { id: "inverted-row", name: "Inverted row", primaryMuscle: "back", secondaryMuscles: ["biceps"], pattern: "horizontal_pull", equipment: ["low_bar"], type: "compound", loadIncrementKg: 0, loadsAreas: ["shoulder", "elbow"], keyLift: false },

  // Shoulders
  { id: "overhead-press", name: "Overhead press", primaryMuscle: "shoulders", secondaryMuscles: ["triceps"], pattern: "vertical_push", equipment: ["barbell", "squat_rack"], type: "compound", loadIncrementKg: 2.5, loadsAreas: ["shoulder", "elbow", "wrist", "lower_back"], keyLift: true },
  { id: "machine-shoulder-press", name: "Machine shoulder press", primaryMuscle: "shoulders", secondaryMuscles: ["triceps"], pattern: "vertical_push", equipment: ["shoulder_press_machine"], type: "compound", loadIncrementKg: 5, loadsAreas: ["shoulder", "elbow"], keyLift: false },
  { id: "dumbbell-shoulder-press", name: "Dumbbell shoulder press", primaryMuscle: "shoulders", secondaryMuscles: ["triceps"], pattern: "vertical_push", equipment: ["dumbbells"], type: "compound", loadIncrementKg: 2, loadsAreas: ["shoulder", "elbow", "wrist"], keyLift: false },
  { id: "pike-push-up", name: "Pike push-up", primaryMuscle: "shoulders", secondaryMuscles: ["triceps"], pattern: "vertical_push", equipment: [], type: "compound", loadIncrementKg: 0, loadsAreas: ["shoulder", "elbow", "wrist"], keyLift: false },
  { id: "dumbbell-lateral-raise", name: "Dumbbell lateral raise", primaryMuscle: "shoulders", secondaryMuscles: [], pattern: "shoulder_raise", equipment: ["dumbbells"], type: "isolation", loadIncrementKg: 2, loadsAreas: ["shoulder"], keyLift: false },
  { id: "face-pull", name: "Face pull", primaryMuscle: "shoulders", secondaryMuscles: [], pattern: "shoulder_raise", equipment: ["cable"], type: "isolation", loadIncrementKg: 2.5, loadsAreas: ["shoulder"], keyLift: false },

  // Biceps
  { id: "barbell-curl", name: "Barbell curl", primaryMuscle: "biceps", secondaryMuscles: [], pattern: "elbow_flexion", equipment: ["barbell"], type: "isolation", loadIncrementKg: 2.5, loadsAreas: ["elbow", "wrist"], keyLift: false },
  { id: "dumbbell-curl", name: "Dumbbell curl", primaryMuscle: "biceps", secondaryMuscles: [], pattern: "elbow_flexion", equipment: ["dumbbells"], type: "isolation", loadIncrementKg: 2, loadsAreas: ["elbow", "wrist"], keyLift: false },
  { id: "cable-curl", name: "Cable curl", primaryMuscle: "biceps", secondaryMuscles: [], pattern: "elbow_flexion", equipment: ["cable"], type: "isolation", loadIncrementKg: 2.5, loadsAreas: ["elbow", "wrist"], keyLift: false },
  { id: "bodyweight-curl", name: "Bodyweight curl (low bar)", primaryMuscle: "biceps", secondaryMuscles: [], pattern: "elbow_flexion", equipment: ["low_bar"], type: "isolation", loadIncrementKg: 0, loadsAreas: ["elbow", "wrist", "shoulder"], keyLift: false },

  // Triceps
  { id: "cable-pushdown", name: "Cable pushdown", primaryMuscle: "triceps", secondaryMuscles: [], pattern: "elbow_extension", equipment: ["cable"], type: "isolation", loadIncrementKg: 2.5, loadsAreas: ["elbow"], keyLift: false },
  { id: "overhead-dumbbell-extension", name: "Overhead dumbbell extension", primaryMuscle: "triceps", secondaryMuscles: [], pattern: "elbow_extension", equipment: ["dumbbells"], type: "isolation", loadIncrementKg: 2, loadsAreas: ["elbow", "shoulder"], keyLift: false },
  { id: "bench-dip", name: "Bench dip", primaryMuscle: "triceps", secondaryMuscles: [], pattern: "elbow_extension", equipment: [], type: "isolation", loadIncrementKg: 0, loadsAreas: ["shoulder", "elbow", "wrist"], keyLift: false },

  // Quads
  { id: "back-squat", name: "Back squat", primaryMuscle: "quads", secondaryMuscles: ["glutes"], pattern: "squat", equipment: ["barbell", "squat_rack"], type: "compound", loadIncrementKg: 5, loadsAreas: ["knee", "hip", "lower_back"], keyLift: true },
  { id: "leg-press", name: "Leg press", primaryMuscle: "quads", secondaryMuscles: ["glutes"], pattern: "squat", equipment: ["leg_press"], type: "compound", loadIncrementKg: 5, loadsAreas: ["knee", "hip"], keyLift: false },
  { id: "goblet-squat", name: "Goblet squat", primaryMuscle: "quads", secondaryMuscles: ["glutes"], pattern: "squat", equipment: ["dumbbells"], type: "compound", loadIncrementKg: 2, loadsAreas: ["knee", "hip"], keyLift: false },
  { id: "dumbbell-walking-lunge", name: "Dumbbell walking lunge", primaryMuscle: "quads", secondaryMuscles: ["glutes"], pattern: "lunge", equipment: ["dumbbells"], type: "compound", loadIncrementKg: 2, loadsAreas: ["knee", "hip"], keyLift: false },
  { id: "split-squat", name: "Bodyweight split squat", primaryMuscle: "quads", secondaryMuscles: ["glutes"], pattern: "lunge", equipment: [], type: "compound", loadIncrementKg: 0, loadsAreas: ["knee", "hip"], keyLift: false },
  { id: "leg-extension", name: "Leg extension", primaryMuscle: "quads", secondaryMuscles: [], pattern: "knee_extension", equipment: ["leg_extension"], type: "isolation", loadIncrementKg: 5, loadsAreas: ["knee"], keyLift: false },
  { id: "sissy-squat", name: "Sissy squat", primaryMuscle: "quads", secondaryMuscles: [], pattern: "knee_extension", equipment: [], type: "isolation", loadIncrementKg: 0, loadsAreas: ["knee"], keyLift: false },

  // Hamstrings
  { id: "deadlift", name: "Deadlift", primaryMuscle: "hamstrings", secondaryMuscles: ["glutes", "back"], pattern: "hinge", equipment: ["barbell"], type: "compound", loadIncrementKg: 5, loadsAreas: ["lower_back", "hip", "knee"], keyLift: true },
  { id: "romanian-deadlift", name: "Romanian deadlift", primaryMuscle: "hamstrings", secondaryMuscles: ["glutes"], pattern: "hinge", equipment: ["barbell"], type: "compound", loadIncrementKg: 5, loadsAreas: ["lower_back", "hip"], keyLift: false },
  { id: "dumbbell-romanian-deadlift", name: "Dumbbell Romanian deadlift", primaryMuscle: "hamstrings", secondaryMuscles: ["glutes"], pattern: "hinge", equipment: ["dumbbells"], type: "compound", loadIncrementKg: 2, loadsAreas: ["lower_back", "hip"], keyLift: false },
  { id: "leg-curl", name: "Leg curl", primaryMuscle: "hamstrings", secondaryMuscles: [], pattern: "knee_flexion", equipment: ["leg_curl"], type: "isolation", loadIncrementKg: 5, loadsAreas: ["knee"], keyLift: false },
  { id: "sliding-leg-curl", name: "Sliding leg curl", primaryMuscle: "hamstrings", secondaryMuscles: [], pattern: "knee_flexion", equipment: [], type: "isolation", loadIncrementKg: 0, loadsAreas: ["knee"], keyLift: false },

  // Glutes
  { id: "barbell-hip-thrust", name: "Barbell hip thrust", primaryMuscle: "glutes", secondaryMuscles: ["hamstrings"], pattern: "hip_extension", equipment: ["barbell", "flat_bench"], type: "compound", loadIncrementKg: 5, loadsAreas: ["hip", "lower_back"], keyLift: false },
  { id: "glute-bridge", name: "Single-leg glute bridge", primaryMuscle: "glutes", secondaryMuscles: [], pattern: "hip_extension", equipment: [], type: "isolation", loadIncrementKg: 0, loadsAreas: ["hip"], keyLift: false },

  // Calves
  { id: "machine-calf-raise", name: "Standing calf raise (machine)", primaryMuscle: "calves", secondaryMuscles: [], pattern: "calf_raise", equipment: ["calf_machine"], type: "isolation", loadIncrementKg: 5, loadsAreas: ["ankle"], keyLift: false },
  { id: "smith-calf-raise", name: "Smith machine calf raise", primaryMuscle: "calves", secondaryMuscles: [], pattern: "calf_raise", equipment: ["smith_machine"], type: "isolation", loadIncrementKg: 5, loadsAreas: ["ankle"], keyLift: false },
  { id: "single-leg-calf-raise", name: "Single-leg calf raise", primaryMuscle: "calves", secondaryMuscles: [], pattern: "calf_raise", equipment: [], type: "isolation", loadIncrementKg: 0, loadsAreas: ["ankle"], keyLift: false },

  // Core
  { id: "cable-crunch", name: "Cable crunch", primaryMuscle: "core", secondaryMuscles: [], pattern: "core", equipment: ["cable"], type: "isolation", loadIncrementKg: 2.5, loadsAreas: ["lower_back", "neck"], keyLift: false },
  { id: "hanging-knee-raise", name: "Hanging knee raise", primaryMuscle: "core", secondaryMuscles: [], pattern: "core", equipment: ["pullup_bar"], type: "isolation", loadIncrementKg: 0, loadsAreas: ["shoulder"], keyLift: false },
  { id: "dead-bug", name: "Dead bug", primaryMuscle: "core", secondaryMuscles: [], pattern: "core", equipment: [], type: "isolation", loadIncrementKg: 0, loadsAreas: ["lower_back"], keyLift: false },
];

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise {
  const exercise = byId.get(id);
  if (!exercise) throw new Error(`Unknown exercise: ${id}`);
  return exercise;
}
