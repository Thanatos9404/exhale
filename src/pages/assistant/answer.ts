/**
 * Where one question is answered. Normally the server's provider chain answers it (/api/chat:
 * Gemini, Claude Haiku, then the rules engine). With private answers on, the hybrid Firebase model
 * answers it instead: Gemini Nano inside this browser, or cloud Gemini through Firebase when Nano
 * is unavailable. On-device inference is single-turn, so a private answer sees today's plan, the
 * household and the question, but not the earlier turns.
 */
import { streamChat } from '@/lib/api';
import type { AiEngine, ChatMessage } from '@/lib/apiTypes';
import type { Place } from '@/lib/air/types';
import type { PlanResult } from '@/lib/planner/engine';
import type { Household } from '@/lib/profile/schema';
import type { PrivateAi } from '@/services/firebase';
import { EMPTY_ANSWER, contextMessages } from './chat';

/** What a private answer needs: the client, today's plan, and the Gemini Nano preparation. */
export interface PrivateRoute {
  client: PrivateAi;
  plan: PlanResult | null;
  whenPrepared: () => Promise<void>;
}

/** One question with everything the server path sends alongside it. */
export interface Question {
  text: string;
  /** The conversation so far, ending with this question. */
  history: ChatMessage[];
  place: Place;
  household: Household;
  search: boolean;
}

/** A finished answer; `engine` is set only when the hybrid Firebase model wrote it. */
export interface Answer {
  text: string;
  engine?: AiEngine;
}

/** Shown when a private question is asked before today's plan exists. */
export const PLAN_NOT_READY = 'Today’s plan is still loading. Try again in a moment.';

/** Answers one question on the private route when given one, else through the server. */
export async function answerQuestion(
  question: Question,
  route: PrivateRoute | null,
  onText: (textSoFar: string) => void,
  signal: AbortSignal,
): Promise<Answer> {
  if (!route) {
    const { place, household, history, search } = question;
    const args = { place, household, messages: contextMessages(history), search };
    const { text } = await streamChat(args, onText, signal);
    return { text };
  }
  if (!route.plan) throw new Error(PLAN_NOT_READY);
  await route.whenPrepared();
  return route.client.askOnDevice(question.text, route.plan, question.household, {
    onText,
    signal,
  });
}

/** The conversation turn for a finished answer, carrying its engine when it has one. */
export function replyFrom({ text, engine }: Answer): ChatMessage {
  const reply: ChatMessage = { role: 'model', text: text || EMPTY_ANSWER };
  return engine ? { ...reply, engine } : reply;
}

/** What the live region says when an answer is complete. */
export function readyText(engine: AiEngine | undefined): string {
  if (engine === 'on-device') return 'Answer ready, written by Gemini Nano on this device';
  if (engine === 'cloud') return 'Answer ready, written by cloud Gemini through Firebase';
  return 'Answer ready';
}
