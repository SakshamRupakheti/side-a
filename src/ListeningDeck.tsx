import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from "react";
import {
  BookOpen,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookmarkPlus,
  NotebookPen,
  Share2,
  Clapperboard,
} from "lucide-react";
import { coverFor, draftFromPick, picks } from "./picks";
import { statuses, type DeckEntry, type Draft } from "../shared/diary";
import { Modal } from "./ui";
import { deckFrame } from "./deck-motion";
import { defaults } from "./swipe-physics";
import { useKineticSwipe } from "./useKineticSwipe";
import { SwipeLab } from "./SwipeLab";
export type PickAction = (draft: Draft, note?: boolean) => void;
import type { PersonalStage } from "./PersonalCollection";

interface Cover {
  id: string;
  title: string;
  kind: string;
  label: string;
  byline: string;
  artwork: string;
  url: string;
  entry?: DeckEntry;
  editorial?: (typeof picks)[number];
}
const discoveryCovers: Cover[] = picks.map((p) => ({
  id: p.art,
  title: p.title,
  kind: p.kind,
  label: p.category,
  byline: p.show,
  artwork: "/art/" + p.art + ".webp",
  url: p.url,
  editorial: p,
}));
function savedCover(e: DeckEntry): Cover {
  return {
    id: e.id,
    title: e.title,
    kind: e.kind,
    label: statuses[e.status],
    byline: e.creator || e.show_name,
    artwork: coverFor(e),
    url: e.url,
    entry: e,
  };
}
function SleeveArt({
  src,
  title,
  kind,
  small = false,
}: {
  src: string;
  title: string;
  kind: string;
  small?: boolean;
}) {
  const [failed, setFailed] = useState("");
  return src && failed !== src ? (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={() => setFailed(src)}
      onLoad={(e) => {
        // YouTube may serve its tiny unavailable-image placeholder with HTTP 200.
        if (
          src.startsWith("https://i.ytimg.com/vi/") &&
          e.currentTarget.naturalWidth <= 120
        )
          setFailed(src);
      }}
    />
  ) : (
    <span className={small ? "mini-sleeve" : "type-sleeve"} aria-hidden="true">
      <small>{kind}</small>
      <b className={title.length > 80 ? "long-title" : undefined}>{title}</b>
    </span>
  );
}

