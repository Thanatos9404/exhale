/**
 * The card every Settings section sits in, and its save footer. The card is also the anchor the
 * side navigation jumps to and a labelled region for screen readers.
 */
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardFooter } from '@/components/ui/primitives';
import type { HouseholdForm } from './useHouseholdDraft';

interface SectionProps {
  id: string;
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
}

/** A titled settings card that doubles as a navigation anchor and a labelled region. */
export function Section({ id, title, description, footer, children }: SectionProps) {
  return (
    <Card id={id} className="scroll-mt-24" aria-labelledby={`${id}-title`} role="region">
      <div className="p-5">
        <h2 id={`${id}-title`} className="text-[15px] font-semibold text-fg">
          {title}
        </h2>
        <p className="mt-1 mb-5 text-[13px] text-muted">{description}</p>
        {children}
      </div>
      {footer}
    </Card>
  );
}

interface SaveFooterProps {
  hint: string;
  form: HouseholdForm;
}

/** Card footer with a short hint and the Save button, enabled only when there is something to save. */
export function SaveFooter({ hint, form }: SaveFooterProps) {
  return (
    <CardFooter>
      <span>{hint}</span>
      <Button size="sm" variant="primary" onClick={form.save} disabled={!form.dirty}>
        Save
      </Button>
    </CardFooter>
  );
}
