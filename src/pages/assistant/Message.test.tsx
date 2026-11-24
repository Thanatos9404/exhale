import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Message } from './Message';
import { httpsUrl } from './chat';

/** The Markdown renderer is a lazy chunk; its first import can take a few seconds under load. */
const LOAD = { timeout: 15_000 };

function renderAnswer(text: string) {
  return render(
    <ol>
      <Message message={{ role: 'model', text }} />
    </ol>,
  );
}

describe('links in answers', () => {
  it('renders an https link that opens safely in a new tab', async () => {
    renderAnswer('See the [CPCB bulletin](https://cpcb.nic.in/aqi-bulletin) for today.');
    const link = await screen.findByRole('link', { name: 'CPCB bulletin' }, LOAD);
    expect(link).toHaveAttribute('href', 'https://cpcb.nic.in/aqi-bulletin');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders every other kind of link as plain text', async () => {
    renderAnswer(
      [
        '[secure](https://example.org/ok)',
        '[insecure](http://example.org/plain)',
        '[mail](mailto:someone@example.org)',
        '[relative](/settings)',
        '[fragment](#data)',
        '[protocol-relative](//example.org/x)',
        '[script](javascript:alert(1))',
        '[data](data:text/html,hello)',
      ].join(' · '),
    );
    await screen.findByRole('link', { name: 'secure' }, LOAD);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    for (const label of ['insecure', 'mail', 'relative', 'fragment', 'protocol-relative']) {
      const text = screen.getByText(label, { exact: false });
      expect(text.closest('a')).toBeNull();
    }
    expect(document.querySelector('a:not([href^="https://"])')).toBeNull();
  });

  it('keeps bare https addresses out of any other scheme', () => {
    expect(httpsUrl('https://example.org/a?b=1#c')).toBe('https://example.org/a?b=1#c');
    expect(httpsUrl('HTTPS://EXAMPLE.org')).toBe('https://example.org/');
    for (const href of [
      undefined,
      '',
      'http://example.org',
      'javascript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,x',
      'mailto:a@example.org',
      'ftp://example.org',
      '/settings',
      '//example.org',
      'example.org',
    ]) {
      expect(httpsUrl(href)).toBeNull();
    }
  });
});

describe('Message', () => {
  it('shows a user message as plain text, never as Markdown', () => {
    render(
      <ol>
        <Message message={{ role: 'user', text: '[not a link](https://example.org)' }} />
      </ol>,
    );
    expect(screen.getByText('[not a link](https://example.org)')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
