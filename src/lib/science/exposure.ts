/**
 * Personal exposure maths.
 *
 * Inhaled dose (µg) = concentration (µg/m³) × breathing rate (m³/h) × hours.
 * Breathing rates: US EPA Exposure Factors Handbook (2011), Table 6-2 means, rounded.
 * Cigarette equivalence: Berkeley Earth (Muller & Muller, 2015): breathing 22 µg/m³ of PM2.5
 * for 24 hours carries roughly the mortality risk of smoking one cigarette.
 */

/** Age bands with distinct breathing rates and sensitivity. */
export type AgeGroup = 'child' | 'teen' | 'adult' | 'senior';
/** How hard someone is breathing; selects a row of `BREATHING_RATE`. */
export type Activity = 'sleep' | 'rest' | 'light' | 'moderate' | 'vigorous';
/** Health conditions that raise sensitivity to PM2.5. */
export type Condition = 'asthma' | 'copd' | 'heart' | 'pregnancy';

/** m³ of air breathed per hour. */
export const BREATHING_RATE: Record<AgeGroup, Record<Activity, number>> = {
  child: { sleep: 0.27, rest: 0.29, light: 0.66, moderate: 1.32, vigorous: 2.52 },
  teen: { sleep: 0.3, rest: 0.32, light: 0.78, moderate: 1.68, vigorous: 3.24 },
  adult: { sleep: 0.26, rest: 0.3, light: 0.72, moderate: 1.56, vigorous: 3.0 },
  senior: { sleep: 0.25, rest: 0.26, light: 0.72, moderate: 1.56, vigorous: 2.82 },
};

/** WHO 2021 air quality guideline for 24-hour mean PM2.5, µg/m³. */
export const WHO_PM25_24H = 15;

/** µg/m³ of PM2.5 breathed for 24 h that equals one cigarette (Berkeley Earth). */
export const CIGARETTE_PM25_24H = 22;

/** Inhaled PM mass in µg. */
export function inhaledDose(concentration: number, rate: number, hours: number): number {
  if (concentration <= 0 || rate <= 0 || hours <= 0) return 0;
  return concentration * rate * hours;
}

/** Converts concentration-hours (µg/m³ × h) into cigarette equivalents. */
export function cigarettesFromConcHours(concHours: number): number {
  return Math.max(0, concHours) / (CIGARETTE_PM25_24H * 24);
}

/** Cigarettes for a full day at a constant 24 h mean concentration. */
export function cigarettesPerDay(meanPm25: number): number {
  return cigarettesFromConcHours(meanPm25 * 24);
}

/**
 * Relative sensitivity to PM2.5, 1 for a healthy adult. The engine's own weighting, used only
 * to lower the outdoor-effort limit for more vulnerable people.
 */
export const SENSITIVITY: Record<AgeGroup | Condition, number> = {
  adult: 1,
  teen: 1.1,
  child: 1.5,
  senior: 1.4,
  asthma: 2,
  copd: 2,
  heart: 1.6,
  pregnancy: 1.5,
};

/** Highest sensitivity multiplier among a person's age group and conditions. */
export function sensitivityOf(ageGroup: AgeGroup, conditions: readonly Condition[]): number {
  return Math.max(SENSITIVITY[ageGroup], ...conditions.map((c) => SENSITIVITY[c]));
}

/**
 * Highest outdoor PM2.5 (µg/m³) at which we still schedule outdoor exercise.
 * A healthy adult gets 55 µg/m³ (the top of the US "unhealthy for sensitive groups" band);
 * more sensitive people get a proportionally lower ceiling, never below the WHO guideline.
 */
export function outdoorEffortLimit(sensitivity: number): number {
  const limit = 55 / Math.max(1, sensitivity);
  return Math.round(Math.max(WHO_PM25_24H, Math.min(55, limit)) * 10) / 10;
}
