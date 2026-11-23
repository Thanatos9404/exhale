import { commuteModeSchema, type Household, type Member } from '@/lib/profile/schema';
import { MODE_LABEL, type CommuteMode } from '@/lib/science/commute';
import { PURIFIER_CADR } from '@/lib/science/indoor';
import { fmtHour } from '@/lib/science/meteo';

/** One choice in a select or checkbox group. */
export interface Option<T extends string | number> {
  value: T;
  label: string;
}

/** Anchor targets for the settings side navigation, in page order. */
export const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'people', label: 'People' },
  { id: 'commute', label: 'Commute' },
  { id: 'home', label: 'Home' },
  { id: 'data', label: 'Data' },
] as const;

/** Most people a household can hold; matches the schema limit. */
export const MAX_MEMBERS = 8;

/** Whole hours of the day, labelled 00:00 to 23:00. */
export const HOUR_OPTIONS: Option<number>[] = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: fmtHour(h),
}));

/** Health conditions that tighten a person's outdoor limit. */
export const CONDITIONS: Option<Member['conditions'][number]>[] = [
  { value: 'asthma', label: 'Asthma' },
  { value: 'copd', label: 'COPD' },
  { value: 'heart', label: 'Heart condition' },
  { value: 'pregnancy', label: 'Pregnant' },
];

export const AGE_GROUP_OPTIONS: Option<Member['ageGroup']>[] = [
  { value: 'child', label: 'Child (under 12)' },
  { value: 'teen', label: 'Teen' },
  { value: 'adult', label: 'Adult' },
  { value: 'senior', label: 'Senior (60+)' },
];

export const DAYTIME_OPTIONS: Option<Member['daytime']>[] = [
  { value: 'home', label: 'At home' },
  { value: 'office', label: 'At an office' },
  { value: 'school', label: 'At school' },
];

export const EXERCISE_OPTIONS: Option<Member['exercise']>[] = [
  { value: 'none', label: 'None' },
  { value: 'walk', label: 'Walk' },
  { value: 'run', label: 'Run' },
  { value: 'cycle', label: 'Cycle' },
  { value: 'yoga', label: 'Outdoor yoga' },
];

/** Every commute mode, in the order the schema lists them. */
export const MODE_OPTIONS: Option<CommuteMode>[] = commuteModeSchema.options.map((mode) => ({
  value: mode,
  label: MODE_LABEL[mode],
}));

export const PURIFIER_OPTIONS: Option<Household['home']['purifier']>[] = [
  { value: 'none', label: 'None' },
  { value: 'small', label: `Small (${PURIFIER_CADR.small} m³/h)` },
  { value: 'medium', label: `Medium (${PURIFIER_CADR.medium} m³/h)` },
  { value: 'large', label: `Large (${PURIFIER_CADR.large} m³/h)` },
  { value: 'diy', label: 'DIY box-fan filter' },
];

export const COOKING_OPTIONS: Option<Household['home']['cooking']>[] = [
  { value: 'lpg', label: 'LPG or piped gas' },
  { value: 'electric', label: 'Electric or induction' },
  { value: 'biomass', label: 'Wood, dung or coal (chulha)' },
];

export const HEATING_OPTIONS: Option<Household['home']['heating']>[] = [
  { value: 'none', label: 'None' },
  { value: 'electric', label: 'Electric heater' },
  { value: 'gas', label: 'Gas heater' },
  { value: 'wood', label: 'Wood fire' },
  { value: 'coal', label: 'Coal (angithi)' },
];
