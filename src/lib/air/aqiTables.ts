/**
 * Breakpoint tables for the two AQI standards the app reports:
 *  - US EPA AQI (PM2.5 breakpoints revised Feb 2024)
 *  - India National AQI (CPCB, 2014)
 * Data only; the interpolation lives in ./aqi.
 */
import type { Pollutant } from './types.js';

/** One breakpoint row: concentrations [clo, chi] map linearly onto index values [ilo, ihi]. */
export interface Band {
  /** Concentration range (µg/m³ unless noted). */
  clo: number;
  chi: number;
  /** Index range. */
  ilo: number;
  ihi: number;
}

const band = (clo: number, chi: number, ilo: number, ihi: number): Band => ({ clo, chi, ilo, ihi });

/** US EPA tables. PM in µg/m³ (24 h), NO2 in ppb (1 h), O3 in ppb (8 h). */
export const US_TABLES: Record<Pollutant, Band[]> = {
  pm25: [
    band(0, 9.0, 0, 50),
    band(9.1, 35.4, 51, 100),
    band(35.5, 55.4, 101, 150),
    band(55.5, 125.4, 151, 200),
    band(125.5, 225.4, 201, 300),
    band(225.5, 325.4, 301, 500),
  ],
  pm10: [
    band(0, 54, 0, 50),
    band(55, 154, 51, 100),
    band(155, 254, 101, 150),
    band(255, 354, 151, 200),
    band(355, 424, 201, 300),
    band(425, 604, 301, 500),
  ],
  no2: [
    band(0, 53, 0, 50),
    band(54, 100, 51, 100),
    band(101, 360, 101, 150),
    band(361, 649, 151, 200),
    band(650, 1249, 201, 300),
    band(1250, 2049, 301, 500),
  ],
  o3: [
    band(0, 54, 0, 50),
    band(55, 70, 51, 100),
    band(71, 85, 101, 150),
    band(86, 105, 151, 200),
    band(106, 200, 201, 300),
  ],
};

/** India NAQI tables, all µg/m³. PM and NO2 on 24 h means, O3 on 8 h means. */
export const IN_TABLES: Record<Pollutant, Band[]> = {
  pm25: [
    band(0, 30, 0, 50),
    band(31, 60, 51, 100),
    band(61, 90, 101, 200),
    band(91, 120, 201, 300),
    band(121, 250, 301, 400),
    band(251, 380, 401, 500),
  ],
  pm10: [
    band(0, 50, 0, 50),
    band(51, 100, 51, 100),
    band(101, 250, 101, 200),
    band(251, 350, 201, 300),
    band(351, 430, 301, 400),
    band(431, 600, 401, 500),
  ],
  no2: [
    band(0, 40, 0, 50),
    band(41, 80, 51, 100),
    band(81, 180, 101, 200),
    band(181, 280, 201, 300),
    band(281, 400, 301, 400),
    band(401, 800, 401, 500),
  ],
  o3: [
    band(0, 50, 0, 50),
    band(51, 100, 51, 100),
    band(101, 168, 101, 200),
    band(169, 208, 201, 300),
    band(209, 748, 301, 400),
    band(749, 1000, 401, 500),
  ],
};

/** µg/m³ per ppb at 25 °C and 1 atm. */
export const UG_PER_PPB = { no2: 1.88, o3: 1.96 } as const;
