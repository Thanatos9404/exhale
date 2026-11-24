/**
 * Hand-off of a question from the command menu to the Assistant page. Each question is delivered
 * once, however often the page re-renders while the chat is busy.
 */
import { useEffect, useEffectEvent } from 'react';
import { useCommandMenu } from '@/components/shell/CommandMenu';

/**
 * Receives a question handed over from the command menu, once per hand-off. The effect only
 * re-runs when a new question arrives; acting on it is an Effect Event, so it always sees the
 * latest chat state without re-triggering the effect.
 */
export function usePendingQuestion(onQuestion: (question: string) => void): void {
  const { pendingQuestion, takePendingQuestion } = useCommandMenu();
  const deliver = useEffectEvent(onQuestion);
  useEffect(() => {
    if (!pendingQuestion) return;
    const q = takePendingQuestion();
    if (q) deliver(q);
  }, [pendingQuestion, takePendingQuestion]);
}
