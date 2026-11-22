import { ArrowUpRight, ArrowRight, BookmarkPlus, Search } from "lucide-react";
import { useState } from "react";
import { api, ErrorText, useAction } from "./ui";
import { formats, rooms, type Draft } from "../shared/diary";
import { picks, draftFromPick } from "./picks";

export function Shelf({
  full = false,
  save,
}: {
  full?: boolean;
  save: (d: Draft) => void;
}) {
  return (
    <section className="shelf">
      <div className="section-heading">
        <div>
          <p className="eyebrow">EDITORIAL SELECTION</p>
          <h2>
            The open archive<span>.</span>
          </h2>
        </div>
        {!full && (
          <a className="plainlink" href="/discover">
            Discover all <ArrowRight size={16} />
          </a>
        )}
      </div>
      {formats.map((kind) => (
        <section className={"room room-" + kind} key={kind}>
          <h3>{rooms[kind]}</h3>
          <div className="picks">
            {picks
              .filter((p) => p.kind === kind)
              .map((p) => (
                <article className="pick" key={p.art}>
                  <a
                    href={p.url}
                    className="pick-art"
                    target="_blank"
                    rel="noreferrer"
                    aria-label={"Open " + p.title}
                  >
                    <img
                      src={"/art/" + p.art + ".webp"}
                      width="160"
                      height="160"
                      loading="lazy"
                      alt=""
                    />
                  </a>
                  <div className="pick-text">
                    <small>
                      {p.kind} · {p.category}
                    </small>
                    <h3>
                      <a href={p.url} target="_blank" rel="noreferrer">
                        {p.title}
                      </a>
                    </h3>
                    <p>{p.show}</p>
                    {full && (
                      <>
                        <p className="why">{p.why}</p>
                        <button
                          className="plainlink"
                          onClick={() => save(draftFromPick(p))}
                        >
                          <BookmarkPlus size={15} />{" "}
                          {p.kind === "podcast"
                            ? "Log episode"
                            : p.kind === "documentary"
                              ? "Log film"
                              : "Log book"}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
          </div>
        </section>
      ))}
    </section>
  );
}
export function Discover({ save }: { save: (d: Draft) => void }) {
  const [q, setQ] = useState(""),
    [result, setResult] = useState<{
      source: string;
      results: { title: string; creator: string; url: string }[];
    } | null>(null),
    act = useAction();
  return (
    <>
      <section className="pageintro">
        <p className="eyebrow">
          <span className="dash" /> DISCOVERY
        </p>
        <h1>
          Find your next <em>listen.</em>
        </h1>
        <p>
          Search the podcast directory, or start with an episode from the shelf.
        </p>
        <form
          className="searchbar"
          onSubmit={(e) => {
            e.preventDefault();
            void act.run(async () => {
              setResult(null);
              setResult(await api("/search?q=" + encodeURIComponent(q)));
            });
          }}
        >
          <Search />
          <input
            aria-label="Search podcasts"
            placeholder="Search for a podcast or creator"
            minLength={2}
            maxLength={100}
            required
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="button" disabled={act.busy}>
            {act.busy ? "Searching…" : "Search"}
          </button>
        </form>
        <ErrorText text={act.error} />
      </section>
      {result && (
        <section className="listsection">
          <h2>Directory results</h2>
          <p className="muted">From {result.source}</p>
          {!result.results.length && (
            <p>No shows found. Try another title or creator.</p>
          )}
          {result.results.map((s, i) => (
            <a
              key={s.url + i}
              className="result"
              target="_blank"
              rel="noreferrer"
              href={s.url}
            >
              <span>
                <b>{s.title}</b>
                <small>{s.creator}</small>
              </span>
              <ArrowUpRight />
            </a>
          ))}
        </section>
      )}
      <Shelf full save={save} />
    </>
  );
}
