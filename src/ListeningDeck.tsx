import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookmarkPlus,
  NotebookPen,
  Share2,
  Clapperboard,
} from "lucide-react";
import { draftFromPick, picks } from "./picks";
import type { Draft } from "../shared/diary";
import { Modal } from "./ui";
export type PickAction = (draft: Draft, note?: boolean) => void;
const count = picks.length;
const wrap = (index: number) => ((index % count) + count) % count;
export function ListeningDeck({
  save,
  records,
}: {
  save: PickAction;
  records?: { url: string }[];
}) {
  const [active, setActive] = useState(0),
    [offset, setOffset] = useState(0),
    [film, setFilm] = useState(false),
    [feedback, setFeedback] = useState("");
  const stage = useRef<HTMLDivElement>(null),
    gesture = useRef<{
      x: number;
      y: number;
      time: number;
      width: number;
    } | null>(null);
  const frame = useRef(0),
    dragged = useRef(false);
  const chosen = picks[active];
  function select(index: number) {
    setActive(wrap(index));
    setFeedback("");
  }
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let last = 0,
      total = 0,
      previous = 0;
    function wheel(e: WheelEvent) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const now = performance.now();
      if (now - previous > 170) total = 0;
      previous = now;
      if (now - last < 320) return;
      total += e.deltaX;
      if (Math.abs(total) > 32) {
        const direction = Math.sign(total);
        setActive((i) => wrap(i + direction));
        setFeedback("");
        last = now;
        total = 0;
      }
    }
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", wheel);
      cancelAnimationFrame(frame.current);
    };
  }, []);
  function down(e: PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary || e.button !== 0) return;
    dragged.current = false;
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
      width: e.currentTarget.clientWidth,
    };
  }
  function drag(e: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start || !e.isPrimary) return;
    const dx = e.clientX - start.x,
      dy = e.clientY - start.y;
    if (!dragged.current && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 9) {
      gesture.current = null;
      return;
    }
    if (Math.abs(dx) < 6 && !dragged.current) return;
    dragged.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const fraction = Math.max(
      -1,
      Math.min(1, dx / Math.min(250, start.width * 0.48)),
    );
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setOffset(fraction));
  }
  function release(e: PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary) return;
    cancelAnimationFrame(frame.current);
    const start = gesture.current;
    gesture.current = null;
    setOffset(0);
    if (!start || !dragged.current || e.type === "pointercancel") return;
    const dx = e.clientX - start.x;
    const velocity = Math.abs(dx) / Math.max(1, performance.now() - start.time);
    if (
      Math.abs(dx) > Math.min(62, start.width * 0.15) ||
      (Math.abs(dx) > 17 && velocity > 0.32)
    )
      select(active - Math.sign(dx));
  }
  async function share() {
    try {
      if (navigator.share)
        await navigator.share({ title: chosen.title, url: chosen.url });
      else {
        await navigator.clipboard.writeText(chosen.url);
        setFeedback("Source link copied.");
      }
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setFeedback("Use Open source to copy the link from your browser.");
    }
  }
  return (
    <section
      className={"deck tone-" + (active % 3)}
      aria-label="Editor's rotation"
      aria-roledescription="carousel"
    >
      <div className="stage-heading">
        <div>
          <p className="eyebrow">
            <span className="live-dot" /> EDITOR’S ROTATION
          </p>
          <h1>
            Keep what you <em>heard.</em>
          </h1>
        </div>
        <p className="tagline">
          Your podcasts. Your discoveries.
          <br />
          {" Your archive."}
        </p>
      </div>
      <div
        ref={stage}
        className={"deck-stage" + (offset ? " dragging" : "")}
        role="group"
        tabIndex={0}
        aria-label="Featured covers. Swipe or use the arrow keys."
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            select(active + (e.key === "ArrowRight" ? 1 : -1));
          }
        }}
        onPointerDown={down}
        onPointerMove={drag}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={() => {
          if (!dragged.current) gesture.current = null;
        }}
      >
        <div className="lamp" />
        <div key={active} className="pulse" />
        {picks.map((p, i) => {
          let slot = wrap(i - active);
          if (slot > count / 2) slot -= count;
          const pos = slot + offset,
            dist = Math.abs(pos);
          const style = {
            "--pos": pos,
            "--depth": dist,
            zIndex: 10 - Math.round(dist * 2),
            opacity: Math.min(1, Math.max(0, 3 - dist)),
            visibility: dist >= 3 ? "hidden" : "visible",
          } as CSSProperties;
          return (
            <button
              className="sleeve"
              style={style}
              key={p.art}
              tabIndex={-1}
              aria-label={"Select " + p.title}
              aria-hidden={Math.abs(slot) > 2}
              onClick={() => {
                if (!dragged.current) select(i);
              }}
            >
              <img src={"/art/" + p.art + ".webp"} draggable={false} alt="" />
              <span className="sleeve-label">{p.show}</span>
            </button>
          );
        })}
      </div>
      <div className="rail">
        <img
          src={"/art/" + chosen.art + ".webp"}
          width="42"
          height="42"
          alt=""
        />
        <div className="now" aria-live="polite">
          <small>
            {chosen.kind} · {chosen.category}
          </small>
          <b>{chosen.title}</b>
          <span>{chosen.show}</span>
        </div>
        <div className="rail-actions">
          <button onClick={() => save(draftFromPick(chosen))}>
            <BookmarkPlus />
            {records?.some((e) => e.url === chosen.url) ? "Edit entry" : "Save"}
          </button>
          <a href={chosen.url} target="_blank" rel="noreferrer">
            <ArrowUpRight />
            Open source
          </a>
          <button onClick={() => save(draftFromPick(chosen), true)}>
            <NotebookPen />
            Add note
          </button>
          <button onClick={() => void share()}>
            <Share2 />
            Share
          </button>
        </div>
      </div>
      {feedback && (
        <p className="share-feedback" role="status">
          {feedback}
        </p>
      )}
      <div className="deck-foot">
        <button onClick={() => setFilm(true)} className="film-button">
          <Clapperboard size={15} /> Watch the short
        </button>
        <div className="deck-pager">
          <button
            aria-label="Previous listen"
            onClick={() => select(active - 1)}
          >
            <ArrowLeft />
          </button>
          <span>
            {String(active + 1).padStart(2, "0")} /{" "}
            {String(count).padStart(2, "0")}
          </span>
          <button aria-label="Next listen" onClick={() => select(active + 1)}>
            <ArrowRight />
          </button>
        </div>
      </div>
      {film && (
        <Modal title="PoFolio short" close={() => setFilm(false)}>
          <video
            className="short-film"
            controls
            autoPlay
            muted
            playsInline
            src="/art/intro.mp4"
            aria-label="Keep a listening diary. Save what stays with you. Pass it on."
          />
        </Modal>
      )}
    </section>
  );
}
