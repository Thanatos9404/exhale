/**
 * The app frame and its routes. Overview ships in the first load; every other page, the command
 * dialog and the toaster arrive when they are first needed.
 */
import { lazy, Suspense, useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { Footer, Header, PageBody, PageHeader, Tabs } from '@/components/shell/Shell';
import { CommandMenuProvider } from '@/components/shell/CommandMenu';
import { ToastHost } from '@/components/shell/ToastHost';
import { LoadingCard, EmptyState } from '@/components/states';
import { buttonStyles } from '@/components/ui/Button';
import { useAppState } from '@/state/AppState';
import { ROUTES } from '@/config';
import Overview from '@/pages/Overview';

// Overview ships in the main bundle; every other page loads on first visit.
const Forecast = lazy(() => import('@/pages/Forecast'));
const Routine = lazy(() => import('@/pages/Routine'));
const Impact = lazy(() => import('@/pages/Impact'));
const Indoor = lazy(() => import('@/pages/Indoor'));
const Assistant = lazy(() => import('@/pages/Assistant'));
const Settings = lazy(() => import('@/pages/Settings'));

function useDocumentTitle() {
  const [location] = useLocation();
  useEffect(() => {
    const route = ROUTES.find((r) =>
      r.path === '/' ? location === '/' : location.startsWith(r.path),
    );
    document.title =
      route && route.path !== '/'
        ? `${route.label} · Exhale`
        : 'Exhale · Air observability for families';
    window.scrollTo({ top: 0 });
  }, [location]);
}

function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <PageBody>
        <EmptyState
          title="Nothing here"
          body="That page does not exist. Head back to the overview to see your air."
          action={
            <a href="/" className={buttonStyles('primary', 'sm')}>
              Go to overview
            </a>
          }
        />
      </PageBody>
    </>
  );
}

/**
 * Puts keyboard focus on the page content when the skip link is used. Browsers do this for a
 * fragment link on their own; doing it here as well makes the move certain everywhere.
 */
function focusMain() {
  document.getElementById('main')?.focus();
}

/** The app frame: header, tabs, the routed page, footer and toasts, inside the command menu. */
export default function App() {
  useDocumentTitle();
  const { theme } = useAppState();
  return (
    <CommandMenuProvider>
      <a
        href="#main"
        onClick={focusMain}
        className="sr-only z-[60] rounded-md bg-fg px-3 py-2 text-sm font-medium text-background focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Header />
      <Tabs />
      <main id="main" tabIndex={-1} className="min-h-[70dvh] outline-none">
        <Suspense
          fallback={
            <PageBody>
              <LoadingCard label="Loading page" className="mt-10 h-[360px]" />
            </PageBody>
          }
        >
          <Switch>
            <Route path="/" component={Overview} />
            <Route path="/forecast" component={Forecast} />
            <Route path="/routine" component={Routine} />
            <Route path="/impact" component={Impact} />
            <Route path="/indoor" component={Indoor} />
            <Route path="/assistant" component={Assistant} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </main>
      <Footer />
      <ToastHost theme={theme} />
    </CommandMenuProvider>
  );
}
