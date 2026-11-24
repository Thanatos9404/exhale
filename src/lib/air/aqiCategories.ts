/**
 * The named bands of each AQI standard: what an index value is called and the public advice
 * that goes with it.
 */
import { defined } from '../assert.js';
import type { AqiStandard } from './types.js';

/** Category rank, 0 (good) to 5 (hazardous or severe), shared by both standards for colouring. */
export type AqiLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** A named AQI band in one standard. */
export interface AqiCategory {
  level: AqiLevel;
  label: string;
  /** Short guidance for the general public. */
  advice: string;
}

/** US EPA bands, keyed by the highest AQI in each. */
const US_CATEGORIES: readonly [number, AqiCategory][] = [
  [50, { level: 0, label: 'Good', advice: 'Air is clean. Enjoy time outside.' }],
  [
    100,
    {
      level: 1,
      label: 'Moderate',
      advice: 'Unusually sensitive people should ease off long outdoor effort.',
    },
  ],
  [
    150,
    {
      level: 2,
      label: 'Unhealthy for sensitive groups',
      advice: 'Children, older adults and people with asthma should limit outdoor effort.',
    },
  ],
  [
    200,
    { level: 3, label: 'Unhealthy', advice: 'Everyone should cut long or heavy outdoor effort.' },
  ],
  [
    300,
    { level: 4, label: 'Very unhealthy', advice: 'Stay indoors with filtered air where you can.' },
  ],
  [
    Infinity,
    { level: 5, label: 'Hazardous', advice: 'Health warning for everyone. Avoid going outside.' },
  ],
];

/** India NAQI (CPCB) bands, keyed by the highest AQI in each. */
const IN_CATEGORIES: readonly [number, AqiCategory][] = [
  [50, { level: 0, label: 'Good', advice: 'Minimal impact.' }],
  [
    100,
    { level: 1, label: 'Satisfactory', advice: 'Minor breathing discomfort for sensitive people.' },
  ],
  [
    200,
    {
      level: 2,
      label: 'Moderate',
      advice: 'Discomfort for people with lung or heart disease, children and older adults.',
    },
  ],
  [
    300,
    { level: 3, label: 'Poor', advice: 'Breathing discomfort for most people on long exposure.' },
  ],
  [400, { level: 4, label: 'Very poor', advice: 'Respiratory illness on prolonged exposure.' }],
  [
    Infinity,
    {
      level: 5,
      label: 'Severe',
      advice: 'Affects healthy people and seriously impacts those with existing disease.',
    },
  ],
];

/** Category, label and public advice for an AQI value in the given standard. */
export function aqiCategory(aqi: number, standard: AqiStandard): AqiCategory {
  const list = standard === 'us' ? US_CATEGORIES : IN_CATEGORIES;
  for (const [max, cat] of list) if (aqi <= max) return cat;
  // Only NaN gets past the Infinity bound; report it as the top of the scale.
  return defined(list.at(-1), 'AQI category table')[1];
}
