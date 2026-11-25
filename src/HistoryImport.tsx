import { useEffect, useMemo, useRef, useState } from "react";
import { api, message } from "./ui";
import { historyKey, type HistoryItem, type Review } from "../shared/history";
import {
  initialFilters,
  initialProgress,
  localState,
  runHistory,
  sendHistory,
  type Filters,
  type Job,
  type Progress,
  type LocalState,
} from "./history-job";
import "./history.css";

const PAGE = 30;
export default function HistoryImport({ owner }: { owner: string }) {
  const [review, setReview] = useState<Review>(),
    [filters, setFilters] = useState<Filters>(initialFilters);
  const [job, setJob] = useState<Job>(),
    [progress, setProgress] = useState<Progress>(initialProgress);
  const [saved, setSaved] = useState<LocalState>(),
    [ready, setReady] = useState(false),
    [scope, setScope] = useState("");
  const [known, setKnown] = useState(new Set<string>()),
    [busy, setBusy] = useState<"" | "scan" | "import">("");
  const [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(0),
    [creatorSearch, setCreatorSearch] = useState("");
  const reader = useRef<Worker | null>(null),
    stop = useRef(false),
    guard = useRef(false),
    network = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      reader.current?.terminate();
      stop.current = true;
      network.current?.abort();
    };
  }, []);
  useEffect(() => {
    let live = true;
    setReady(false);
    setScope("");
    setError("");
    async function prepare() {
      let cursor: string | null = null;
      const keys = new Set<string>();
      let accountScope = "";
      do {
        const response: {
          keys: string[];
          next: string | null;
          scope: string;
          account: string;
        } = await api(
          "/me/import/identities" +
            (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
        );
        if (!live) return;
        if (response.account !== owner)
          throw Error("Your account changed. Reload this page.");
        accountScope = response.scope;
        response.keys.forEach((key) => keys.add(key));
        cursor = response.next;
      } while (cursor);
      const state = await localState(accountScope, "read");
      if (!live) return;
      if (
        state.state &&
        "job" in state.state &&
        state.progress?.offset === state.state.job.items.length
      ) {
        await localState(accountScope, "clear", undefined, state.state.job.run);
        if (!live) return;
        setJob(state.state.job);
        setSaved(undefined);
      } else setSaved(state.state);
      setProgress(state.progress ?? initialProgress);
      setKnown(keys);
      setScope(accountScope);
      setReady(true);
    }
    void prepare().catch((e) => {
      if (live) setError(message(e));
    });
    return () => {
      live = false;
    };
  }, [owner, refresh]);
  function scan(files: File[]) {
    if (!files.length) return;
    reader.current?.terminate();
    setError("");
    setStatus("Reading files on this device…");
    setBusy("scan");
    setPage(0);
    setFilters(initialFilters);
    const worker = new Worker(new URL("./history-worker.ts", import.meta.url), {
      type: "module",
    });
    reader.current = worker;
    const fail = (m: string) => {
      setError(m);
      setBusy("");
      setStatus("");
      worker.terminate();
    };
    worker.onerror = () => fail("The local reader could not open these files.");
    worker.onmessage = ({ data }) => {
      if (reader.current !== worker) return;
      if (data.error) fail(data.error);
      else if (data.review) {
        setReview(data.review);
        setBusy("");
        setStatus("");
        worker.terminate();
      } else
        setStatus(
          data.events +
            " activity events scanned across " +
            data.files +
            " files.",
        );
    };
    worker.postMessage(files);
  }
  const counts = useMemo(() => {
    const c = { recognized: 0, review: 0, existing: 0 };
    for (const r of review?.items ?? []) {
      if (r.confidence === "recognized") c.recognized++;
      else c.review++;
      if (known.has(historyKey(r))) c.existing++;
    }
    return c;
  }, [review, known]);
  const creators = useMemo(
    () => [...new Set(review?.items.map((r) => r.creator) ?? [])].sort(),
    [review],
  );
  const rows = useMemo(() => {
    const excluded = new Set(filters.excluded);
    return (review?.items ?? []).filter((r) => {
      const day = r.evidence.last?.slice(0, 10) ?? "";
      return (
        (!filters.provider || r.provider === filters.provider) &&
        !excluded.has(r.creator) &&
        (!filters.since || day >= filters.since) &&
        (!filters.until || (!!day && day <= filters.until))
      );
    });
  }, [review, filters]);
  const omitted = useMemo(() => new Set(filters.omitted), [filters.omitted]);
  const chosen = rows.filter(
    (r) =>
      !known.has(historyKey(r)) &&
      !omitted.has(historyKey(r)) &&
      (r.confidence === "recognized" || filters.review),
  );
  const change = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(0);
  };
  async function discard() {
    reader.current?.terminate();
    reader.current = null;
    try {
      await localState(scope, "clear");
      setReview(undefined);
      setJob(undefined);
      setSaved(undefined);
      setFilters(initialFilters);
      setProgress(initialProgress);
      setBusy("");
      setError("");
      setStatus("");
      setPage(0);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(message(e));
    }
  }
  async function start(resume?: Job) {
    if (guard.current || !ready) return;
    guard.current = true;
    stop.current = false;
    setError("");
    setBusy("import");
    const controller = new AbortController();
    network.current = controller;
    const execute = async () => {
      const next: Job = resume ?? {
        run: crypto.randomUUID(),
        scope,
        status: filters.status,
        items: chosen.map(
          ({ provider, id, title, creator, evidence }): HistoryItem => ({
            provider,
            id,
            title,
            creator,
            evidence,
          }),
        ),
      };
      if (next.scope !== scope)
        throw Error("This draft belongs to a different account.");
      let base = initialProgress;
      const local = await localState(scope, "read");
      if (resume) {
        if (
          !local.state ||
          !("job" in local.state) ||
          local.state.job.run !== next.run
        )
          throw Error(
            "This draft changed in another tab. Reopen the importer.",
          );
        base = local.progress ?? initialProgress;
      } else {
        if (local.state && "job" in local.state)
          throw Error("Resume or discard the previous import first.");
        await localState(scope, "job", { job: next });
      }
      if (!mounted.current) return;
      setJob(next);
      setSaved(undefined);
      setReview(undefined);
      setProgress(base);
      setStatus("");
      const final = await runHistory(next, base, {
        send: (body) => sendHistory(scope, body, controller.signal),
        paused: () => stop.current || controller.signal.aborted,
        wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        checkpoint: async (p) => {
          await localState(scope, "progress", p, next.run);
          if (mounted.current) setProgress(p);
        },
      });
      if (!mounted.current) return;
      if (final.offset === next.items.length) {
        await localState(scope, "clear", undefined, next.run);
        setStatus("Import complete.");
      } else
        setStatus(
          "Import paused. Your confirmed progress is saved on this device.",
        );
    };
    try {
      if (navigator.locks)
        await navigator.locks.request(
          "suni-import-" + scope,
          { ifAvailable: true },
          async (lock) => {
            if (!lock) throw Error("An import is active in another tab.");
            await execute();
          },
        );
      else await execute();
    } catch (e) {
      if (mounted.current) setError(message(e));
    } finally {
      guard.current = false;
      if (mounted.current) setBusy("");
    }
  }
  return (
    <section className="history-page pageintro">
      <p className="eyebrow">MY ARCHIVE</p>
      <h1>
        Import listening history<span>.</span>
      </h1>
      <ol className="history-steps" aria-label="Import steps">
        {["Upload", "Organize", "Import"].map((s, i) => (
          <li
            key={s}
            aria-current={(job ? 2 : review ? 1 : 0) === i ? "step" : undefined}
          >
            {s}
          </li>
        ))}
      </ol>
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          {!ready && (
            <button
              className="plainlink"
              onClick={() => setRefresh((n) => n + 1)}
            >
              Retry
            </button>
          )}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {job ? (
        <section className="history-panel">
          <h2>
            {progress.offset === job.items.length
              ? "Your collection is ready."
              : "Import to your collection"}
          </h2>
          <progress
            aria-label="Confirmed import progress"
            max={job.items.length}
            value={progress.offset}
          />
          <p aria-live="polite">
            {progress.offset} of {job.items.length} confirmed · {progress.added}{" "}
            added · {progress.existing} already saved · {progress.invalid}{" "}
            rejected
          </p>
          {progress.offset === job.items.length ? (
            <a className="button primary" href="/">
              Open my collection
            </a>
          ) : busy === "import" ? (
            <button
              className="button"
              onClick={() => {
                stop.current = true;
                setStatus("Pausing after the current batch…");
              }}
            >
              Pause import
            </button>
          ) : (
            <>
              <button
                className="button primary"
                onClick={() => void start(job)}
              >
                Resume import
              </button>{" "}
              <button className="plainlink" onClick={() => void discard()}>
                Discard remaining items
              </button>
            </>
          )}
        </section>
      ) : review ? (
        <>
          <div className="history-counts">
            {[
              [review.scanned, "activity events"],
              [counts.recognized, "recognized episodes"],
              [counts.review, "need review"],
              [counts.existing, "already saved"],
            ].map(([n, k]) => (
              <div key={k}>
                <strong>{n}</strong>
                <small>{k}</small>
              </div>
            ))}
          </div>
          <p>
            {review.items.length} unique podcast candidates · {review.other}{" "}
            other media · {review.unknown} unrecognized
          </p>
          <details className="history-options">
            <summary>Filters and import settings</summary>
            <div className="history-fields">
              <label>
                Provider
                <select
                  value={filters.provider}
                  onChange={(e) => change("provider", e.target.value)}
                >
                  <option value="">All providers</option>
                  <option value="spotify">Spotify</option>
                  <option value="youtube">YouTube</option>
                </select>
              </label>
              <label>
                Last activity from
                <input
                  type="date"
                  value={filters.since}
                  onChange={(e) => change("since", e.target.value)}
                />
              </label>
              <label>
                Through
                <input
                  type="date"
                  value={filters.until}
                  onChange={(e) => change("until", e.target.value)}
                />
              </label>
              <label>
                Listening status
                <select
                  value={filters.status}
                  onChange={(e) =>
                    change("status", e.target.value as Filters["status"])
                  }
                >
                  <option value="want">Saved for later</option>
                  <option value="listening">In progress</option>
                  <option value="finished">Finished</option>
                </select>
              </label>
              <label>
                Find creator
                <input
                  type="search"
                  value={creatorSearch}
                  onChange={(e) => setCreatorSearch(e.target.value)}
                />
              </label>
              <label>
                Exclude creator
                <select
                  value=""
                  onChange={(e) =>
                    change("excluded", [...filters.excluded, e.target.value])
                  }
                >
                  <option value="">Choose a creator</option>
                  {creators
                    .filter(
                      (c) =>
                        c &&
                        !filters.excluded.includes(c) &&
                        c.toLowerCase().includes(creatorSearch.toLowerCase()),
                    )
                    .slice(0, 80)
                    .map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                </select>
              </label>
            </div>
            {filters.excluded.map((c) => (
              <button
                className="plainlink"
                key={c}
                onClick={() =>
                  change(
                    "excluded",
                    filters.excluded.filter((x) => x !== c),
                  )
                }
              >
                Include {c} again
              </button>
            ))}
          </details>
          <label className="history-check">
            <input
              type="checkbox"
              checked={filters.review}
              onChange={(e) => change("review", e.target.checked)}
            />{" "}
            Include episodes needing review
          </label>
          <ul className="history-rows">
            {rows.slice(page * PAGE, (page + 1) * PAGE).map((r) => {
              const key = historyKey(r),
                existing = known.has(key),
                eligible =
                  !existing &&
                  (r.confidence === "recognized" || filters.review);
              return (
                <li key={key}>
                  <input
                    type="checkbox"
                    aria-label={"Include " + r.title}
                    disabled={!eligible}
                    checked={eligible && !omitted.has(key)}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        omitted: e.target.checked
                          ? filters.omitted.filter((k) => k !== key)
                          : [...filters.omitted, key],
                      })
                    }
                  />
                  <div>
                    <strong>{r.title}</strong>
                    <small>
                      {[r.provider, r.creator, r.evidence.last?.slice(0, 10)]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                    <small>
                      {existing ? "Already saved" : r.reason} ·{" "}
                      {Object.entries(r.evidence)
                        .filter(
                          ([k, v]) =>
                            ["watch", "stream", "saved", "playlist"].includes(
                              k,
                            ) && v,
                        )
                        .map(([k, v]) => k + " × " + v)
                        .join(", ")}
                    </small>
                  </div>
                </li>
              );
            })}
          </ul>
          {rows.length > PAGE && (
            <div className="history-actions">
              <button disabled={!page} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>
                {page + 1} / {Math.ceil(rows.length / PAGE)}
              </span>
              <button
                disabled={(page + 1) * PAGE >= rows.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
          <p>
            Only selected episode titles, creators, source IDs and activity
            summaries are sent. Entries are private. A watch or stream alone
            never marks a listen finished.
          </p>
          <p className="muted">
            Confirmation saves a resumable copy of your selection on this device
            until the import finishes.
          </p>
          <div className="history-actions">
            <button
              className="button primary"
              disabled={!ready || !chosen.length || !!busy}
              onClick={() => void start()}
            >
              Import {chosen.length} privately
            </button>
            <button
              className="button"
              disabled={!!busy}
              onClick={() =>
                void localState(scope, "draft", { review, filters })
                  .then(() => setStatus("Review saved on this device."))
                  .catch((e) => setError(message(e)))
              }
            >
              Save local draft
            </button>
            <button
              className="plainlink"
              disabled={!!busy}
              onClick={() => void discard()}
            >
              Cancel
            </button>
          </div>
        </>
      ) : saved ? (
        <section className="history-panel">
          <h2>Continue your import</h2>
          <p>This account has a saved import on this device.</p>
          <button
            className="button primary"
            disabled={!ready}
            onClick={() => {
              if ("job" in saved) {
                setJob(saved.job);
                setSaved(undefined);
              } else {
                setReview(saved.review);
                setFilters(saved.filters);
                setSaved(undefined);
              }
            }}
          >
            Open saved import
          </button>{" "}
          <button className="plainlink" onClick={() => void discard()}>
            Discard local draft
          </button>
        </section>
      ) : (
        <div className="history-panel">
          <h2>Choose your export.</h2>
          <p>
            Select Spotify streaming history or Google Takeout. Your files are
            read on this device.
          </p>
          <label className="history-file">
            History files
            <input
              type="file"
              multiple
              accept=".json,.html,.csv,.zip"
              disabled={!ready || busy === "scan"}
              onChange={(e) => {
                scan(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
          <small>
            ZIP, JSON, watch-history.html or playlist CSV · up to 512 MiB
            selected
          </small>
          {!ready && !error && (
            <p role="status">Checking your saved episodes…</p>
          )}
          {busy === "scan" && (
            <button className="plainlink" onClick={() => void discard()}>
              Cancel scan
            </button>
          )}
        </div>
      )}
    </section>
  );
}
