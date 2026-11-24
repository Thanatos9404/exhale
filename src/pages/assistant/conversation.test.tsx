import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatMessage } from '@/lib/apiTypes';
import { Composer } from './Composer';
import { Conversation } from './Conversation';
import { frameBatch } from './frameBatch';

/**
 * Counts how often each answer's Markdown is rendered and committed (an effect with no
 * dependency list runs after every such render). Markdown sits inside `Message`, so a count that
 * does not move proves the message itself did not re-render.
 */
const { markdownRenders } = vi.hoisted(() => ({ markdownRenders: new Map<string, number>() }));

vi.mock('react-markdown', () => ({
  default: function CountingMarkdown({ children }: { children: string }) {
    useEffect(() => {
      markdownRenders.set(children, (markdownRenders.get(children) ?? 0) + 1);
    });
    return <p>{children}</p>;
  },
}));

const HISTORY: ChatMessage[] = [
  { role: 'user', text: 'When should we air the flat?' },
  { role: 'model', text: 'After 1 pm, once the lid lifts.' },
  { role: 'user', text: 'And tomorrow?' },
];

beforeEach(() => markdownRenders.clear());

describe('Conversation', () => {
  it('does not re-render finished messages while another answer streams', async () => {
    const view = render(<Conversation messages={HISTORY} streaming="" empty={null} />);
    await waitFor(() => expect(markdownRenders.get('After 1 pm, once the lid lifts.')).toBe(1));
    const finishedBubble = screen.getByText('After 1 pm, once the lid lifts.').closest('li');

    const chunks = ['Tomorrow', 'Tomorrow the lid', 'Tomorrow the lid breaks at noon.'];
    for (const soFar of chunks) {
      view.rerender(<Conversation messages={HISTORY} streaming={soFar} empty={null} />);
      await waitFor(() => expect(markdownRenders.get(soFar)).toBe(1));
    }

    // The streaming bubble rendered every chunk; the finished one was left alone throughout.
    for (const soFar of chunks) expect(markdownRenders.get(soFar)).toBe(1);
    expect(markdownRenders.get('After 1 pm, once the lid lifts.')).toBe(1);
    expect(screen.getByText('After 1 pm, once the lid lifts.').closest('li')).toBe(finishedBubble);
  });

  it('does not re-render any message when the parent re-renders with the same conversation', async () => {
    const view = render(<Conversation messages={HISTORY} streaming="Half an" empty={null} />);
    await waitFor(() => expect(markdownRenders.get('Half an')).toBe(1));
    const before = new Map(markdownRenders);
    view.rerender(<Conversation messages={HISTORY} streaming="Half an" empty={<p>Welcome</p>} />);
    expect(markdownRenders).toEqual(before);
  });

  it('keeps the streaming bubble when its answer becomes a finished message', async () => {
    const view = render(<Conversation messages={HISTORY} streaming="Around noon." empty={null} />);
    const arriving = (await screen.findByText('Around noon.')).closest('li');
    expect(arriving).toHaveAttribute('aria-busy', 'true');

    const finished: ChatMessage[] = [...HISTORY, { role: 'model', text: 'Around noon.' }];
    view.rerender(<Conversation messages={finished} streaming={null} empty={null} />);
    const settled = screen.getByText('Around noon.').closest('li');
    expect(settled).toBe(arriving);
    expect(settled).not.toHaveAttribute('aria-busy');
  });

  it('scrolls smoothly for a new message and instantly for streamed text', async () => {
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    const behaviours = () =>
      scroll.mock.calls.map(([options]) => (typeof options === 'object' ? options.behavior : null));
    const view = render(
      <Conversation messages={HISTORY.slice(0, 2)} streaming={null} empty={null} />,
    );
    await screen.findByText('After 1 pm, once the lid lifts.');
    scroll.mockClear();

    // A question is sent: a new message and an empty answer start together.
    view.rerender(<Conversation messages={HISTORY} streaming="" empty={null} />);
    expect(behaviours()).toEqual(['smooth']);

    scroll.mockClear();
    view.rerender(<Conversation messages={HISTORY} streaming="Tomorrow" empty={null} />);
    view.rerender(<Conversation messages={HISTORY} streaming="Tomorrow the lid" empty={null} />);
    expect(behaviours()).toEqual(['instant', 'instant']);
    scroll.mockRestore();
  });

  it('shows the welcome content until there is something to show', () => {
    render(<Conversation messages={[]} streaming={null} empty={<p>Ask about your air</p>} />);
    expect(screen.getByText('Ask about your air')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});

describe('Composer', () => {
  const props = { search: false, onSearchChange: () => {}, busy: false, onStop: () => {} };

  it('keeps the draft to itself and hands it over on Enter', async () => {
    const onSend = vi.fn();
    render(<Composer {...props} reset={{ id: 0, text: '' }} onSend={onSend} />);
    const box = screen.getByRole('textbox', { name: 'Ask Exhale' });
    await userEvent.type(box, 'Is it safe to run?');
    expect(box).toHaveValue('Is it safe to run?');
    expect(onSend).not.toHaveBeenCalled();

    await userEvent.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledExactlyOnceWith('Is it safe to run?');
  });

  it('replaces the draft when a reset arrives: emptied after a send, restored after a failure', () => {
    const view = render(<Composer {...props} reset={{ id: 0, text: '' }} onSend={() => {}} />);
    const box = screen.getByRole('textbox', { name: 'Ask Exhale' });
    fireEvent.change(box, { target: { value: 'Is it safe to run?' } });

    view.rerender(<Composer {...props} reset={{ id: 1, text: '' }} onSend={() => {}} />);
    expect(box).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled();

    view.rerender(
      <Composer {...props} reset={{ id: 2, text: 'Is it safe to run?' }} onSend={() => {}} />,
    );
    expect(box).toHaveValue('Is it safe to run?');

    // The same reset seen again changes nothing: typing is not overwritten by a re-render.
    fireEvent.change(box, { target: { value: 'Is it safe to run now?' } });
    view.rerender(
      <Composer {...props} reset={{ id: 2, text: 'Is it safe to run?' }} onSend={() => {}} />,
    );
    expect(box).toHaveValue('Is it safe to run now?');
  });
});

describe('frameBatch', () => {
  let frames: FrameRequestCallback[] = [];
  const runFrame = () => {
    const due = frames;
    frames = [];
    due.forEach((frame) => frame(0));
  };

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('applies only the latest of many chunks, once per animation frame', () => {
    const apply = vi.fn();
    const batch = frameBatch<string>(apply);
    batch.push('Open');
    batch.push('Open the');
    batch.push('Open the windows');
    expect(apply).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);

    runFrame();
    expect(apply).toHaveBeenCalledExactlyOnceWith('Open the windows');

    batch.push('Open the windows after');
    batch.push('Open the windows after 1 pm.');
    runFrame();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith('Open the windows after 1 pm.');
  });

  it('asks for no frame while nothing is waiting', () => {
    const batch = frameBatch<string>(() => {});
    batch.push('a');
    runFrame();
    expect(frames).toHaveLength(0);
  });

  it('drops the waiting chunk when cancelled', () => {
    const apply = vi.fn();
    const batch = frameBatch<string>(apply);
    batch.push('late chunk');
    batch.cancel();
    runFrame();
    expect(apply).not.toHaveBeenCalled();

    batch.push('next answer');
    runFrame();
    expect(apply).toHaveBeenCalledExactlyOnceWith('next answer');
  });
});
