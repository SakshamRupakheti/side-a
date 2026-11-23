import {
  useCallback,
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
import { deckFrame, releaseTarget, sleeveEase } from "./deck-motion";
export type PickAction = (draft: Draft, note?: boolean) => void;
const count = picks.length;

export function ListeningDeck({
  save,
  records,
}: {
  save: PickAction;
  records?: { url: string }[];
}) {
  const [position, setPosition] = useState(0),
    [dragging, setDragging] = useState(false),
    [film, setFilm] = useState(false),
    [feedback, setFeedback] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const current = useRef(0),
    target = useRef(0),
    frame = useRef(0);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    origin: number;
    stride: number;
    lastX: number;
    lastTime: number;
    velocity: number;
  } | null>(null);
  const dragged = useRef(false);
  const { active, cards } = deckFrame(position, count);
  const chosen = picks[active];
  const update = useCallback((next: number) => {
    current.current = next;
    setPosition(next);
  }, []);
  const settle = useCallback(
    (destination: number) => {
      cancelAnimationFrame(frame.current);
      target.current = destination;
      setFeedback("");
      const from = current.current;
      if (
        from === destination ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        update(destination);
        return;
      }
      const start = performance.now();
      function tick(now: number) {
        const t = Math.min(1, (now - start) / 530);
        // Sample the original sleeve easing once for the entire fan.
        const eased = sleeveEase(t);
        update(t === 1 ? destination : from + (destination - from) * eased);
        if (t < 1) frame.current = requestAnimationFrame(tick);
      }
      frame.current = requestAnimationFrame(tick);
    },
    [update],
  );
  function move(direction: number) {
    settle(target.current + direction);
  }
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let last = 0,
      total = 0,
      previous = 0;
    function wheel(e: WheelEvent) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || gesture.current) return;
      e.preventDefault();
      const now = performance.now();
      if (now - previous > 170) total = 0;
      previous = now;
      if (now - last < 320) return;
      total += e.deltaX;
      if (Math.abs(total) > 32) {
        settle(target.current + Math.sign(total));
        last = now;
        total = 0;
      }
    }
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", wheel);
      cancelAnimationFrame(frame.current);
    };
  }, [settle]);
  function down(e: PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary || e.button !== 0) return;
    cancelAnimationFrame(frame.current);
    dragged.current = false;
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      origin: current.current,
      stride: Math.min(250, e.currentTarget.clientWidth * 0.48),
      lastX: e.clientX,
      lastTime: e.timeStamp,
      velocity: 0,
    };
  }
  function drag(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (!dragged.current) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 9) {
        gesture.current = null;
        settle(Math.round(current.current));
        return;
      }
      if (Math.abs(dx) < 6) return;
      dragged.current = true;
      setDragging(true);
      setFeedback("");
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const elapsed = e.timeStamp - g.lastTime;
    if (elapsed > 0 && e.clientX !== g.lastX) {
      const sample = (g.lastX - e.clientX) / (g.stride * elapsed);
      g.velocity =
        Math.sign(sample) === Math.sign(g.velocity) && elapsed < 90
          ? 0.65 * sample + 0.35 * g.velocity
          : sample;
      g.lastTime = e.timeStamp;
      g.lastX = e.clientX;
    }
    update(g.origin - dx / g.stride);
  }
  function release(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    gesture.current = null;
    setDragging(false);
    if (!dragged.current || e.type !== "pointerup") {
      settle(Math.round(current.current));
      return;
    }
    const lastPosition = g.origin - (e.clientX - g.x) / g.stride;
    const velocity =
      g.velocity * Math.max(0, 1 - (e.timeStamp - g.lastTime) / 100);
    update(lastPosition);
    settle(releaseTarget(lastPosition, velocity, count));
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
        className={"deck-stage" + (dragging ? " dragging" : "")}
        role="group"
        tabIndex={0}
        aria-label="Featured covers. Swipe or use the arrow keys."
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            move(e.key === "ArrowRight" ? 1 : -1);
          }
        }}
        onPointerDown={down}
        onPointerMove={drag}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onPointerLeave={() => {
          if (gesture.current && !dragged.current) {
            gesture.current = null;
            settle(Math.round(current.current));
          }
        }}
      >
        <div className="lamp" />
        <div key={active} className="pulse" />
        {picks.map((p, i) => {
          const { offset, depth: dist, stride, clearance, layer } = cards[i];
          const style = {
            "--pos": offset,
            "--depth": dist,
            "--path-stride": stride,
            "--path-clearance": clearance,
            zIndex: layer,
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
              aria-pressed={i === active}
              aria-hidden={dist >= 3}
              onClick={(event) => {
                if (!dragged.current || event.detail === 0)
                  settle(Math.round(position + offset));
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
          <button aria-label="Previous listen" onClick={() => move(-1)}>
            <ArrowLeft />
          </button>
          <span>
            {String(active + 1).padStart(2, "0")} /{" "}
            {String(count).padStart(2, "0")}
          </span>
          <button aria-label="Next listen" onClick={() => move(1)}>
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
