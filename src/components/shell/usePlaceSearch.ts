/**
 * City search for the command menu. Requests are debounced and aborted when the query changes,
 * and nothing is fetched while the menu is closed or the query is too short to be useful.
 */
import { useEffect, useState } from 'react';
import { searchPlaces, type GeoResult } from '@/lib/air/openMeteo';

const MIN_SEARCH_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 250;

/** What the command menu knows about the city search for the current query. */
export interface PlaceSearch {
  places: GeoResult[];
  searching: boolean;
  /** True once a search for exactly this query has finished with nothing found. */
  noMatch: boolean;
}

/** Debounced, abortable city search that only runs while the menu is open. */
export function usePlaceSearch(query: string, open: boolean): PlaceSearch {
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  /** The query whose search has finished, so "no match" never flashes while typing. */
  const [searched, setSearched] = useState('');

  const term = query.trim();
  const searchable = open && term.length >= MIN_SEARCH_CHARS;
  // Short or closed queries show nothing; the last results stay in state for the next search.
  const places = searchable ? results : [];

  useEffect(() => {
    if (!searchable) return;
    const q = term;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      searchPlaces(q, { signal: ctrl.signal })
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => {
          setSearching(false);
          if (!ctrl.signal.aborted) setSearched(q);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term, searchable]);

  const noMatch =
    term.length >= MIN_SEARCH_CHARS && !searching && searched === term && places.length === 0;
  return { places, searching, noMatch };
}
