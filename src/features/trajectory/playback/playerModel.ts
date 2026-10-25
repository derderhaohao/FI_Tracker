export type Speed = 'slow' | 'normal' | 'fast';

/** Multiplier on the smart pace (Normal = the original "Smart" pacing). */
export const SPEED_FACTOR: Record<Speed, number> = { slow: 0.5, normal: 1, fast: 2.5 };

export interface ScrubTick {
  month: number;
  kind: 'event' | 'milestone' | 'stop' | 'runOut';
}
