import {
  historyBatchSize,
  type HistoryItem,
  type Review,
} from "../shared/history.ts";
export interface Filters {
  provider: string;
  since: string;
  until: string;
  review: boolean;
  excluded: string[];
  omitted: string[];
  status: "want" | "listening" | "finished";
}
export const initialFilters: Filters = {
  provider: "",
  since: "",
  until: "",
  review: false,
  excluded: [],
  omitted: [],
  status: "want",
};
export interface Job {
  run: string;
  scope: string;
  items: HistoryItem[];
  status: Filters["status"];
}
export interface Progress {
  offset: number;
  added: number;
  existing: number;
  invalid: number;
}
export const initialProgress: Progress = {
  offset: 0,
  added: 0,
  existing: 0,
  invalid: 0,
};
export type LocalState = { review: Review; filters: Filters } | { job: Job };
async function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("suni-private-history-v1", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("local");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(Error("Local draft storage is unavailable."));
  });
}
export async function localState(
  owner: string,
  operation: "read" | "draft" | "job" | "progress" | "clear",
  value?: LocalState | Progress,
  expectedRun?: string,
) {
  const storage = await db();
  try {
    return await new Promise<{ state?: LocalState; progress?: Progress }>(
      (resolve, reject) => {
        const tx = storage.transaction(
          "local",
          operation === "read" ? "readonly" : "readwrite",
        );
        const store = tx.objectStore("local"),
          stateKey = ["state", owner],
          runKey = ["run", owner],
          progressKey = ["progress", owner];
        const result: { state?: LocalState; progress?: Progress } = {};
        if (operation === "read") {
          const a = store.get(stateKey),
            b = store.get(progressKey);
          a.onsuccess = () => (result.state = a.result);
          b.onsuccess = () => (result.progress = b.result);
        } else {
          const current = store.get(runKey);
          current.onsuccess = () => {
            const run = current.result as string | undefined;
            if (
              ((operation === "draft" || operation === "job") && run) ||
              ((operation === "progress" || expectedRun !== undefined) &&
                run !== expectedRun)
            ) {
              tx.abort();
              return;
            }
            if (operation === "progress") store.put(value, progressKey);
            else {
              store.delete(progressKey);
              if (operation === "clear") {
                store.delete(stateKey);
                store.delete(runKey);
              } else {
                store.put(value, stateKey);
                if (value && "job" in value) store.put(value.job.run, runKey);
              }
            }
          };
        }
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () =>
          reject(
            Error(
              "Could not save import progress on this device. Check browser storage and try again.",
            ),
          );
      },
    );
  } finally {
    storage.close();
  }
}
export class ImportFailure extends Error {
  status: number;
  delay: number;
  constructor(message: string, status: number, delay = 0) {
    super(message);
    this.status = status;
    this.delay = delay;
  }
}
export async function sendHistory(
  scope: string,
  body: unknown,
  signal: AbortSignal,
) {
  const response = await fetch("/api/me/import", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-Suni-Import-Scope": scope,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new ImportFailure(
      response.status === 423
        ? "History imports are paused. Resume later from this device."
        : response.status === 409 || response.status === 401
          ? "Your session changed. Sign in to the same account and resume."
          : "The import request could not finish.",
      response.status,
      Number(response.headers.get("Retry-After")) || 0,
    );
  return (await response.json()) as {
    outcomes: ("added" | "existing" | "invalid")[];
  };
}
export async function runHistory(
  job: Job,
  start: Progress,
  options: {
    send: (body: {
      run: string;
      status: Filters["status"];
      items: HistoryItem[];
    }) => Promise<{ outcomes: ("added" | "existing" | "invalid")[] }>;
    checkpoint: (p: Progress) => Promise<void>;
    paused: () => boolean;
    wait: (ms: number) => Promise<void>;
  },
) {
  let p = { ...start };
  while (p.offset < job.items.length && !options.paused()) {
    const items = job.items.slice(p.offset, p.offset + historyBatchSize);
    let attempt = 0;
    for (;;) {
      try {
        const result = await options.send({
          run: job.run,
          status: job.status,
          items,
        });
        if (
          result.outcomes.length !== items.length ||
          result.outcomes.some(
            (k) => !["added", "existing", "invalid"].includes(k),
          )
        )
          throw new ImportFailure(
            "Unconfirmed batch. Resume to check it again.",
            400,
          );
        p = { ...p, offset: p.offset + items.length };
        for (const outcome of result.outcomes) p[outcome]++;
        break;
      } catch (e) {
        const transient =
          e instanceof TypeError ||
          (e instanceof ImportFailure && (e.status === 429 || e.status >= 500));
        if (!transient || ++attempt > 3 || options.paused()) throw e;
        await options.wait(
          Math.max(
            500 * 2 ** (attempt - 1),
            (e instanceof ImportFailure ? e.delay : 0) * 1000,
          ),
        );
        if (options.paused()) return p;
      }
    }
    await options.checkpoint(p);
  }
  return p;
}
