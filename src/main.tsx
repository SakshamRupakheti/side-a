import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, Brand, Header, message, type Session } from "./ui";
import { AuthForm, ProfileForm } from "./Forms";
import { Shelf, Discover } from "./Shelf";
import { Journal, Published } from "./Journal";
import {
  blank,
  type DeckChange,
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
import { PersonalCollection } from "./PersonalCollection";
import { RecordView } from "./RecordView";
import { Modal } from "./ui";
import { EntryComposer } from "./EntryComposer";
import "./style.css";
import "./composer.css";

const Social = React.lazy(() => import("./Social"));
const HistoryImport = React.lazy(() => import("./HistoryImport"));
type Collection = {
  entries: Entry[];
  featured: Entry[];
  stats: Stats;
  next_cursor: string | null;
};
type Dialog = "record" | "opening" | "auth" | "profile" | "entry" | null;
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [modal, setModal] = useState<Dialog>(null);
  const [focusNote, setFocusNote] = useState(false);
  const [saved, setSaved] = useState("");
  const [change, setChange] = useState<DeckChange | null>(null);
  const authOwner = React.useRef<string | null>(null);
  const refreshVersion = React.useRef(0);
  const detailVersion = React.useRef(0);
  const saving = React.useRef(false);
  const featuredKeys = React.useRef(new Map<string, string>());
  function savedRecord(url: string) {
    return (
      diary?.entries.find((e) => e.url === url) ??
      diary?.featured.find((e) => e.url === url)
    );
  }
  async function saveFeatured(d: Draft, note = false) {
    if (note || !session?.user || !session.profile || savedRecord(d.url)) {
      add(d, note);
      return;
    }
    if (saving.current) return;
    saving.current = true;
    setError("");
    setSaved("");
    try {
      const key = featuredKeys.current.get(d.url) ?? crypto.randomUUID();
      featuredKeys.current.set(d.url, key);
      const { id } = await api<{ id: string }>("/me/entries", "POST", {
        ...d,
        import_key: key,
      });
      featuredKeys.current.delete(d.url);
      setChange({ kind: "created", id });
      setSaved("Added to your collection.");
      await refresh();
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
  const [diary, setDiary] = useState<Collection | null>(null),
    [pub, setPub] = useState<PublicPage | null>(null);
  const path = location.pathname.replace(/\/$/, "") || "/",
    isPublic = path.startsWith("/u/"),
    discover = path === "/discover",
    social =
      ["/feed", "/people"].includes(path) ||
      path.startsWith("/p/") ||
      path.startsWith("/write/"),
    lab = path === "/swipe-lab",
    importing = path === "/import";
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    setError("");
    if (isPublic) {
      setPub(await api("/u/" + encodeURIComponent(path.slice(3))));
      return;
    }
    const s = await api<Session>("/session");
    if (version !== refreshVersion.current) return;
    if (authOwner.current !== (s.user?.email ?? null)) {
      if (authOwner.current) {
        setSelected(undefined);
        setDraft(undefined);
        setModal(null);
      }
      authOwner.current = s.user?.email ?? null;
      detailVersion.current++;
      setChange(null);
      setDiary(null);
      setSaved("");
      featuredKeys.current.clear();
    }
    setSession(s);
    if (importing || social) return s;
    if (s.user) {
      const featured = new URLSearchParams(
        picks.map((p) => ["featured", p.url]),
      );
      const collection = await api<Collection>(
        lab || discover || sessionStorage.getItem("pofolio-pending")
          ? "/me/diary?" + featured
          : "/me/diary",
      );
      if (version !== refreshVersion.current) return;
      setDiary(collection);
      const pending = picks.find(
        (p) => p.art === sessionStorage.getItem("pofolio-pending"),
      );
      const handoff = sessionStorage.getItem("pofolio-compose-handoff");
      if (handoff) {
        sessionStorage.removeItem("pofolio-compose-handoff");
        try {
          const saved = JSON.parse(handoff);
          if (saved.expires > Date.now() && saved.draft?.experience) {
            setSelected(undefined);
            setDraft(saved.draft);
            setFocusNote(false);
            setModal(s.profile ? "entry" : "profile");
            return s;
          }
        } catch {
          /* Discard an incomplete handoff. */
        }
      }
      if (pending) {
        setDraft(draftFromPick(pending));
        setFocusNote(sessionStorage.getItem("pofolio-note") === "yes");
        setSelected(collection.featured.find((e) => e.url === pending.url));
        setModal(s.profile ? "entry" : "profile");
        sessionStorage.removeItem("pofolio-pending");
        sessionStorage.removeItem("pofolio-note");
      } else if (!s.profile) setModal("profile");
    } else setDiary(null);
    return s;
  }, [isPublic, path, lab, discover, importing, social]);
  useEffect(() => {
    void refresh().catch((e) => setError(message(e)));
  }, [refresh]);
  function add(d: Draft = { ...blank }, note = false) {
    setFocusNote(note);
    setSaved("");
    const existing = d.url && savedRecord(d.url);
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
  function compose() {
    if (isPublic) {
      location.assign("/?add");
      return;
    }
    setSaved("");
    setDraft({ ...blank });
    setSelected(undefined);
    setFocusNote(false);
    setModal("entry");
  }
  function authenticate(d: Draft) {
    setDraft(d);
    setCreating(false);
    if (session?.user) {
      setModal("profile");
      return;
    }
    sessionStorage.setItem(
      "pofolio-compose-handoff",
      JSON.stringify({ draft: d, expires: Date.now() + 30 * 60000 }),
    );
    setModal("auth");
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
    if (session?.user && query.has("edit")) {
      const id = query.get("edit") ?? "";
      if (/^[a-f0-9-]{36}$/.test(id)) {
        history.replaceState(null, "", "/");
        void openRecord(id, true);
      }
    }
    if (session && query.has("add")) {
      history.replaceState(null, "", "/");
      setDraft({ ...blank });
      setSelected(undefined);
      setFocusNote(false);
      setModal("entry");
    }
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
  async function openRecord(id: string, edit: boolean) {
    const version = ++detailVersion.current;
    setModal("opening");
    setError("");
    try {
      const item = await api<Entry>("/me/entries/" + encodeURIComponent(id));
      if (version !== detailVersion.current) return;
      setSelected(item);
      setDraft(undefined);
      setFocusNote(false);
      setModal(edit ? "entry" : "record");
    } catch (e) {
      if (version === detailVersion.current) {
        setModal(null);
        setError(message(e));
      }
    }
  }
  function signedOut() {
    refreshVersion.current++;
    detailVersion.current++;
    authOwner.current = null;
    setSession(null);
    setDiary(null);
    setSelected(undefined);
    setChange(null);
    setSaved("");
    featuredKeys.current.clear();
    close();
    localStorage.setItem("suni-session-changed", String(Date.now()));
    void refresh().catch((e) => setError(message(e)));
  }
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key === "suni-session-changed") location.reload();
    };
    const check = async () => {
      if (document.visibilityState !== "visible" || isPublic) return;
      try {
        const s = await api<Session>("/session");
        if ((s.user?.email ?? null) !== authOwner.current) location.reload();
      } catch {
        /* Allow offline use of the open view. */
      }
    };
    const navigate = () => location.reload();
    window.addEventListener("popstate", navigate);
    window.addEventListener("storage", changed);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("popstate", navigate);
      window.removeEventListener("storage", changed);
      document.removeEventListener("visibilitychange", check);
    };
  }, [isPublic]);
  function close() {
    detailVersion.current++;
    sessionStorage.removeItem("pofolio-compose-handoff");
    sessionStorage.removeItem("pofolio-pending");
    sessionStorage.removeItem("pofolio-note");
    setCallbackError("");
    setModal(null);
    setDraft(undefined);
  }
  function closeAccountDialog() {
    const returnToDraft = !!draft?.import_key;
    if (!returnToDraft) {
      close();
      return;
    }
    sessionStorage.removeItem("pofolio-compose-handoff");
    setModal("entry");
  }
  const [paging, setPaging] = useState(false);
  const cursor = isPublic ? pub?.next_cursor : diary?.next_cursor;
  async function loadMore() {
    if (!cursor || paging) return;
    setPaging(true);
    setError("");
    try {
      const query = "?cursor=" + encodeURIComponent(cursor);
      if (isPublic) {
        const page = await api<PublicPage>(
          "/u/" + encodeURIComponent(path.slice(3)) + query,
        );
        setPub((current) =>
          current && current === pub
            ? { ...page, entries: [...current.entries, ...page.entries] }
            : current,
        );
      } else {
        const page = await api<Collection>("/me/diary" + query);
        setDiary((current) =>
          current && current === diary
            ? {
                ...page,
                featured: current.featured,
                entries: [...current.entries, ...page.entries],
              }
            : current,
        );
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setPaging(false);
    }
  }
  const unknown = !(
    isPublic ||
    social ||
    discover ||
    lab ||
    importing ||
    path === "/"
  );
  return (
    <>
      <a href="#content" className="skip">
        Skip to content
      </a>
      {path === "/" && <Entrance />}
      <Header
        active={isPublic || lab ? "" : discover ? "discover" : "diary"}
        session={session}
        open={access}
        add={compose}
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
        {lab ? (
          <ListeningDeck lab save={saveFeatured} records={diary?.featured} />
        ) : (
          path === "/" &&
          (!session ? (
            <section className="deck" aria-busy="true">
              <p role="status">Opening your collection…</p>
            </section>
          ) : session.user ? (
            <PersonalCollection
              key={session.user.email}
              change={change}
              add={compose}
              open={openRecord}
            />
          ) : (
            <ListeningDeck save={saveFeatured} />
          ))
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
        ) : social ? (
          <React.Suspense
            fallback={<p role="status">Opening social discovery…</p>}
          >
            <Social session={session} signin={access} />
          </React.Suspense>
        ) : importing ? (
          !session ? (
            <p role="status">Opening import…</p>
          ) : session.user ? (
            <React.Suspense fallback={<p role="status">Opening import…</p>}>
              <HistoryImport
                key={session.user.email}
                owner={session.user.email}
              />
            </React.Suspense>
          ) : (
            <section className="pageintro">
              <h1>Import listening history</h1>
              <p>Sign in to import into your private collection.</p>
              <button className="button primary" onClick={access}>
                Sign in
              </button>
            </section>
          )
        ) : lab ? null : isPublic ? (
          pub ? (
            <Published page={pub} />
          ) : (
            !error && <p role="status">Opening profile…</p>
          )
        ) : discover ? (
          <Discover save={add} signedIn={!!session?.user} signIn={access} />
        ) : !session ? null : session.user ? (
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
        {cursor && !lab && !discover && (
          <button className="button" disabled={paging} onClick={loadMore}>
            {paging ? "Loading…" : "Load more listens"}
          </button>
        )}
      </main>
      <footer>
        <div className="frame footer-inner">
          <div>
            <Brand />
            <span>An open-source listening diary</span>
            <a href="/feed">Listening feed</a>
            <a href="/privacy/">Privacy &amp; deletion</a>
          </div>
          <span className="footer-note">
            Podcasts · Audiobooks · Documentaries
          </span>
        </div>
      </footer>
      <span className="site-watermark">Rupakhetism</span>
      {modal === "opening" && (
        <Modal title="Opening record" close={close}>
          <p role="status">Opening your listen…</p>
        </Modal>
      )}
      {modal === "record" && selected && (
        <RecordView
          entry={selected}
          close={close}
          edit={() => setModal("entry")}
        />
      )}
      {modal === "auth" &&
        (session ? (
          <AuthForm
            session={session}
            creating={creating}
            callbackError={callbackError}
            close={closeAccountDialog}
            done={done}
          />
        ) : (
          <section className="loading" role="status">
            {error || "Opening sign-in…"}
            <button onClick={close}>Close</button>
          </section>
        ))}
      {modal === "profile" && session && (
        <ProfileForm
          signedOut={signedOut}
          session={session}
          callbackError={callbackError}
          close={closeAccountDialog}
          done={done}
        />
      )}
      {modal === "entry" && (
        <EntryComposer
          signedIn={!!session?.profile}
          authenticate={authenticate}
          focusNote={focusNote}
          initial={draft}
          entry={selected}
          close={close}
          done={async (result) => {
            close();
            if (discover && result.kind === "created") {
              history.pushState(null, "", "/");
            }
            setChange(result);
            setSaved(
              result.kind === "created"
                ? "Added to your collection."
                : result.kind === "deleted"
                  ? "Listen removed."
                  : "Listen updated.",
            );
            await refresh().catch((e) => setError(message(e)));
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
