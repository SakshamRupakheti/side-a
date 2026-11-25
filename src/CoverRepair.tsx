import { useCallback, useEffect, useRef, useState } from "react";
import { api, message } from "./ui";
import "./covers.css";

type Status = { missing: number; ready: number; automatic: number };
type Batch = {
  done: boolean;
  processed: number;
  restored: number;
  unresolved: number;
  wait: number;
  paused?: boolean;
};
export function CoverRepair({
  refresh,
  onChanged,
}: {
  refresh?: unknown;
  onChanged?: () => void;
}) {
  const [status, setStatus] = useState<Status>();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const control = useRef({ stop: false, active: false, mounted: false });
  const changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  }, [onChanged]);
  const run = useCallback(async (automatic: boolean, total: number) => {
    const state = control.current;
    if (state.active) return;
    state.active = true;
    state.stop = false;
    setRunning(true);
    setError("");
    let processed = 0,
      restored = 0,
      unavailable = 0;
    try {
      while (!state.stop && state.mounted) {
        const result = await api<Batch>("/me/covers", "POST", { automatic });
        restored += result.restored;
        unavailable += result.unresolved;
        processed += result.processed;
        if (!state.mounted) break;
        setProgress(
          `${processed} checked · ${total} pending at start · ${restored} restored · ${unavailable} unavailable`,
        );
        if (result.paused)
          throw Error("Provider lookups are paused. You can retry later.");
        if (result.done) break;
        // Yield between bounded requests; stopping never discards saved progress.
        const until = Date.now() + Math.max(1200, result.wait * 1000);
        while (!state.stop && state.mounted && Date.now() < until)
          await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (state.mounted && state.stop)
        setProgress(
          `${processed} checked · ${restored} restored. Paused; retry to continue.`,
        );
    } catch (e) {
      if (state.mounted)
        setError(message(e) + " Saved covers are kept. Retry to continue.");
    } finally {
      state.active = false;
      if (state.mounted) {
        setRunning(false);
        if (restored) changed.current?.();
        void api<Status>("/me/covers")
          .then((next) => {
            if (state.mounted) setStatus(next);
          })
          .catch(() => undefined);
      }
    }
  }, []);
  useEffect(() => {
    const state = control.current;
    state.mounted = true;
    let live = true;
    void api<Status>("/me/covers")
      .then((next) => {
        if (!live) return;
        setStatus(next);
        if (next.automatic) void run(true, next.automatic);
      })
      .catch(() => {
        /* Collection remains usable offline. */
      });
    return () => {
      live = false;
      state.stop = true;
      state.mounted = false;
    };
  }, [refresh, run]);
  if (!status?.missing && !progress && !error) return null;
  return (
    <div className="cover-repair">
      {running ? (
        <button
          className="plainlink"
          onClick={() => {
            control.current.stop = true;
          }}
        >
          Pause cover restoration
        </button>
      ) : (
        !!status?.missing && (
          <button
            className="plainlink"
            onClick={() => void run(false, status.ready)}
          >
            Restore missing covers
          </button>
        )
      )}
      {progress && <small role="status">{progress}</small>}
      {!running && !!status?.missing && (
        <small>
          {status.missing} missing
          {status.ready
            ? ""
            : " · provider unavailable or cooling down; try again later"}
          .
        </small>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
