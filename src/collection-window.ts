import type { DeckPage, DeckEntry, DeckChange } from "../shared/diary";

const cursorFor = (entry: DeckEntry, index: number, revision: number) =>
  btoa(JSON.stringify([entry.created_at, entry.id, index, revision]));

// Pages and motion share absolute chronological indices. Evict only far covers.
export function extendWindow(
  page: DeckPage,
  next: DeckPage,
  older: boolean,
  selected: number,
): DeckPage | null {
  const [left, right] = older ? [next, page] : [page, next];
  if (
    page.revision !== next.revision ||
    page.total !== next.total ||
    left.start + left.entries.length !== right.start ||
    !next.entries.length
  )
    return null;
  const all = [...left.entries, ...right.entries];
  if (new Set(all.map((e) => e.id)).size !== all.length) return null;
  const drop = Math.max(0, all.length - 75);
  const offset = Math.min(drop, Math.max(0, selected - left.start - 37));
  const entries = all.slice(offset, offset + 75);
  const start = left.start + offset;
  return {
    entries,
    start,
    total: page.total,
    revision: page.revision,
    next_cursor: start ? cursorFor(entries[0], start, page.revision) : null,
    newer_cursor:
      start + entries.length < page.total
        ? cursorFor(
            entries[entries.length - 1],
            start + entries.length - 1,
            page.revision,
          )
        : null,
  };
}

export function anchorForChange(
  page: DeckPage | null,
  slot: number,
  mutation: DeckChange | null,
) {
  if (mutation?.kind === "created") return mutation.id;
  if (!page) return undefined;
  const index = slot - page.start;
  const current = page.entries[index];
  if (mutation?.kind === "deleted" && current?.id === mutation.id)
    return (page.entries[index + 1] ?? page.entries[index - 1])?.id;
  return current?.id;
}