export function ListeningDeck({
  save,
  records,
  personal,
  lab = false,
}: {
  save?: PickAction;
  personal?: PersonalStage;
  lab?: boolean;
  records?: { url: string }[];
}) {
  const [film, setFilm] = useState(false),
    [feedback, setFeedback] = useState("");
  const [settings, change] = useState(defaults);
  const page = personal?.page;
  const count = page?.total ?? discoveryCovers.length;
  const bounds = page
    ? {
        first: page.start,
        last: Math.max(page.start, page.start + page.entries.length - 1),
      }
    : undefined;
  const {
    stage,
    motion,
    reading,
    select,
    move,
    place,
    suppressClick,
    handlers,
  } = useKineticSwipe(settings, bounds, personal?.focus.slot);
  const { position, phase } = motion;
  const { active, cards } = deckFrame(position, count, bounds);
  function coverAt(index: number): Cover | undefined {
    if (!page) return discoveryCovers[index];
    const item = page.entries[index - page.start];
    return item && savedCover(item);
  }
  const chosen = coverAt(active);
  const entry = chosen?.entry;
  const url = chosen?.url ?? "";
  const focus = personal?.focus;
  const currentPosition = useRef(position);
  useLayoutEffect(() => {
    currentPosition.current = position;
  }, [position]);
  useLayoutEffect(() => {
    if (!focus) return;
    if (
      !focus.animate ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      place(focus.slot);
    else {
      if (Math.abs(currentPosition.current - focus.slot) > 4)
        place(focus.slot - 1);
      select(focus.slot);
    }
  }, [focus, place, select]);
  const [arriving, setArriving] = useState<string>();
  useEffect(() => {
    setArriving(focus?.arriving);
    if (!focus?.arriving) return;
    const timer = setTimeout(() => setArriving(undefined), 600);
    return () => clearTimeout(timer);
  }, [focus]);
  const onPosition = personal?.onPosition;
  useEffect(() => {
    if (active >= 0) onPosition?.(active);
  }, [active, onPosition]);
  const [feedbackFor, setFeedbackFor] = useState("");
  async function share() {
    setFeedback("");
    setFeedbackFor(url);
    try {
      if (navigator.share) await navigator.share({ title: chosen?.title, url });
      else {
        await navigator.clipboard.writeText(url);
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
      aria-label={
        lab ? "Swipe lab" : personal ? "Your collection" : "Discovery preview"
      }
      aria-roledescription="carousel"
    >
      <div className="stage-heading">
        <div>
          {!lab && (
            <p className="eyebrow">
              <span className="live-dot" />{" "}
              {personal ? "YOUR COLLECTION" : "DISCOVERY PREVIEW"}
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
        aria-label={
          (personal ? "Your saved covers." : "Featured covers.") +
          " Swipe or use the arrow keys."
        }
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && e.key === "Enter" && entry) {
            e.preventDefault();
            if (!e.repeat) personal?.open(entry.id, false);
          }
          if (count > 1 && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            e.preventDefault();
            move(e.key === "ArrowRight" ? 1 : -1);
          }
        }}
        {...handlers}
      >
        <div className="lamp" />
        <div key={active} className="pulse" />
        {personal && !count && (
          <div className="empty-sleeve">
            <span>Your collection starts with one.</span>
            <button className="button" onClick={personal.add}>
              Add your first listen
            </button>
            <a href="/import" className="plainlink">
              Import listening history
            </a>
          </div>
        )}
        {cards.map(
          ({ index: i, offset, depth: dist, stride, clearance, layer }) => {
            const cover = coverAt(i);
            if (!cover) return null;
            const item = cover.entry;
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
                className={
                  "sleeve" + (arriving === cover.id ? " sleeve-arriving" : "")
                }
                style={style}
                key={cover.id}
                tabIndex={-1}
                aria-label={
                  (item && i === active ? "Open record " : "Select ") +
                  cover.title
                }
                aria-pressed={i === active}
                aria-hidden={dist >= 3}
                onClick={(event) => {
                  if (suppressClick.current && event.detail !== 0) return;
                  if (item && i === active) personal?.open(item.id, false);
                  else select(item ? i : Math.round(position + offset));
                }}
              >
                <SleeveArt
                  src={cover.artwork}
                  title={cover.title}
                  kind={cover.kind}
                />
                <span className="sleeve-label">
                  {cover.byline || cover.kind}
                </span>
              </button>
            );
          },
        )}
      </div>
      {chosen && (
        <div className="rail">
          <SleeveArt
            small
            src={chosen.artwork}
            title={chosen.title}
            kind={chosen.kind}
          />
          <div className="now" aria-live="polite">
            <small>
              {chosen.kind} · {chosen.label}
            </small>
            <b>{chosen.title}</b>
            <span>{chosen.byline}</span>
          </div>
          <div className="rail-actions">
            {entry ? (
              <button onClick={() => personal?.open(entry.id, false)}>
                <BookOpen />
                Open record
              </button>
            ) : (
              <button
                onClick={() =>
                  chosen.editorial && save?.(draftFromPick(chosen.editorial))
                }
              >
                <BookmarkPlus />
                {records?.some((e) => e.url === url) ? "Edit entry" : "Save"}
              </button>
            )}
            {url && (
              <a href={url} target="_blank" rel="noreferrer">
                <ArrowUpRight />
                Open source
              </a>
            )}
            <button
              onClick={() =>
                entry
                  ? personal?.open(entry.id, true)
                  : chosen.editorial &&
                    save?.(draftFromPick(chosen.editorial), true)
              }
            >
              <NotebookPen />
              {entry ? "Edit" : "Add note"}
            </button>
            {url && (
              <button
                onClick={() => void share()}
                aria-label={entry ? "Share original source" : "Share"}
              >
                <Share2 />
                Share
              </button>
            )}
          </div>
        </div>
      )}
      {feedback && feedbackFor === url && (
        <p className="share-feedback" role="status">
          {feedback}
        </p>
      )}
      <div className="deck-foot">
        {personal ? (
          <span className="story-count">
            {count} {count === 1 ? "story" : "stories"} collected
          </span>
        ) : (
          <button onClick={() => setFilm(true)} className="film-button">
            <Clapperboard size={15} /> Watch the short
          </button>
        )}
        <div className="deck-pager">
          <button
            disabled={!!personal && active <= 0}
            aria-label="Previous listen"
            onClick={() => move(-1)}
          >
            <ArrowLeft />
          </button>
          <span>
            {String(active + 1).padStart(personal ? 3 : 2, "0")} /{" "}
            {String(count).padStart(personal ? 3 : 2, "0")}
          </span>
          <button
            disabled={!!personal && active >= count - 1}
            aria-label="Next listen"
            onClick={() => move(1)}
          >
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
        <Modal title="suni. short" close={() => setFilm(false)}>
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
