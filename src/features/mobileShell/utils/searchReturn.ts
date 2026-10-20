/**
 * Touch shell: back from a search result returns to the search. Opening a hit remembers the
 * query and the page the search lay over (its history key); stepping back onto exactly that
 * page reopens the search with the same query (Android back button, iOS swipe back). Moving
 * on through the tabs forgets it.
 */
interface SearchReturn {
  query: string;
  /** `location.key` of the page under the search overlay. */
  key: string;
}

let pending: SearchReturn | null = null;

export function rememberSearchReturn(query: string, key: string): void {
  const trimmed = query.trim();
  pending = trimmed ? { query: trimmed, key } : null;
}

export function forgetSearchReturn(): void {
  pending = null;
}

/** The query to reopen the search with when a back step lands on `key`, once. */
export function takeSearchReturn(key: string, isBackStep: boolean): string | null {
  if (!pending || !isBackStep || pending.key !== key) return null;
  const { query } = pending;
  pending = null;
  return query;
}
