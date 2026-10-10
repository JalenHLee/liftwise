import { RECOMMENDED_SPLIT, SPLIT_NAMES, splitCycle, splitsFor, type SplitId } from "@/lib/engine/templates";
import type { EquipmentSetup, Experience } from "@/lib/engine/types";
import { programNotes } from "./notes";
import { checkFor, generateProgram, isRolling } from "./program";

export type SplitOption = {
  split: SplitId;
  name: string;
  /** The day types in order, without repeats, e.g. ["Push", "Pull", "Legs"]. */
  dayNames: string[];
  recommended: boolean;
  rolling: boolean;
  /** Honest tradeoffs from the engine's check; empty when it meets every rule. */
  notes: string[];
};

const DAY_NAMES = { full_body: "Full Body", upper: "Upper", lower: "Lower", push: "Push", pull: "Pull", legs: "Legs" } as const;

/** The splits offered for this many days, each checked by the engine for this user. */
export function splitOptions(profile: { daysPerWeek: number; experience: Experience; equipment: EquipmentSetup }): SplitOption[] {
  return splitsFor(profile.daysPerWeek).map((split) => ({
    split,
    name: SPLIT_NAMES[split],
    dayNames: [...new Set(splitCycle(split, profile.daysPerWeek).map((t) => DAY_NAMES[t]))],
    recommended: RECOMMENDED_SPLIT[profile.daysPerWeek] === split,
    rolling: isRolling(split, profile.daysPerWeek),
    notes: programNotes(checkFor(generateProgram(split, profile), profile)),
  }));
}
