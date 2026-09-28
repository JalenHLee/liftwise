export type RouteState = { hasSession: boolean; hasProfile: boolean };

/** Where a visitor to "/" should land, given their auth + onboarding state. */
export function resolveRoute(state: RouteState): "/login" | "/onboarding" | "/today" {
  if (!state.hasSession) return "/login";
  if (!state.hasProfile) return "/onboarding";
  return "/today";
}
