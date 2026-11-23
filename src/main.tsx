import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles/index.css';
import App from './App';
import { AppStateProvider } from './state/AppState';
import { DeploymentsProvider } from './state/Deployments';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
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
