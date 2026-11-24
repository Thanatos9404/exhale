/**
 * The app's way to raise a toast without loading the toast library up front. A call asks for
 * the toaster to be mounted, waits until it is listening, and only then shows the message, so
 * nothing is lost while the code is still on its way.
 */

/** Identifies a toast, so a later call can replace it (loading, then success or error). */
export type ToastId = string;

type Kind = 'success' | 'error' | 'loading';

let wanted = false;
const wantedListeners = new Set<() => void>();
let mounted = false;
let waiting: (() => void)[] = [];
let lastId = 0;

/** Subscribes to the moment a toaster is first asked for. */
export function onToasterWanted(listener: () => void): () => void {
  wantedListeners.add(listener);
  return () => wantedListeners.delete(listener);
}

/** True once anything has asked for the toaster. */
export function isToasterWanted(): boolean {
  return wanted;
}

/** Asks for the toaster to be mounted. Safe to call any number of times. */
export function requestToaster(): void {
  if (wanted) return;
  wanted = true;
  wantedListeners.forEach((listener) => listener());
}

/** Called by the toaster once it is listening. Returns the function to call when it unmounts. */
export function toasterMounted(): () => void {
  mounted = true;
  waiting.forEach((resume) => resume());
  waiting = [];
  return () => {
    mounted = false;
  };
}

function whenMounted(): Promise<void> {
  if (mounted) return Promise.resolve();
  return new Promise((resolve) => waiting.push(resolve));
}

function show(kind: Kind, message: string, id: ToastId = `toast-${++lastId}`): ToastId {
  requestToaster();
  void Promise.all([import('./AppToaster'), whenMounted()])
    .then(([{ toast }]) => toast[kind](message, { id }))
    // A toast is feedback, never the action itself: if its code cannot load, the app carries on.
    .catch(() => undefined);
  return id;
}

/** Raises toasts. Pass the id of an earlier toast to replace it in place. */
export const notify = {
  success: (message: string, id?: ToastId) => show('success', message, id),
  error: (message: string, id?: ToastId) => show('error', message, id),
  loading: (message: string, id?: ToastId) => show('loading', message, id),
};
