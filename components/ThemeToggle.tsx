"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type ThemeChoice } from "./theme";
import { PillGroup } from "./ui";

const CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];
const LABELS: Record<ThemeChoice, string> = { system: "System", light: "Light", dark: "Dark" };
const CHANGE_EVENT = "liftwise-theme-change";

function readChoice(): ThemeChoice {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || attr === "dark" ? attr : "system";
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

function setChoice(choice: ThemeChoice) {
  const root = document.documentElement;
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blocked (e.g. private mode): the choice still applies for this visit.
  }
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as const);
  return <PillGroup options={CHOICES} value={choice} onChange={setChoice} labels={LABELS} size="sm" />;
}
