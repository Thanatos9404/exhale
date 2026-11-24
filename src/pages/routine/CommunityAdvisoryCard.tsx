/**
 * "For your neighbourhood": shows today's community air bulletin in English or Hindi and lets
 * one resident copy or share it to a group chat. The wording and every figure come from
 * `lib/community`; this card only previews the message and hands it to the clipboard.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardFooter, CardHeader, Segmented } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import {
  buildCommunityAdvisory,
  type AdvisoryLanguage,
  type AdvisoryPlace,
  type CommunityAdvisory,
  type PublicPlanFacts,
} from '@/lib/community/advisory';

/** What the last copy attempt did; drives the button label and the announcement. */
type CopyStatus = 'idle' | 'copied' | 'failed';

/** How long the "Copied" confirmation stays up, ms. */
const COPIED_MS = 4000;

const LANGUAGES: { value: AdvisoryLanguage; label: ReactNode }[] = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: <span lang="hi">हिन्दी</span> },
];

const STATUS_TEXT: Record<CopyStatus, string> = {
  idle: '',
  copied: 'Copied. Paste it into your group chat.',
  failed:
    'Could not copy automatically. The message is selected: press Ctrl+C, or long-press on a phone, to copy it.',
};

/** Selects everything inside `node`, so a manual copy takes exactly the bulletin. */
function selectContents(node: HTMLElement | null) {
  if (node) window.getSelection()?.selectAllChildren(node);
}

/**
 * True when the person closed the share sheet themselves, which is not a failure. Checked by
 * name: a DOMException from another realm is not an `Error` of this one.
 */
function isDismissal(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}

/**
 * Copying and sharing one bulletin. A failed copy leaves the message selected so it can still
 * be copied by hand; a failed share falls back to copying.
 */
function useBulletinActions(advisory: CommunityAdvisory) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (status !== 'copied') return;
    const timer = setTimeout(() => setStatus('idle'), COPIED_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(advisory.text);
      setStatus('copied');
    } catch {
      // No clipboard access (blocked, or an insecure page): leave the text ready to copy by hand.
      selectContents(messageRef.current);
      setStatus('failed');
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: advisory.title, text: advisory.text });
    } catch (error) {
      if (!isDismissal(error)) await copy();
    }
  };

  return { status, messageRef, copy, share, reset: () => setStatus('idle') };
}

interface BulletinFooterProps {
  status: CopyStatus;
  onCopy: () => void;
  onShare: () => void;
}

/** The announced copy status, and the Copy and Share buttons. */
function BulletinFooter({ status, onCopy, onShare }: BulletinFooterProps) {
  const copied = status === 'copied';
  const CopyIcon = copied ? Check : Copy;
  return (
    <CardFooter>
      <p
        role="status"
        aria-live="polite"
        className={cn('min-w-0 flex-1 basis-56', copied ? 'text-green' : 'text-fg')}
      >
        {STATUS_TEXT[status]}
      </p>
      <div className="flex flex-wrap gap-2">
        {'share' in navigator && (
          <Button
            variant="tertiary"
            leading={<Share2 size={15} aria-hidden="true" />}
            onClick={onShare}
          >
            Share
          </Button>
        )}
        <Button leading={<CopyIcon size={15} aria-hidden="true" />} onClick={onCopy}>
          {copied ? 'Copied' : 'Copy message'}
        </Button>
      </div>
    </CardFooter>
  );
}

interface CommunityAdvisoryCardProps {
  /** The public facts of the plan on screen; nothing about the household is read. */
  plan: PublicPlanFacts;
  place: AdvisoryPlace;
}

/** A shareable air bulletin for the resident-association or school group. */
export function CommunityAdvisoryCard({ plan, place }: CommunityAdvisoryCardProps) {
  const [language, setLanguage] = useState<AdvisoryLanguage>('en');
  const advisory = buildCommunityAdvisory(plan, place, language);
  const { status, messageRef, copy, share, reset } = useBulletinActions(advisory);

  const changeLanguage = (next: AdvisoryLanguage) => {
    setLanguage(next);
    reset();
  };

  return (
    <Card className="mt-6">
      <CardHeader
        title="For your neighbourhood"
        description="A short bulletin for your resident-association or school group. It carries public air data only, nothing about your household."
        action={
          <Segmented
            label="Bulletin language"
            value={language}
            onChange={changeLanguage}
            options={LANGUAGES}
          />
        }
      />
      <section
        aria-label="Bulletin preview"
        className="mx-5 mb-5 rounded-lg border border-line bg-surface-2 p-4"
      >
        <p
          ref={messageRef}
          lang={language}
          className="max-w-[75ch] text-[13px] leading-6 break-words whitespace-pre-wrap text-fg"
        >
          {advisory.text}
        </p>
      </section>
      <BulletinFooter status={status} onCopy={() => void copy()} onShare={() => void share()} />
    </Card>
  );
}
