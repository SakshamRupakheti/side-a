import { ArrowUpRight, ArrowRight, BookmarkPlus, Search } from "lucide-react";
import { useState } from "react";
import { api, ErrorText, useAction } from "./ui";
import { blank, type Draft } from "../shared/diary";

const picks = [
  {
    title: "Ten Thousand Years",
    show: "99% Invisible",
    creator: "Roman Mars",
    category: "Design",
    art: "signal",
    url: "https://99percentinvisible.org/episode/ten-thousand-years/",
    why: "How do you design a warning that someone can read ten millennia from now?",
  },
  {
    title: "Lorde — “Sober”",
    show: "Song Exploder",
    creator: "Hrishikesh Hirway",
    category: "Music",
    art: "groove",
    url: "https://songexploder.net/lorde",
    why: "Lorde opens up the early demos behind a song from Melodrama.",
  },
  {
    title: "The Intelligence of Plants",
    show: "On Being",
    creator: "Krista Tippett",
    category: "Nature",
    art: "botanic",
    url: "https://onbeing.org/programs/robin-wall-kimmerer-the-intelligence-of-plants-2022/",
    why: "Botanist Robin Wall Kimmerer listens closely to what plants can teach us.",
  },
];
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
          <p className="eyebrow">
            <span className="dash" /> EDITOR’S PICKS
          </p>
          <h2>The listening shelf</h2>
        </div>
        {!full && (
          <a className="plainlink" href="/discover">
            Explore all <ArrowRight size={17} />
          </a>
        )}
      </div>
      <div className="picks">
        {picks.map((p) => (
          <article className="pick" key={p.art}>
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className={"cover " + p.art}
              aria-label={"Open " + p.title + " at " + p.show}
            >
              <span aria-hidden="true" className="cover-type">
                {p.art === "signal" ? (
                  <>
                    99%
                    <br />
                    INVISIBLE
                  </>
                ) : p.art === "groove" ? (
                  <>
                    SONG
                    <br />
                    EXPLODER
                  </>
                ) : (
                  <>
                    On
                    <br />
                    <i>Being</i>
                  </>
                )}
              </span>
              <span aria-hidden="true" className="cover-pattern" />
            </a>
            <div className="pick-text">
              <small>{p.category} / Podcast</small>
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
                    onClick={() =>
                      save({
                        ...blank,
                        title: p.title,
                        url: p.url,
                        creator: p.creator,
                        show_name: p.show,
                      })
                    }
                  >
                    <BookmarkPlus size={16} /> Log episode
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
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
