/**
 * The assistant page: the conversation, its composer and what Exhale knows, side by side. With
 * private answers on, questions about today's plan are answered by the hybrid Firebase model.
 */
import { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/shell/Shell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/primitives';
import { useLocalPlan } from '@/hooks/useAir';
import { usePrivateAi } from '@/hooks/usePrivateAi';
import { useAppState } from '@/state/AppState';
import { Composer } from './assistant/Composer';
import { Conversation } from './assistant/Conversation';
import { KnowledgeCard } from './assistant/KnowledgeCard';
import { Welcome } from './assistant/Welcome';
import { buildSuggestions, type Suggestion } from './assistant/context';
import { useChat } from './assistant/useChat';
import { usePendingQuestion } from './assistant/usePendingQuestion';

/** The assistant page: a streaming chat grounded in live readings, the plan and the household. */
export default function Assistant() {
  const { household, place } = useAppState();
  const { plan } = useLocalPlan();
  const { available, enabled, client, whenPrepared, setEnabled } = usePrivateAi();
  const route = useMemo(
    () => (enabled && client ? { client, plan, whenPrepared } : null),
    [enabled, client, plan, whenPrepared],
  );
  const chat = useChat({ place, household }, route);
  usePendingQuestion((q) => void chat.send(q));

  const suggestions = buildSuggestions(household, place);
  const askSuggestion = (s: Suggestion) => {
    if (s.search) chat.setSearch(true);
    void chat.send(s.q, s.search || chat.search);
  };

  return (
    <>
      <PageHeader
        title="Assistant"
        description="Ask anything about your air. Answers use your live readings, your plan and your household, and quote real numbers."
        actions={
          chat.messages.length > 0 ? (
            <Button leading={<Trash2 size={14} aria-hidden="true" />} onClick={chat.clear}>
              Clear chat
            </Button>
          ) : undefined
        }
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="flex min-h-[560px] flex-col">
            <div className="sr-only" role="status" aria-live="polite">
              {chat.announce}
            </div>
            <Conversation
              messages={chat.messages}
              streaming={chat.streaming}
              empty={<Welcome plan={plan} suggestions={suggestions} onAsk={askSuggestion} />}
            />
            <Composer
              reset={chat.draftReset}
              search={chat.search}
              onSearchChange={chat.setSearch}
              busy={chat.streaming !== null}
              onSend={(text) => void chat.send(text)}
              onStop={chat.stop}
              privateMode={available ? { enabled, onChange: setEnabled } : undefined}
            />
          </Card>
          <KnowledgeCard place={place} household={household} plan={plan} />
        </div>
      </PageBody>
    </>
  );
}
