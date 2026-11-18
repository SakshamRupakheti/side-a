import { useState } from "react";
import {
  ArrowUpRight,
  Award,
  BookOpen,
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
  add: () => void;
  edit: (e: Entry) => void;
  settings: () => void;
}) {
  const [filter, setFilter] = useState<Status | "all">("all");
  const filtered = items.filter((e) => filter === "all" || e.status === filter);
  return (
    <>
      <section className="pageintro">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              <span className="dash" /> PERSONAL JOURNAL
            </p>
            <h1>
              My listening <em>diary.</em>
            </h1>
          </div>
          <button className="button primary" onClick={add}>
            <Plus size={17} />
            Log a listen
          </button>
        </div>
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
        {filtered.length === 0 ? (
          <div className="empty">
            <BookOpen />
            <h3>
              {items.length
                ? "No entries with this status"
                : "Your diary starts here"}
            </h3>
            <p>
              {items.length
                ? "Select another status or log a listen."
                : "Add a podcast episode or audiobook to start your listening record."}
            </p>
            <button className="plainlink" onClick={add}>
              <Plus size={16} /> Log a listen
            </button>
          </div>
        ) : (
          filtered.map((e) => (
            <article className="entryrow" key={e.id}>
              {e.artwork && <img alt="" src={e.artwork} loading="lazy" />}
              <div className="entrybody">
                <small>
                  {statuses[e.status]} ·{" "}
                  {e.kind === "podcast" ? "Podcast" : "Audiobook"}
                </small>
                <h3>{e.title}</h3>
                <p>{[e.show_name, e.creator].filter(Boolean).join(" · ")}</p>
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
          ))
        )}
      </section>
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
        <Numbers stats={page.stats} />
      </section>
      {page.badges && <Badges values={page.badges} />}
      <section className="listsection">
        <h2>Shared listening history</h2>
        {!page.entries.length && <p>No entries shared yet.</p>}
        {page.entries.map((e, i) => (
          <article className="entryrow" key={i}>
            {e.artwork && <img src={e.artwork} alt="" loading="lazy" />}
            <div>
              <small>
                {statuses[e.status]} ·{" "}
                {e.kind === "podcast" ? "Podcast" : "Audiobook"}
              </small>
              <h3>{e.title}</h3>
              <p>{[e.show_name, e.creator].filter(Boolean).join(" · ")}</p>
              {e.takeaway && <p>{e.takeaway}</p>}
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
