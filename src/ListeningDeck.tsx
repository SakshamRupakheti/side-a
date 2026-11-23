import { useState, type CSSProperties } from "react";
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
import { deckFrame } from "./deck-motion";
import { defaults } from "./swipe-physics";
import { useKineticSwipe } from "./useKineticSwipe";
import { SwipeLab } from "./SwipeLab";
export type PickAction = (draft: Draft, note?: boolean) => void;
const count = picks.length;

export function ListeningDeck({
  save,
  records,
  lab = false,
}: {
  save: PickAction;
  lab?: boolean;
  records?: { url: string }[];
}) {
  const [film, setFilm] = useState(false),
    [feedback, setFeedback] = useState("");
  const [settings, change] = useState(defaults);
  const { stage, motion, reading, select, move, suppressClick, handlers } =
    useKineticSwipe(settings);
  const { position, phase } = motion;
  const { active, cards } = deckFrame(position, count);
  const chosen = picks[active];
  const [feedbackFor, setFeedbackFor] = useState(chosen.url);
  async function share() {
    setFeedbackFor(chosen.url);
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
      aria-label={lab ? "Swipe lab" : "Editor's rotation"}
      aria-roledescription="carousel"
    >
      <div className="stage-heading">
        <div>
          {!lab && (
            <p className="eyebrow">
              <span className="live-dot" /> EDITOR’S ROTATION
            </p>
          )}
          <h1>
            {lab ? (
              <>
                Swipe <em>lab.</em>
              </>
            ) : (
              <>
                Keep what you <em>heard.</em>
              </>
            )}
          </h1>
        </div>
        <p className="tagline">
          {lab ? (
            "Drag to move. Flick to coast. Touch a moving cover to catch it."
          ) : (
            <>
              Your podcasts. Your discoveries.
              <br />
              {" Your archive."}
            </>
          )}
        </p>
      </div>
      <div
        ref={stage}
        className={"deck-stage" + (phase === "drag" ? " dragging" : "")}
        data-motion={phase}
        role="group"
        tabIndex={0}
        aria-label="Featured covers. Swipe or use the arrow keys."
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            move(e.key === "ArrowRight" ? 1 : -1);
          }
        }}
        {...handlers}
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
                if (!suppressClick.current || event.detail === 0)
                  select(Math.round(position + offset));
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
      {feedback && feedbackFor === chosen.url && (
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
      {lab && (
        <SwipeLab
          settings={settings}
          change={change}
          reading={reading}
          phase={phase}
        />
      )}
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
