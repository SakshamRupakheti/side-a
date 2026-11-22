import { useRef, useState } from "react";
import { ArrowRight, Link2, LockKeyhole } from "lucide-react";
import { api, ErrorText, Modal, type Session, useAction } from "./ui";
import {
  socialProviders,
  providerNames,
  type SocialProvider,
} from "../shared/sign-in";
import {
  blank,
  emptyProfile,
  statuses,
  type Draft,
  type Entry,
  type Profile,
} from "../shared/diary";

type FormProps = { close: () => void; done: () => Promise<void> };
async function startProvider(
  provider: SocialProvider,
  path: "/auth/sign-in/social" | "/auth/link-social",
) {
  const res = await api<{ url: string }>(path, "POST", {
    provider,
    callbackURL: "/",
    disableRedirect: true,
  });
  window.location.assign(res.url);
}
export function AuthForm({
  session,
  creating,
  callbackError,
  close,
  done,
}: { session: Session; creating: boolean; callbackError: string } & FormProps) {
  const act = useAction(),
    [signup, setSignup] = useState(creating);
  const enabled = socialProviders.filter(
    (provider) => session.methods[provider],
  );
  return (
    <Modal title={signup ? "Start your diary" : "Welcome back"} close={close}>
      <ErrorText text={callbackError} />
      {enabled.length > 0 && (
        <div className="social">
          {enabled.map((p) => (
            <button
              key={p}
              disabled={act.busy}
              className="button"
              onClick={() =>
                void act.run(() => startProvider(p, "/auth/sign-in/social"))
              }
            >
              Continue with {providerNames[p]} <ArrowRight size={16} />
            </button>
          ))}
        </div>
      )}
      {session.methods.local && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            void act.run(async () => {
              await api(
                signup ? "/auth/sign-up/email" : "/auth/sign-in/email",
                "POST",
                data,
              );
              await done();
            });
          }}
        >
          <p className="helper">Local development account</p>
          {signup && (
            <label>
              Name
              <input name="name" autoComplete="name" required maxLength={80} />
            </label>
          )}
          <label>
            Email
            <input required type="email" autoComplete="email" name="email" />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={12}
              name="password"
            />
          </label>
          <small>Use at least 12 characters.</small>
          <button disabled={act.busy} className="button primary">
            {act.busy ? "Please wait…" : signup ? "Create account" : "Sign in"}{" "}
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="plainlink"
            onClick={() => setSignup(!signup)}
          >
            {signup ? "Already have an account? Sign in" : "Create a new diary"}
          </button>
        </form>
      )}
      {!Object.values(session.methods).some(Boolean) && (
        <p>
          Sign-in is awaiting setup. The site owner can enable Google, Facebook
          or GitHub.
        </p>
      )}
      <ErrorText text={act.error} />
    </Modal>
  );
}
export function ProfileForm({
  session,
  callbackError,
  close,
  done,
}: { session: Session; callbackError: string } & FormProps) {
  const [p, set] = useState<Profile>(
    session.profile || {
      ...emptyProfile,
      display_name: session.user?.name || "",
    },
  );
  const [deleting, setDeleting] = useState(false),
    [confirm, setConfirm] = useState(""),
    act = useAction();
  const switches = {
    published: "Publish my profile",
    show_finished: "Finished episode count",
    show_shows: "Shows explored",
    show_replays: "Replay count",
    show_badges: "Milestone badges",
  } as const;
  return (
    <Modal
      title={session.profile ? "Profile settings" : "Choose your username"}
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api("/me/profile", "PUT", p);
            await done();
          });
        }}
      >
        <label>
          Username
          <input
            required
            pattern="[a-z0-9][a-z0-9_]{2,29}"
            maxLength={30}
            value={p.username}
            onChange={(e) =>
              set({ ...p, username: e.target.value.toLowerCase() })
            }
          />
        </label>
        <small>Your profile address is /u/{p.username || "username"}.</small>
        <label>
          Display name
          <input
            required
            maxLength={80}
            value={p.display_name}
            onChange={(e) => set({ ...p, display_name: e.target.value })}
          />
        </label>
        <label>
          Bio
          <textarea
            maxLength={400}
            value={p.bio}
            onChange={(e) => set({ ...p, bio: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>Public profile</legend>
          {(Object.keys(switches) as (keyof typeof switches)[]).map((k) => (
            <label className="check" key={k}>
              <input
                type="checkbox"
                checked={p[k]}
                onChange={(e) => set({ ...p, [k]: e.target.checked })}
              />
              {switches[k]}
            </label>
          ))}
          <small>Public statistics and badges count shared entries only.</small>
        </fieldset>
        <button className="button primary" disabled={act.busy}>
          Save profile
        </button>
      </form>
      <div className="account-tools">
        <ErrorText text={callbackError} />
        {socialProviders
          .filter((provider) => session.methods[provider])
          .map((provider) =>
            session.linkedProviders.includes(provider) ? (
              <span key={provider}>{providerNames[provider]} connected</span>
            ) : (
              <button
                key={provider}
                disabled={act.busy}
                onClick={() =>
                  void act.run(() =>
                    startProvider(provider, "/auth/link-social"),
                  )
                }
              >
                Connect {providerNames[provider]}
              </button>
            ),
          )}
        <a href="/api/me/export" download>
          Export my data
        </a>
        <button
          onClick={() =>
            void act.run(async () => {
              await api("/auth/sign-out", "POST", {});
              await done();
            })
          }
        >
          Sign out
        </button>
        <button onClick={() => setDeleting(!deleting)}>Delete account</button>
      </div>
      {deleting && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act.run(async () => {
              await api("/me/account", "DELETE", { confirmation: confirm });
              await done();
            });
          }}
        >
          <label>
            Type DELETE to permanently remove your account and diary.
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <button
            disabled={confirm !== "DELETE" || act.busy}
            className="button danger"
          >
            Permanently delete account
          </button>
        </form>
      )}
      <ErrorText text={act.error} />
    </Modal>
  );
}
export function EntryForm({
  entry,
  initial,
  close,
  done,
}: { entry?: Entry; initial?: Draft } & FormProps) {
  const [v, set] = useState<Draft>(entry || initial || { ...blank }),
    [hint, setHint] = useState(""),
    [loading, setLoading] = useState(false),
    [deleting, setDeleting] = useState(false);
  const lookupId = useRef(0),
    last = useRef(""),
    act = useAction();
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    set((prev) => ({ ...prev, [key]: value }));
  }
  async function lookup(raw: string) {
    raw = raw.trim();
    if (entry || !raw || raw === last.current) return;
    const id = ++lookupId.current;
    last.current = raw;
    setLoading(true);
    setHint("");
    try {
      const result = await api<{
        url: string;
        title: string;
        creator: string;
        artwork: string;
        available: boolean;
      }>("/me/metadata", "POST", { url: raw });
      if (id !== lookupId.current) return;
      set((prev) => ({
        ...prev,
        url: result.url,
        title: prev.title || result.title,
        creator: prev.creator || result.creator,
        artwork: result.artwork,
        kind: result.url.includes("open.spotify.com/audiobook/")
          ? "audiobook"
          : prev.kind,
      }));
      last.current = result.url;
      setHint(
        result.available
          ? "Details added. You can edit them below."
          : "Add the details below to log this item.",
      );
    } catch (e) {
      if (id === lookupId.current)
        setHint(
          e instanceof Error
            ? e.message
            : "Lookup failed. Enter details manually.",
        );
    } finally {
      if (id === lookupId.current) setLoading(false);
    }
  }
  return (
    <Modal
      title={entry ? "Edit listening entry" : "Log a listen"}
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api(
              entry ? "/me/entries/" + entry.id : "/me/entries",
              entry ? "PUT" : "POST",
              { ...v, ...(entry && { revision: entry.revision }) },
            );
            await done();
          });
        }}
      >
        <label>
          <span>
            <Link2 size={15} /> Source link
          </span>
          <input
            readOnly={!!entry}
            type="url"
            maxLength={2048}
            placeholder="Spotify, YouTube or a publisher link"
            value={v.url}
            onBlur={(e) => void lookup(e.target.value)}
            onChange={(e) => {
              ++lookupId.current;
              last.current = "";
              setLoading(false);
              setHint("");
              set((prev) => ({ ...prev, url: e.target.value, artwork: "" }));
            }}
          />
        </label>
        <small aria-live="polite">
          {loading
            ? "Looking up details…"
            : hint ||
              "Paste a link for available metadata, or enter a title manually."}
        </small>
        <label>
          Title
          <input
            required
            value={v.title}
            maxLength={250}
            onChange={(e) => change("title", e.target.value)}
          />
        </label>
        <details>
          <summary>Artwork</summary>
          <label>
            Provider image URL
            <input
              type="url"
              maxLength={2048}
              value={v.artwork}
              onChange={(e) => change("artwork", e.target.value)}
            />
          </label>
          <small>Use a Spotify or YouTube thumbnail URL, or leave blank.</small>
        </details>
        <div className="pair">
          <label>
            Format
            <select
              value={v.kind}
              onChange={(e) => change("kind", e.target.value as Draft["kind"])}
            >
              <option value="podcast">Podcast episode</option>
              <option value="audiobook">Audiobook</option>
            </select>
          </label>
          <label>
            Status
            <select
              value={v.status}
              onChange={(e) =>
                change("status", e.target.value as Draft["status"])
              }
            >
              {Object.entries(statuses).map(([k, s]) => (
                <option value={k} key={k}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="pair">
          <label>
            Creator
            <input
              maxLength={180}
              value={v.creator}
              onChange={(e) => change("creator", e.target.value)}
            />
          </label>
          {v.kind === "podcast" && (
            <label>
              Podcast show
              <input
                maxLength={180}
                value={v.show_name}
                onChange={(e) => change("show_name", e.target.value)}
              />
            </label>
          )}
        </div>
        <div className="pair">
          <label>
            Rating
            <select
              value={v.rating ?? ""}
              onChange={(e) =>
                change("rating", e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Unrated</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </select>
          </label>
          <label>
            Additional replays
            <input
              type="number"
              min="0"
              max="100000"
              disabled={!entry?.finished_at && v.status !== "finished"}
              value={v.replays}
              onChange={(e) => change("replays", Number(e.target.value))}
            />
          </label>
        </div>
        <label>
          <span>
            <LockKeyhole size={14} /> Private note
          </span>
          <textarea
            maxLength={8000}
            value={v.note}
            onChange={(e) => change("note", e.target.value)}
          />
        </label>
        <label>
          Public takeaway
          <textarea
            maxLength={2000}
            value={v.takeaway}
            onChange={(e) => change("takeaway", e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={v.shared}
            onChange={(e) => change("shared", e.target.checked)}
          />{" "}
          Share this entry on my public profile
        </label>
        <button className="button primary" disabled={act.busy || loading}>
          Save entry <ArrowRight size={16} />
        </button>
      </form>
      {entry && (
        <div className="account-tools">
          <button onClick={() => setDeleting(!deleting)}>Delete entry</button>
          {deleting && (
            <button
              className="danger"
              disabled={act.busy}
              onClick={() =>
                void act.run(async () => {
                  await api("/me/entries/" + entry.id, "DELETE", {
                    revision: entry.revision,
                  });
                  await done();
                })
              }
            >
              Confirm permanent deletion
            </button>
          )}
        </div>
      )}
      <ErrorText text={act.error} />
    </Modal>
  );
}
