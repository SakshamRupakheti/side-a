import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowRight, ArrowUpRight, AudioLines, Headphones } from "lucide-react";
import { api, Brand, Header, message, type Session } from "./ui";
import { AuthForm, EntryForm, ProfileForm } from "./Forms";
import { Shelf, Discover } from "./Shelf";
import { Journal, Published } from "./Journal";
import {
  blank,
  type Draft,
  type Entry,
  type Stats,
  type PublicPage,
} from "../shared/diary";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./style.css";

function Welcome({
  start,
  save,
}: {
  start: () => void;
  save: (d: Draft) => void;
}) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="dash" /> A PERSONAL LISTENING JOURNAL
          </p>
          <h1>
            Keep a record
            <br />
            of <em>listening.</em>
          </h1>
          <p className="lede">
            A diary for the podcasts and audiobooks you spend time with. Log a
            listen, keep a note, and share what stays with you.
          </p>
          <div className="actions">
            <button className="button primary" onClick={start}>
              Start your diary <ArrowRight size={17} />
            </button>
            <a className="plainlink" href="/discover">
              Discover podcasts <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
        <figure className="tape-panel">
          <div className="corner tl" />
          <div className="corner tr" />
          <div className="corner bl" />
          <div className="corner br" />
          <img
            src="/tape.webp"
            width="1080"
            height="720"
            fetchPriority="high"
            alt="Worn cassette with a handwritten Side A label and red stripes"
          />
        </figure>
      </section>
      <Shelf save={save} />
    </>
  );
}
type Dialog = "auth" | "profile" | "entry" | null;
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [modal, setModal] = useState<Dialog>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Entry>(),
    [draft, setDraft] = useState<Draft>(),
    [error, setError] = useState("");
  const [diary, setDiary] = useState<{ entries: Entry[]; stats: Stats } | null>(
      null,
    ),
    [pub, setPub] = useState<PublicPage | null>(null);
  const path = location.pathname.replace(/\/$/, "") || "/",
    isPublic = path.startsWith("/u/"),
    discover = path === "/discover";
  const refresh = useCallback(async () => {
    setError("");
    if (isPublic) {
      setPub(await api("/u/" + encodeURIComponent(path.slice(3))));
      return;
    }
    const s = await api<Session>("/session");
    setSession(s);
    if (s.user) {
      if (!discover) setDiary(await api("/me/diary"));
      if (!s.profile) setModal("profile");
    } else setDiary(null);
    return s;
  }, [discover, isPublic, path]);
  useEffect(() => {
    void refresh().catch((e) => setError(message(e)));
  }, [refresh]);
  function add(d: Draft = { ...blank }) {
    setSelected(undefined);
    setDraft(d);
    setCreating(true);
    setModal(session?.user ? "entry" : "auth");
  }
  function access() {
    if (isPublic) {
      location.assign("/?signin");
      return;
    }
    setCreating(false);
    setModal(session?.user ? "profile" : "auth");
  }
  useEffect(() => {
    if (session && new URLSearchParams(location.search).has("signin")) {
      history.replaceState(null, "", "/");
      setModal(session.user ? "profile" : "auth");
    }
  }, [session]);
  async function done() {
    const s = await refresh();
    if (!s?.user) {
      setModal(null);
      setDraft(undefined);
    } else if (!s.profile) setModal("profile");
    else if (draft && modal !== "entry") setModal("entry");
    else {
      setModal(null);
      setDraft(undefined);
    }
  }
  function close() {
    setModal(null);
    setDraft(undefined);
  }
  const unknown = !(isPublic || discover || path === "/");
  return (
    <>
      <a href="#content" className="skip">
        Skip to content
      </a>
      <Header
        active={isPublic ? "" : discover ? "discover" : "diary"}
        session={session}
        open={access}
      />
      <main className="frame" id="content">
        {error && (
          <div className="error" role="alert">
            {error}{" "}
            <button
              className="plainlink"
              onClick={() => void refresh().catch((e) => setError(message(e)))}
            >
              Try again
            </button>
          </div>
        )}
        {unknown ? (
          <section className="pageintro">
            <h1>Page unavailable.</h1>
            <a href="/">Return to the diary</a>
          </section>
        ) : isPublic ? (
          pub ? (
            <Published page={pub} />
          ) : (
            !error && <p role="status">Opening profile…</p>
          )
        ) : discover ? (
          <Discover save={add} />
        ) : session?.user ? (
          diary ? (
            <Journal
              items={diary.entries}
              stats={diary.stats}
              profile={session.profile}
              add={() => add()}
              edit={(e) => {
                setSelected(e);
                setDraft(undefined);
                setModal("entry");
              }}
              settings={access}
            />
          ) : (
            <p role="status">Opening diary…</p>
          )
        ) : (
          <Welcome
            start={() => {
              setCreating(true);
              setModal("auth");
            }}
            save={add}
          />
        )}
      </main>
      <footer>
        <div className="frame footer-inner">
          <div>
            <Brand />
            <span>An open-source listening diary</span>
          </div>
          <span className="footer-note">
            <Headphones size={15} /> Podcasts &amp; audiobooks
          </span>
        </div>
      </footer>
      {modal === "auth" &&
        (session ? (
          <AuthForm
            session={session}
            creating={creating}
            close={close}
            done={done}
          />
        ) : (
          <section className="loading" role="status">
            <AudioLines />
            {error || "Opening sign-in…"}
            <button onClick={close}>Close</button>
          </section>
        ))}
      {modal === "profile" && session && (
        <ProfileForm session={session} close={close} done={done} />
      )}
      {modal === "entry" && (
        <EntryForm initial={draft} entry={selected} close={close} done={done} />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
