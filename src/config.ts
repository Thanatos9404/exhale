export const REPO_URL = 'https://github.com/Thanatos9404/exhale';

export const ROUTES = [
  { path: '/', label: 'Overview' },
  { path: '/forecast', label: 'Forecast' },
  { path: '/routine', label: 'Routine' },
  { path: '/impact', label: 'Impact' },
  { path: '/indoor', label: 'Indoor lab' },
  { path: '/assistant', label: 'Assistant' },
  { path: '/settings', label: 'Settings' },
] as const;

export type RoutePath = (typeof ROUTES)[number]['path'];
