/**
 * The Routine page's control for private explanations: the "Explain on this device (Gemini
 * Nano)" switch with its privacy note, a polite live status line, and the badge for the engine
 * that wrote the explanations shown in the rows below. Rendered only when Firebase is configured.
 */
import { EngineBadge, PrivateAiToggle } from '@/components/PrivateAi';
import { Card } from '@/components/ui/primitives';
import type { PrivateAiControls } from '@/hooks/usePrivateAi';
import { privateStatusText } from './routineView';
import type { PrivateExplainState } from './usePrivateExplanations';

interface PrivateExplainCardProps {
  controls: PrivateAiControls;
  state: PrivateExplainState;
}

/** The private-explanations switch, its status and the engine badge; nothing without Firebase. */
export function PrivateExplainCard({ controls, state }: PrivateExplainCardProps) {
  if (!controls.available) return null;
  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <PrivateAiToggle
          id="private-explain"
          label="Explain on this device (Gemini Nano)"
          checked={controls.enabled}
          onChange={controls.setEnabled}
        />
        {state.status === 'ready' && <EngineBadge engine={state.engine} />}
      </div>
      <p role="status" aria-live="polite" className="px-5 pt-2 pb-4 text-[13px] text-fg">
        {privateStatusText(controls, state)}
      </p>
    </Card>
  );
}
