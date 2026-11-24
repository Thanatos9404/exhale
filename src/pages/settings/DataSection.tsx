/** The settings danger zone: restore the sample household or wipe this browser's data. */
import { useState } from 'react';
import { notify } from '@/components/shell/toasts';
import { Button } from '@/components/ui/Button';
import { useAppState } from '@/state/AppState';

/** Danger zone: restore the sample household, or wipe everything stored in this browser. */
export function DataSection() {
  const { resetHousehold, clearLocalData } = useAppState();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const restoreSample = () => {
    resetHousehold();
    notify.success('Sample household restored');
  };

  // Two-step delete: the first click arms the button, the second wipes the data.
  const deleteLocalData = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    clearLocalData();
    setConfirmDelete(false);
    notify.success('All local data deleted');
  };

  return (
    <section
      id="data"
      aria-labelledby="data-title"
      className="scroll-mt-24 rounded-xl border border-red/40 bg-surface"
    >
      <div className="p-5">
        <h2 id="data-title" className="text-[15px] font-semibold text-fg">
          Data
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Exhale keeps your profile, chat and plans in this browser’s storage. Questions and plans
          are sent to the server only to compute an answer, then discarded.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-red/30 bg-red-soft px-5 py-3">
        <Button size="sm" onClick={restoreSample}>
          Restore sample household
        </Button>
        <Button size="sm" variant="error" onClick={deleteLocalData}>
          {confirmDelete ? 'Click again to delete everything' : 'Delete local data'}
        </Button>
      </div>
    </section>
  );
}
