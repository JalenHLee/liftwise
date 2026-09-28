import { describe, expect, test } from "vitest";
import { resolveRoute } from "./resolveRoute";

describe("resolveRoute", () => {
  test("no session -> login", () => {
    expect(resolveRoute({ hasSession: false, hasProfile: false })).toBe("/login");
    expect(resolveRoute({ hasSession: false, hasProfile: true })).toBe("/login");
  });

  test("session but no profile -> onboarding", () => {
    expect(resolveRoute({ hasSession: true, hasProfile: false })).toBe("/onboarding");
  });

  test("session and profile -> today", () => {
    expect(resolveRoute({ hasSession: true, hasProfile: true })).toBe("/today");
  });
});
