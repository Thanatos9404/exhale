/** The public source repository, linked from the footer. */
export const REPO_URL = 'https://github.com/Thanatos9404/exhale';

/** Every page of the app, in tab order. */
export const ROUTES = [
  { path: '/', label: 'Overview' },
  { path: '/forecast', label: 'Forecast' },
  { path: '/routine', label: 'Routine' },
  { path: '/impact', label: 'Impact' },
  { path: '/indoor', label: 'Indoor lab' },
  { path: '/assistant', label: 'Assistant' },
  { path: '/settings', label: 'Settings' },
] as const;

/** The path of any page in `ROUTES`. */
export type RoutePath = (typeof ROUTES)[number]['path'];
