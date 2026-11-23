import type { DeckChange } from "../shared/diary";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Headphones,
  Link2,
  LockKeyhole,
  Plus,
  X,
} from "lucide-react";
import {
  blank,
  formats,
  statuses,
  type Draft,
  type Entry,
} from "../shared/diary";
import {
  clockTime,
  reflectionPrompt,
  timestampSeconds,
  type Experience,
  type Moment,
} from "../shared/experience";
import { api, ErrorText, message, Modal, useAction } from "./ui";
import { coverFor } from "./picks";

const steps = ["Listen", "Reflection", "Moments"] as const;
type Metadata = Pick<Draft, "title" | "url" | "artwork" | "creator"> &
  Pick<Experience, "duration_seconds" | "source_description"> & {
    available: boolean;
  };
type Props = {
  initial?: Draft;
  entry?: Entry;
  focusNote: boolean;
  signedIn: boolean;
  authenticate: (draft: Draft) => void;
  close: () => void;
  done: (change: DeckChange) => Promise<void>;
};

export function EntryComposer({
  initial,
  entry,
  focusNote,
  signedIn,
  authenticate,
  close,
  done,
}: Props) {
  const [draft, setDraft] = useState<Draft>(
    () =>
      entry ?? {
        ...(initial ?? blank),
        import_key: initial?.import_key ?? crypto.randomUUID(),
      },
  );
  const [step, setStep] = useState(focusNote ? 1 : 0);
  const [duration, setDuration] = useState(
    draft.experience.duration_seconds
      ? clockTime(draft.experience.duration_seconds)
      : "",
  );
  const [origin, setOrigin] = useState<
    NonNullable<Experience["duration_origin"]>
  >(draft.experience.duration_origin ?? "unknown");
  const initialValues = useRef({ draft, duration });
  const dirty =
    !!initial?.import_key ||
    initialValues.current.draft !== draft ||
    duration !== initialValues.current.duration;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const protect = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  const [hint, setHint] = useState("");
  const [invalid, setInvalid] = useState("");
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lookup = useRef(0);
  const lastImport = useRef<Metadata | null>(null);

  const status = useAction();
  const ids = useRef(
    draft.experience.moments.map((m, i) => m.id ?? "legacy-" + i),
  );
  const experience = draft.experience;
  const seconds = timestampSeconds(duration.trim());
  const busy = status.busy || importing;
  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }
  function personal<K extends keyof Experience>(key: K, value: Experience[K]) {
    setDraft((prev) => ({
      ...prev,
      experience: { ...prev.experience, [key]: value },
    }));
  }
  function moment(index: number, key: keyof Moment, value: string | boolean) {
    personal(
      "moments",
      experience.moments.map((m, i) =>
        i === index ? { ...m, [key]: value } : m,
      ),
    );
  }
  function goTo(next: number) {
    setStep(next);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(
          '.composer-steps [aria-current="step"]',
        )
        ?.focus(),
    );
  }
  function changeSource(value: string) {
    ++lookup.current;
    setImporting(false);
    setHint("");
    const prior = lastImport.current;
    if (
      prior?.duration_seconds &&
      clockTime(prior.duration_seconds) === duration
    )
      setDuration("");
    setDraft((prev) => ({
      ...prev,
      url: value,
      title: prior?.title === prev.title ? "" : prev.title,
      creator: prior?.creator === prev.creator ? "" : prev.creator,
      artwork: prior?.artwork === prev.artwork ? "" : prev.artwork,
      experience: {
        ...prev.experience,
        source_description:
          prior?.source_description === prev.experience.source_description
            ? ""
            : prev.experience.source_description,
      },
    }));
    lastImport.current = null;
  }
  function payload() {
    return {
      ...draft,
      experience: {
        ...experience,
        duration_seconds: seconds,
        duration_origin: seconds ? origin : ("unknown" as const),
        moments: experience.moments
          .map((m, i) => ({ ...m, id: ids.current[i] }))
          .filter(
            (m) => m.title.trim() || m.timestamp.trim() || m.description.trim(),
          ),
      },
    };
  }
  async function importSource() {
    if (!signedIn) {
      if (checkDuration()) authenticate(payload());
      return;
    }
    const id = ++lookup.current;
    setImporting(true);
    setHint("");
    try {
      const result = await api<Metadata>("/me/metadata", "POST", {
        url: draft.url.trim(),
      });
      if (id !== lookup.current) return;
      lastImport.current = result;
      setDraft((prev) => ({
        ...prev,
        url: result.url,
        title: prev.title || result.title,
        creator: prev.creator || result.creator,
        artwork: prev.artwork || result.artwork,
        kind: result.url.startsWith("https://open.spotify.com/audiobook/")
          ? "audiobook"
          : prev.kind,
        experience: {
          ...prev.experience,
          source_description:
            prev.experience.source_description || result.source_description,
        },
      }));
      if (result.duration_seconds && !duration) {
        setDuration(clockTime(result.duration_seconds));
        setOrigin("provider");
      }
      setHint(
        result.available
          ? "Details imported. Review them below."
          : "No metadata available. Enter the details below.",
      );
    } catch (error) {
      if (id === lookup.current)
        setHint(message(error) + " You can enter details manually.");
    } finally {
      if (id === lookup.current) setImporting(false);
    }
  }
  function fail(at: number, fieldId: string, text: string) {
    setStep(at);
    setInvalid(text);
    requestAnimationFrame(() => {
      const el = document.getElementById(fieldId);
      const details = el?.closest("details");
      if (details) details.open = true;
      el?.focus();
    });
    return false;
  }
  function checkDuration() {
    return (
      !duration.trim() ||
      !!seconds ||
      fail(
        0,
        "listen-duration",
        "Use HH:MM:SS for a duration greater than zero.",
      )
    );
  }
  async function save() {
    setInvalid("");
    if (!draft.title.trim()) {
      fail(0, "listen-title", "Give this listen a title before saving.");
      return;
    }
    if (!checkDuration()) return;
    const index = experience.moments.findIndex((m) => {
      if (!m.timestamp.trim()) return false;
      const t = timestampSeconds(m.timestamp.trim());
      return t === null || (seconds !== null && t > seconds);
    });
    if (index !== -1) {
      fail(
        2,
        "stamp-" + index,
        "Moment " +
          (index + 1) +
          " needs a timestamp in HH:MM:SS within the listen’s duration.",
      );
      return;
    }
    const data = payload();
    if (!signedIn) {
      authenticate(data);
      return;
    }
    await status.run(async () => {
      const result = await api<{ id: string }>(
        entry ? "/me/entries/" + entry.id : "/me/entries",
        entry ? "PUT" : "POST",
        { ...data, ...(entry && { revision: entry.revision }) },
      );
      await done(
        entry
          ? { kind: "edited", id: entry.id }
          : { kind: "created", id: result.id },
      );
    });
  }
  const art = coverFor(draft);
  return (
    <Modal
      title={entry ? "Edit your listen" : "Add to suni."}
      close={() => {
        if (!status.busy) {
          if (dirty) setConfirmDiscard(true);
          else close();
        }
      }}
      cinematic
    >
      {confirmDiscard && (
        <section role="alert" aria-label="Unsaved changes">
          <p>Discard your unsaved changes?</p>
          <button
            type="button"
            className="button"
            autoFocus
            onClick={() => setConfirmDiscard(false)}
          >
            Keep editing
          </button>
          <button type="button" className="plainlink" onClick={close}>
            Discard changes
          </button>
        </section>
      )}
      <div className="composer-steps" role="group" aria-label="Composer steps">
        {steps.map((s, i) => (
          <button
            type="button"
            key={s}
            aria-current={step === i ? "step" : undefined}
            onClick={() => setStep(i)}
          >
            {s}
          </button>
        ))}
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void save();
        }}
      >
        {step === 0 && (
          <section className="composer-page" aria-label="Listen">
            <label htmlFor="listen-source">
              <Link2 size={14} /> Source link <small>optional</small>
            </label>
            <div className="import-row">
              <input
                id="listen-source"
                type="url"
                readOnly={!!entry}
                maxLength={2048}
                value={draft.url}
                placeholder="Spotify, YouTube or a publisher URL"
                onChange={(e) => changeSource(e.target.value)}
              />
              <button
                className="button"
                disabled={!draft.url.trim() || busy}
                type="button"
                onClick={() => void importSource()}
              >
                {importing
                  ? "Importing…"
                  : signedIn
                    ? "Import details"
                    : "Sign in to import"}
              </button>
            </div>
            <small role="status">
              {hint || "Paste a link to import details, or start with a title."}
            </small>
            <div className="listen-preview">
              <div className="listen-cover">
                {art ? (
                  <img src={art} alt="Cover preview" />
                ) : (
                  <Headphones size={33} />
                )}
              </div>
              <div>
                <small>{draft.kind}</small>
                <strong>{draft.title || "Untitled listen"}</strong>
                {draft.creator && <span>{draft.creator}</span>}
              </div>
            </div>
            <label>
              Title{" "}
              <input
                id="listen-title"
                required
                maxLength={250}
                value={draft.title}
                onChange={(e) => field("title", e.target.value)}
              />
            </label>
            <div className="pair">
              <label>
                Creator
                <input
                  maxLength={180}
                  value={draft.creator}
                  onChange={(e) => field("creator", e.target.value)}
                />
              </label>
              <label>
                Category
                <select
                  value={draft.kind}
                  onChange={(e) =>
                    field("kind", e.target.value as Draft["kind"])
                  }
                >
                  {formats.map((f) => (
                    <option key={f} value={f}>
                      {f[0].toUpperCase() + f.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <details className="composer-disclosure">
              <summary>
                <Clock3 size={15} /> Duration &amp; source details
              </summary>
              <div>
                <label>
                  Duration (HH:MM:SS)
                  <input
                    id="listen-duration"
                    placeholder="HH:MM:SS"
                    maxLength={10}
                    value={duration}
                    disabled={importing}
                    onChange={(e) => {
                      setDuration(e.target.value);
                      setOrigin("manual");
                    }}
                  />
                </label>
                {draft.kind === "podcast" && (
                  <label>
                    Podcast show
                    <input
                      maxLength={180}
                      value={draft.show_name}
                      onChange={(e) => field("show_name", e.target.value)}
                    />
                  </label>
                )}
                <label>
                  Cover artwork URL
                  <input
                    type="url"
                    maxLength={2048}
                    value={draft.artwork}
                    onChange={(e) => field("artwork", e.target.value)}
                  />
                </label>
                <label>
                  Publisher’s description
                  <textarea
                    maxLength={8000}
                    value={experience.source_description}
                    onChange={(e) =>
                      personal("source_description", e.target.value)
                    }
                  />
                </label>
              </div>
            </details>
          </section>
        )}
        {step === 1 && (
          <section className="composer-page" aria-label="Reflection">
            <label>
              Describe this listen.
              <small>What was it about, in your own words?</small>
              <textarea
                maxLength={8000}
                value={experience.personal_description}
                onChange={(e) =>
                  personal("personal_description", e.target.value)
                }
              />
            </label>
            <div className="reflection-panel">
              <label htmlFor="listen-reflection">
                {reflectionPrompt(seconds)}
              </label>
              <textarea
                id="listen-reflection"
                maxLength={8000}
                value={experience.reflection}
                placeholder="The part I keep thinking about is..."
                onChange={(e) => personal("reflection", e.target.value)}
              />
              <small>
                <LockKeyhole size={13} /> Only you can read this reflection.
              </small>
            </div>
            <details
              className="composer-disclosure"
              open={focusNote || undefined}
            >
              <summary>Private notes</summary>
              <label>
                Private note
                <textarea
                  maxLength={8000}
                  value={draft.note}
                  onChange={(e) => field("note", e.target.value)}
                />
              </label>
            </details>
          </section>
        )}
        {step === 2 && (
          <section className="composer-page" aria-label="Moments">
            <h3>Favorite moments</h3>
            <p className="muted">
              Keep a quote, an idea, or a point in time. Each moment is private
              until you choose to share it.
            </p>
            {experience.moments.map((m, i) => (
              <fieldset className="moment" key={ids.current[i]}>
                <legend>Moment {i + 1}</legend>
                <label>
                  Short title
                  <input
                    maxLength={140}
                    value={m.title}
                    onChange={(e) => moment(i, "title", e.target.value)}
                  />
                </label>
                <label>
                  Timestamp (optional)
                  <input
                    id={"stamp-" + i}
                    placeholder="HH:MM:SS"
                    maxLength={10}
                    value={m.timestamp}
                    onChange={(e) => moment(i, "timestamp", e.target.value)}
                  />
                </label>
                <label>
                  Personal description
                  <textarea
                    maxLength={1500}
                    value={m.description}
                    onChange={(e) => moment(i, "description", e.target.value)}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!m.shared}
                    onChange={(e) => moment(i, "shared", e.target.checked)}
                  />{" "}
                  Share this moment with this entry on my published profile
                </label>
                <button
                  type="button"
                  className="plainlink"
                  aria-label={"Remove moment " + (i + 1)}
                  onClick={() => {
                    ids.current.splice(i, 1);
                    personal(
                      "moments",
                      experience.moments.filter((_, j) => j !== i),
                    );
                  }}
                >
                  <X size={14} /> Remove
                </button>
              </fieldset>
            ))}
            <button
              className="button moment-add"
              type="button"
              disabled={experience.moments.length >= 24}
              onClick={() => {
                ids.current.push(crypto.randomUUID());
                personal("moments", [
                  ...experience.moments,
                  { title: "", timestamp: "", description: "" },
                ]);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLInputElement>(
                      ".moment:last-of-type input",
                    )
                    ?.focus(),
                );
              }}
            >
              <Plus size={15} />
              {experience.moments.length
                ? "Add another moment"
                : "Add a moment"}
            </button>
          </section>
        )}
        <details className="composer-disclosure">
          <summary>
            <BookOpen size={15} /> Status &amp; sharing
          </summary>
          <div>
            <div className="pair">
              <label>
                Listening status
                <select
                  value={draft.status}
                  onChange={(e) => {
                    const value = e.target.value as Draft["status"];
                    field("status", value);
                    if (!entry?.finished_at && value !== "finished")
                      field("replays", 0);
                  }}
                >
                  {Object.entries(statuses).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rating
                <select
                  value={draft.rating ?? ""}
                  onChange={(e) =>
                    field(
                      "rating",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                >
                  <option value="">Unrated</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} / 5
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Additional replays
              <input
                type="number"
                min={0}
                max={100000}
                disabled={!entry?.finished_at && draft.status !== "finished"}
                value={draft.replays}
                onChange={(e) => field("replays", Number(e.target.value))}
              />
            </label>
            <label>
              Public takeaway
              <textarea
                maxLength={2000}
                value={draft.takeaway}
                onChange={(e) => field("takeaway", e.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.shared}
                onChange={(e) => field("shared", e.target.checked)}
              />
              Share this entry on my public profile
            </label>
            <small>
              A published profile shows this listen’s title, creator, show,
              cover, category, source, status, rating, update date and public
              takeaway, plus any moments you choose to share. Your personal
              description, reflection and notes stay private.
            </small>
          </div>
        </details>
        <ErrorText text={invalid || status.error} />
        <div className="composer-actions">
          {step < 2 ? (
            <button
              type="button"
              className="plainlink"
              onClick={() => goTo(step + 1)}
            >
              {steps[step + 1]} <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" className="plainlink" onClick={() => goTo(1)}>
              Back to reflection
            </button>
          )}
          <button className="button primary" disabled={busy}>
            <Check size={16} />
            {status.busy
              ? "Saving…"
              : signedIn
                ? "Save listen"
                : "Sign in to save"}
          </button>
        </div>
      </form>
      {entry && (
        <div className="account-tools">
          <button disabled={status.busy} onClick={() => setDeleting(!deleting)}>
            Delete entry
          </button>
          {deleting && (
            <button
              className="danger"
              disabled={status.busy}
              onClick={() =>
                void status.run(async () => {
                  await api("/me/entries/" + entry.id, "DELETE", {
                    revision: entry.revision,
                  });
                  await done({ kind: "deleted", id: entry.id });
                })
              }
            >
              Confirm permanent deletion
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
