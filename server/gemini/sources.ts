/**
 * The "Sources" list under a search-grounded answer. Titles and addresses come from the web, so
 * they are untrusted: only https links are listed, and anything that could break out of the
 * Markdown link syntax is removed or encoded.
 */
import type { GenerateContentResponse } from '@google/genai';

/** Only the first few cited pages are listed, so sources never crowd out the answer. */
const MAX_SOURCES = 5;

/** Longest title shown; a page title beyond this is noise in a one-line list item. */
const MAX_TITLE_CHARS = 120;

/** Characters that end or restructure a Markdown link destination, plus all whitespace. */
const LINK_BREAKERS = /[()[\]<>\\`"'\s]/g;

/** Characters that close the link text, escape the closing bracket or start inline markup. */
const TITLE_BREAKERS = /[[\]\\<>`]/g;

const percentEncode = (char: string) =>
  `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`;

/**
 * The address as a safe Markdown link destination, or null when it is not an https URL. Refusing
 * every other scheme keeps javascript:, data: and plain-http links out of the answer.
 */
export function safeLink(uri: string): string | null {
  try {
    const url = new URL(uri);
    return url.protocol === 'https:' ? url.href.replace(LINK_BREAKERS, percentEncode) : null;
  } catch {
    return null;
  }
}

/** A title that cannot close the link text or start markup: one line, no brackets or backslashes. */
function safeTitle(title: string): string {
  return title.replace(TITLE_BREAKERS, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS);
}

/** Adds the web pages Google Search grounding cites in this chunk, keyed by URL. */
export function collectSources(chunk: GenerateContentResponse, into: Map<string, string>): void {
  for (const g of chunk.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
    if (g.web?.uri) into.set(g.web.uri, g.web.title ?? g.web.uri);
  }
}

/**
 * A Markdown "Sources" list of the first cited https pages, or an empty string when none of the
 * cited addresses is safe to link.
 */
export function formatSources(sources: ReadonlyMap<string, string>): string {
  const links = [...sources.entries()]
    .flatMap(([uri, title]) => {
      const href = safeLink(uri);
      return href ? [`- [${safeTitle(title) || new URL(href).hostname}](${href})`] : [];
    })
    .slice(0, MAX_SOURCES);
  return links.length > 0 ? `\n\n**Sources**\n${links.join('\n')}` : '';
}
