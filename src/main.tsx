import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AudioLines, Headphones } from "lucide-react";
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
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource-variable/anybody/standard.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import { Entrance } from "./Entrance";
import { picks, draftFromPick } from "./picks";
import { ListeningDeck } from "./ListeningDeck";
import "./style.css";

type Dialog = "auth" | "profile" | "entry" | null;
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [modal, setModal] = useState<Dialog>(null);
  const [focusNote, setFocusNote] = useState(false);
  const [saved, setSaved] = useState("");
  const saving = React.useRef(false);
  async function saveFeatured(d: Draft, note = false) {
    if (
      note ||
      !session?.user ||
      !session.profile ||
      diary?.entries.some((e) => e.url === d.url)
    ) {
      add(d, note);
      return;
    }
    if (saving.current) return;
    saving.current = true;
    setError("");
    setSaved("");
    try {
      await api("/me/entries", "POST", d);
      await refresh();
      setSaved("Saved to your archive.");
    } catch (e) {
      setError(message(e));
    } finally {
      saving.current = false;
    }
  }

  const [creating, setCreating] = useState(false);
  const [callbackError, setCallbackError] = useState("");
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
      const collection = !discover
        ? await api<{ entries: Entry[]; stats: Stats }>("/me/diary")
        : null;
      if (collection) setDiary(collection);
      const pending = picks.find(
        (p) => p.art === sessionStorage.getItem("pofolio-pending"),
      );
      if (pending) {
        setDraft(draftFromPick(pending));
        setFocusNote(sessionStorage.getItem("pofolio-note") === "yes");
        setSelected(collection?.entries.find((e) => e.url === pending.url));
        setModal(s.profile ? "entry" : "profile");
        sessionStorage.removeItem("pofolio-pending");
        sessionStorage.removeItem("pofolio-note");
      } else if (!s.profile) setModal("profile");
    } else setDiary(null);
    return s;
  }, [discover, isPublic, path]);
  useEffect(() => {
    void refresh().catch((e) => setError(message(e)));
  }, [refresh]);
  function add(d: Draft = { ...blank }, note = false) {
    setFocusNote(note);
    setSaved("");
    const existing = diary?.entries.find((e) => d.url && e.url === d.url);
    if (existing) {
      setSelected(existing);
      setDraft(undefined);
      setModal("entry");
      return;
    }
    const pick = picks.find((p) => p.url === d.url);
    if (!session?.user && pick) {
      sessionStorage.setItem("pofolio-pending", pick.art);
      sessionStorage.setItem("pofolio-note", note ? "yes" : "no");
    }
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
    const query = new URLSearchParams(location.search);
    if (session && query.has("signin")) {
      const reason = query.get("error");
      if (reason) {
        const messages: Record<string, string> = {
          access_denied: "Sign-in was canceled. You can try again.",
          email_not_found:
            "Your provider didn't share an email address. Allow email access or choose another sign-in method.",
          account_not_linked:
            "An account already uses this email. Sign in with your original method, then connect the provider in Profile settings.",
        };
        setCallbackError(
          Object.hasOwn(messages, reason)
            ? messages[reason]
            : "Sign-in could not be completed. Try again with the provider you used for this diary.",
        );
      }
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
    sessionStorage.removeItem("pofolio-pending");
    sessionStorage.removeItem("pofolio-note");
    setCallbackError("");
    setModal(null);
    setDraft(undefined);
  }
  const unknown = !(isPublic || discover || path === "/");
  return (
    <>
      <a href="#content" className="skip">
        Skip to content
      </a>
      {path === "/" && <Entrance />}
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
        {path === "/" && (
          <ListeningDeck save={saveFeatured} records={diary?.entries} />
        )}
        {saved && (
          <p className="save-feedback" role="status">
            {saved}
          </p>
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
              add={(kind) => add({ ...blank, kind })}
              edit={(e) => {
                setFocusNote(false);
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
          <div id="archive">
            <Shelf save={add} />
          </div>
        )}
      </main>
      <footer>
        <div className="frame footer-inner">
          <div>
            <Brand />
            <span>An open-source listening diary</span>
            <a href="/privacy/">Privacy &amp; deletion</a>
          </div>
          <span className="footer-note">
            <Headphones size={15} /> Podcasts · Audiobooks · Documentaries
          </span>
        </div>
      </footer>
      {modal === "auth" &&
        (session ? (
          <AuthForm
            session={session}
            creating={creating}
            callbackError={callbackError}
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
        <ProfileForm
          session={session}
          callbackError={callbackError}
          close={close}
          done={done}
        />
      )}
      {modal === "entry" && (
        <EntryForm
          focusNote={focusNote}
          initial={draft}
          entry={selected}
          close={close}
          done={async () => {
            await done();
            setSaved("Archive updated.");
          }}
        />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
