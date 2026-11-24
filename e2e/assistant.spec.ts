/**
 * Journey 7, Assistant: a question streams the mocked answer into the conversation, Clear chat
 * empties it, and a failed request reports the error and hands the question back. The answer
 * always comes from the `/api/chat` fixture, never from a real model.
 */
import type { Page } from '@playwright/test';
import { definition, openApp, toast } from './support/app';
import { CHAT_ANSWER_TEXT, MODELS } from './support/fixtures';
import { expect, test } from './support/test';

const QUESTION = 'When should we open the windows today?';

const conversation = (page: Page) => page.getByRole('log', { name: 'Conversation' });
const composer = (page: Page) => page.getByRole('textbox', { name: 'Ask Exhale' });
const send = (page: Page) => page.getByRole('button', { name: 'Send question' });
const clear = (page: Page) => page.getByRole('button', { name: 'Clear chat' });
const welcome = (page: Page) => page.getByRole('heading', { name: 'Ask about your air' });

test.describe('Assistant', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, '/assistant');
    await expect(welcome(page)).toBeVisible();
  });

  test('a question streams the mocked answer into the conversation', async ({ page, network }) => {
    await expect(send(page)).toBeDisabled();
    await composer(page).fill(QUESTION);
    await send(page).click();

    await expect(conversation(page).getByRole('listitem')).toHaveCount(2);
    await expect(conversation(page).getByRole('listitem').first()).toHaveText(QUESTION);
    await expect(conversation(page).getByRole('listitem').last()).toHaveText(CHAT_ANSWER_TEXT);
    // The Markdown in the answer is rendered, not shown as asterisks.
    await expect(conversation(page).getByRole('strong')).toHaveText('13:00');
    await expect(page.getByRole('status').filter({ hasText: 'Answer ready' })).toBeAttached();
    await expect(composer(page)).toHaveValue('');
    await expect(welcome(page)).toBeHidden();

    // The question went to the fixture endpoint with the conversation and the selected place.
    expect(network.calls.chat).toBe(1);
    expect(network.chatRequests[0]).toMatchObject({
      messages: [{ role: 'user', text: QUESTION }],
      place: { label: 'New Delhi, India' },
      search: false,
    });
  });

  test('Enter sends, and the conversation survives a reload until it is cleared', async ({
    page,
  }) => {
    await composer(page).fill(QUESTION);
    await composer(page).press('Enter');
    await expect(conversation(page)).toContainText(CHAT_ANSWER_TEXT);

    await page.reload();
    await expect(conversation(page)).toContainText(QUESTION);
    await expect(conversation(page)).toContainText(CHAT_ANSWER_TEXT);

    await clear(page).click();

    await expect(welcome(page)).toBeVisible();
    await expect(conversation(page)).not.toContainText(QUESTION);
    await expect(conversation(page)).not.toContainText(CHAT_ANSWER_TEXT);
    await expect(clear(page)).toBeHidden();

    await page.reload();
    await expect(welcome(page)).toBeVisible();
  });

  test('a starter question is answered in one click', async ({ page, network }) => {
    const starter = 'How do I build a box-fan air filter at home?';
    await page.getByRole('button', { name: starter }).click();

    await expect(conversation(page).getByRole('listitem').first()).toHaveText(starter);
    await expect(conversation(page)).toContainText(CHAT_ANSWER_TEXT);
    expect(network.calls.chat).toBe(1);
  });

  test('a failed request shows the error and hands the question back', async ({
    page,
    network,
  }) => {
    network.chat = { status: 503, error: 'The assistant is busy. Try again in a minute.' };
    await composer(page).fill(QUESTION);
    await send(page).click();

    await expect(toast(page, 'The assistant is busy. Try again in a minute.')).toBeVisible();
    await expect(composer(page)).toHaveValue(QUESTION);
    await expect(welcome(page)).toBeVisible();
    await expect(conversation(page)).not.toContainText(QUESTION);

    // Sending again once the server recovers gets the answer.
    network.chat = 'Fixture retry: the answer arrived on the second attempt.';
    await send(page).click();
    await expect(conversation(page)).toContainText('the answer arrived on the second attempt');
    expect(network.calls.chat).toBe(2);
  });

  test('shows what the assistant knows about the household and the air', async ({ page }) => {
    await expect(definition(page, 'Model')).toHaveText(MODELS.gemini);
    await expect(definition(page, 'Place')).toHaveText('New Delhi, India');
    await expect(definition(page, 'Air now')).toContainText('PM2.5 170 µg/m³');
    await expect(definition(page, 'Smog lid')).toContainText('at 30 m');
    await expect(definition(page, 'Household')).toContainText('Kid · child, asthma');
  });
});
