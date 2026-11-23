import { useCallback, useEffect, useRef, useState } from "react";
import type { DeckChange, DeckPage } from "../shared/diary";
import { api, message } from "./ui";
import { ListeningDeck } from "./ListeningDeck";
import { anchorForChange, extendWindow } from "./collection-window";

export interface PersonalStage {
  page: DeckPage;
  focus: { slot: number; animate: boolean; arriving?: string };
  onPosition: (slot: number) => void;
  add: () => void;
  open: (id: string, edit: boolean) => void;
}

export function PersonalCollection({
  change,
  add,
  open,
}: {
  change: DeckChange | null;
  add: () => void;
  open: PersonalStage["open"];
}) {
  const [page, setPage] = useState<DeckPage | null>(null);
  const [focus, setFocus] = useState<PersonalStage["focus"]>({
    slot: 0,
    animate: false,
  });
  const [position, setPosition] = useState(0);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const busy = useRef(false);
  const applied = useRef<DeckChange | null>(null);
  const current = useRef<{ page: DeckPage | null; slot: number }>({
    page: null,
    slot: 0,
  });
  const onPosition = useCallback((slot: number) => {
    current.current.slot = slot;
    setPosition(slot);
  }, []);
  const assign = useCallback((next: DeckPage) => {
    current.current.page = next;
    setPage(next);
  }, []);

  // Only mutations and explicit retries replace the window. Normal paging leaves
  // the animation and pointer origin in the same absolute slot coordinates.
  useEffect(() => {
    const version = ++generation.current;
    busy.current = true;
    setError("");
    const { page: before, slot } = current.current;
    const local = before ? slot - before.start : -1;
    const prior = before?.entries[local];
    const mutation = change !== applied.current ? change : null;
    const id = anchorForChange(before, slot, mutation);
    async function load() {
      let next: DeckPage;
      try {
        if (mutation?.kind === "created") {
          next = await api("/me/deck");
          if (!next.entries.some((e) => e.id === mutation.id))
            next = await api(
              "/me/deck?anchor=" + encodeURIComponent(mutation.id),
            );
        } else
          next = await api(
            "/me/deck" + (id ? "?anchor=" + encodeURIComponent(id) : ""),
          );
      } catch (e) {
        if (
          !id ||
          !(e instanceof Error) ||
          e.message !== "This page or record is unavailable."
        )
          throw e;
        next = await api("/me/deck");
      }
      if (generation.current !== version) return;
      const index = next.entries.findIndex((e) => e.id === id);
      const target =
        index < 0 ? Math.max(0, next.total - 1) : next.start + index;
      applied.current = change;
      assign(next);
      current.current.slot = target;
      setPosition(target);
      setFocus({
        slot: target,
        animate:
          !!before &&
          (mutation?.kind === "created" ||
            (mutation?.kind === "deleted" && mutation.id === prior?.id)),
        arriving: mutation?.kind === "created" ? mutation.id : undefined,
      });
    }
    void load()
      .catch((e) => {
        if (generation.current === version) setError(message(e));
      })
      .finally(() => {
        if (generation.current === version) busy.current = false;
      });
    return () => {
      generation.current++;
    };
  }, [change, retry, assign]);

  useEffect(() => {
    if (!page || busy.current || error) return;
    const older = position - page.start < 6 && page.next_cursor;
    const newer =
      page.start + page.entries.length - 1 - position < 6 && page.newer_cursor;
    const cursor = older || newer;
    if (!cursor) return;
    const version = generation.current;
    busy.current = true;
    void api<DeckPage>(
      "/me/deck?cursor=" +
        encodeURIComponent(cursor) +
        (older ? "" : "&direction=newer"),
    )
      .then((next) => {
        if (version !== generation.current) return;
        const merged = extendWindow(page, next, !!older, current.current.slot);
        if (merged) assign(merged);
        else setRetry((n) => n + 1); // Another session moved the boundary. Restore by ID.
      })
      .catch((e) => {
        if (version !== generation.current) return;
        if (message(e) === "The collection changed. Reload its window.")
          setRetry((n) => n + 1);
        else setError(message(e));
      })
      .finally(() => {
        if (version === generation.current) busy.current = false;
      });
  }, [page, position, error, assign]);

  return (
    <>
      {page ? (
        <ListeningDeck personal={{ page, focus, onPosition, add, open }} />
      ) : (
        <section className="deck" aria-busy={!error}>
          <p role="status">Opening your collection…</p>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button className="plainlink" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
    </>
  );
}
