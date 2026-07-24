// lib/paging.ts
// Real paging for lists that outgrow a screen (V62).
//
// V61 capped the big lists at 1,000 rows with an honest banner. That kept the
// product fast but told a shop with 4,000 contacts that 3,000 of them were
// unreachable. This closes it — using KEYSET paging, not OFFSET.
//
// Why keyset: `offset=3000` makes Postgres walk and discard 3,000 rows on
// every page, so the deeper you go the slower it gets — and if someone adds a
// contact while you're reading, offset paging silently shows you a duplicate
// or skips a row. Keyset asks "give me the next N older than this cursor",
// which is one index seek regardless of depth and stable under writes.
//
// The cursor is the ordering column's value from the last row of the previous
// page — opaque to the client, meaningless to guess, and carrying no identity.

export const PAGE_SIZE = 100;

export type PageRequest = { cursor?: string | null; limit?: number };
export type PageMeta = { nextCursor: string | null; hasMore: boolean; pageSize: number };

/** Clamp a client-supplied limit into something sane. */
export function pageLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return PAGE_SIZE;
  return Math.min(Math.max(Math.floor(n), 10), 200);
}

/** The PostgREST fragment for a descending keyset page, always `&`-prefixed.
 *  Asks for one extra row so the caller can tell whether more exist without
 *  a second count query. */
export function pageFilter(column: string, cursor: string | null | undefined, limit: number): string {
  const cur = cursor ? `&${column}=lt.${encodeURIComponent(cursor)}` : "";
  return `${cur}&order=${column}.desc&limit=${limit + 1}`;
}

/** Split the over-fetched rows into a page plus its cursor. */
export function takePage<T extends Record<string, any>>(rows: T[], column: string, limit: number): { rows: T[]; meta: PageMeta } {
  const list = Array.isArray(rows) ? rows : [];
  const hasMore = list.length > limit;
  const page = hasMore ? list.slice(0, limit) : list;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? String(last[column] ?? "") || null : null;
  return { rows: page, meta: { nextCursor, hasMore, pageSize: limit } };
}
