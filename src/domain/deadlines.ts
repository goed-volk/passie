// Pure deadline calculation functions - no system clocks.

export const DEFAULT_DEADLINE_OFFSET_SECONDS = 24 * 60 * 60; // 24 hours in seconds

export function computeIndicationDeadline(
  kickoffAt: number,
  offsetSeconds: number = DEFAULT_DEADLINE_OFFSET_SECONDS
): number {
  return kickoffAt - offsetSeconds;
}

export function isDeadlinePassed(deadlineAt: number, now: number): boolean {
  return now >= deadlineAt;
}
