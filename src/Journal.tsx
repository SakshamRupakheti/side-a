import { clockTime } from "../shared/experience";
import { RecordView } from "./RecordView";
import { SharePoster } from "./SharePoster";
import { coverFor } from "./picks";
import { useState } from "react";
import {
  ArrowUpRight,
  Award,
  Headphones,
  LockKeyhole,
  Plus,
  Pencil,
  Radio,
  Repeat2,
  Globe2,
} from "lucide-react";
import {
  milestones,
  formats,
  rooms,
  type Draft,
  statuses,
  type Entry,
  type Profile,
  type PublicPage,
  type Stats,
  type Status,
} from "../shared/diary";
const statNames = {
  finished: "Episodes finished",
  shows: "Shows explored",
  replays: "Total replays",
};
const statIcons = { finished: Headphones, shows: Radio, replays: Repeat2 };
export function Numbers({ stats }: { stats: Partial<Stats> }) {
  return (
    <div className="numbers">
      {(Object.keys(stats) as (keyof Stats)[]).map((k) => {
        const Icon = statIcons[k];
        return (
          <div key={k}>
            <Icon size={18} />
            <strong>{stats[k]}</strong>
            <small>{statNames[k]}</small>
          </div>
        );
      })}
    </div>
  );
}
export function Badges({
  values,
  all = false,
}: {
  values: number[];
  all?: boolean;
}) {
  return (
    <section className="badges">
      <h3>Milestones</h3>
      <p className="muted">Unique podcast episodes logged as finished.</p>
      <div>
        {(all ? milestones : values).map((n) => (
          <span className={values.includes(n) ? "earned" : ""} key={n}>
            <Award size={17} />
            {n} {n === 1 ? "episode" : "episodes"}
          </span>
        ))}
      </div>
      {!all && !values.length && <small>No public milestones yet.</small>}
    </section>
  );
}
export function Journal({
  items,
  stats,
  profile,
  add,
  edit,
  settings,
}: {
  items: Entry[];
  stats: Stats;
  profile: Profile | null;
  add: (kind: Draft["kind"]) => void;
  edit: (e: Entry) => void;
  settings: () => void;
}) {
  const [filter, setFilter] = useState<Status | "all">("all");
  const [reading, setReading] = useState<Entry | null>(null);
  const filtered = items.filter((e) => filter === "all" || e.status === filter);
  return (
    <>
      <section className="pageintro" id="archive">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              <span className="dash" /> PERSONAL JOURNAL
            </p>
            <h1>
              My <em>archive.</em>
            </h1>
          </div>
          <button className="button primary" onClick={() => add("podcast")}>
            <Plus size={17} />
            Add a listen
          </button>
        </div>
        <a className="plainlink history-link" href="/import">
          Import listening history
        </a>
        {profile?.published ? (
          <a className="plainlink" href={"/u/" + profile.username}>
            View public profile <ArrowUpRight size={15} />
          </a>
        ) : (
          <button className="plainlink" onClick={settings}>
            <LockKeyhole size={14} /> Private profile · Settings
          </button>
        )}
        <Numbers stats={stats} />
      </section>
      <section className="listsection">
        <h2>Listening entries</h2>
        <div className="tabs">
          {(["all", "want", "listening", "finished"] as const).map((k) => (
            <button
              key={k}
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
            >
              {k === "all" ? "All entries" : statuses[k]}
            </button>
          ))}
        </div>
        {formats.map((kind) => (
          <section key={kind} className={"room room-" + kind}>
            <div className="section-heading">
              <h3>{rooms[kind]}</h3>
              <button className="plainlink" onClick={() => add(kind)}>
                <Plus size={16} />
                Add {kind}
              </button>
            </div>
            {!filtered.some((e) => e.kind === kind) && (
              <p className="empty-note">
                {filter === "all"
                  ? "Nothing saved here yet."
                  : "No entries with this status."}
              </p>
            )}
            {filtered
              .filter((e) => e.kind === kind)
              .map((e) => (
                <article className="entryrow" key={e.id}>
                  {coverFor(e) && (
                    <img alt="" src={coverFor(e)} loading="lazy" />
                  )}
                  <div className="entrybody">
                    <small>
                      {statuses[e.status]} · {e.kind}
                    </small>
                    <h3>
                      <button
                        className="record-title"
                        onClick={() => setReading(e)}
                      >
                        {e.title}
                      </button>
                    </h3>
                    <p>
                      {[e.show_name, e.creator].filter(Boolean).join(" · ")}
                    </p>
                    {e.note && (
                      <p className="note">
                        <LockKeyhole size={14} /> {e.note}
                      </p>
                    )}
                    {e.takeaway && <p>{e.takeaway}</p>}
                    <div className="details">
                      <time dateTime={e.updated_at}>
                        Updated{" "}
                        {new Date(e.updated_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </time>
                      {e.shared ? (
                        <span>
                          <Globe2 /> Shared
                        </span>
                      ) : (
                        <span>
                          <LockKeyhole /> Private
                        </span>
                      )}
                      {e.rating && <span>{e.rating}/5</span>}
                      {e.replays > 0 && <span>{e.replays} replays</span>}
                      {e.url && (
                        <a href={e.url} target="_blank" rel="noreferrer">
                          Open source <ArrowUpRight />
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    className="icon"
                    aria-label={"Edit " + e.title}
                    onClick={() => edit(e)}
                  >
                    <Pencil size={16} />
                  </button>
                </article>
              ))}
          </section>
        ))}
      </section>
      {reading && (
        <RecordView
          entry={reading}
          close={() => setReading(null)}
          edit={() => {
            setReading(null);
            edit(reading);
          }}
        />
      )}
      <Badges all values={milestones.filter((n) => n <= stats.finished)} />
    </>
  );
}
export function Published({ page }: { page: PublicPage }) {
  return (
    <>
      <section className="pageintro">
        <p className="eyebrow">
          <span className="dash" /> PUBLIC LISTENING DIARY
        </p>
        <h1>{page.name}</h1>
        <p>@{page.username}</p>
        {page.bio && <p>{page.bio}</p>}
        <a className="plainlink" href={"/feed?author=" + page.username}>
          Listening posts
        </a>
        <SharePoster page={page} />
        <Numbers stats={page.stats} />
      </section>
      {page.badges && <Badges values={page.badges} />}
      <section className="listsection">
        <h2>Shared listening history</h2>
        {!page.entries.length && <p>No entries shared yet.</p>}
        {page.entries.map((e, i) => (
          <article className="entryrow" key={i}>
            {coverFor(e) && <img src={coverFor(e)} alt="" loading="lazy" />}
            <div>
              <small>
                {statuses[e.status]} · {e.kind}
              </small>
              <h3>{e.title}</h3>
              <p>{[e.show_name, e.creator].filter(Boolean).join(" · ")}</p>
              {e.takeaway && <p>{e.takeaway}</p>}
              {!!e.moments?.length && (
                <div>
                  <h4>Shared moments</h4>
                  <ol>
                    {e.moments.map((m, i) => (
                      <li key={i}>
                        {m.position_seconds !== null && (
                          <small>{clockTime(m.position_seconds)} </small>
                        )}
                        <strong>{m.title}</strong>
                        {m.reflection && <p>{m.reflection}</p>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {e.rating && <p>Rating {e.rating}/5</p>}
              {e.url && (
                <a
                  className="plainlink"
                  href={e.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open original <ArrowUpRight size={14} />
                </a>
              )}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
