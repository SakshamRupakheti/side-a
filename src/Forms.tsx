import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { api, ErrorText, Modal, type Session, useAction } from "./ui";
import {
  socialProviders,
  providerNames,
  type SocialProvider,
} from "../shared/sign-in";
import { emptyProfile, type Profile } from "../shared/diary";

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
    <Modal title={signup ? "Start your suni. diary" : "Welcome back to suni."} close={close}>
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
