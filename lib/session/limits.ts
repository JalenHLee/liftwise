/** The first build plus 3 rebuilds a day. */
export const MAX_BUILDS_PER_DAY = 4;

export const buildsLeft = (buildCount: number) => Math.max(0, MAX_BUILDS_PER_DAY - buildCount);
