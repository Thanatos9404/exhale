/**
 * Browser entry point: mounts the app into #root inside the providers every page depends on
 * (query cache, user state, deployments) and loads the fonts and global styles.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles/index.css';
import App from './App';
import { AppStateProvider } from './state/AppState';
import { DeploymentsProvider } from './state/Deployments';
import { defined } from './lib/assert';

/** One query cache for the whole app: a single retry, and no refetch when the tab regains focus. */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(defined(document.getElementById('root'), '#root element')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppStateProvider>
        <DeploymentsProvider>
          <App />
        </DeploymentsProvider>
      </AppStateProvider>
    </QueryClientProvider>
  </StrictMode>,
);
