import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, Bookmark, Heart, UsersRound } from "lucide-react";
import { api, message, type Session } from "./ui";
import type { Post, PostDraft, Person, Sleeve } from "../shared/social";
import { picks } from "./picks";
import "./social.css";
import ListeningWall from "./ListeningWall";

function Artwork({ item, url }: { item: Sleeve; url?: string }) {
  const local = picks.find((x) => url && x.url === url);
  const cover = local ? "/art/" + local.art + ".webp" : item.artwork;
  return cover ? (
    <img
      className="social-cover"
      alt=""
      loading="lazy"
      src={cover}
      referrerPolicy="no-referrer"
    />
  ) : null;
}
function SleeveBody({
  item,
  url,
  link,
}: {
  item: Sleeve;
  url?: string;
  link?: string;
}) {
  return (
    <>
      <div className="sleeve-media">
        <Artwork item={item} url={url} />
        <div>
          <small className="social-label">{item.kind}</small>
          <h2>{link ? <a href={link}>{item.title}</a> : item.title}</h2>
          <p>
            {[...new Set([item.creator, item.show_name].filter(Boolean))].join(
              " · ",
            )}
          </p>
        </div>
      </div>
      {item.caption && <p className="sleeve-caption">{item.caption}</p>}
      {item.takeaway && <blockquote>{item.takeaway}</blockquote>}
      {!!item.moments.length && (
        <details>
          <summary>Shared moments ({item.moments.length})</summary>
          {item.moments.map((m, i) => (
            <div key={i} className="sleeve-moment">
              <strong>{m.title}</strong>
              {m.position_seconds !== null && (
                <small>
                  {" "}
                  ·{" "}
                  {new Date(m.position_seconds * 1000)
                    .toISOString()
                    .slice(11, 19)}
                </small>
              )}
              <p>{m.reflection}</p>
            </div>
          ))}
        </details>
      )}
    </>
  );
}
function FindListeners({ current = false }: { current?: boolean }) {
  return (
    <a
      className="find-listeners"
      href="/people"
      aria-current={current ? "page" : undefined}
    >
      <UsersRound size={28} strokeWidth={1.5} aria-hidden="true" />
      <span>Find Listeners</span>
    </a>
  );
}
function SocialNav({ active }: { active: string }) {
  const links = [
    ["Discover", "/feed"],
    ["Following", "/feed?scope=following"],
    ["Saved posts", "/feed?scope=saved"],
  ];
  return (
    <nav className="social-nav" aria-label="Social discovery">
      <FindListeners current={active === "People"} />
      {links.map(([text, url]) => (
        <a
          key={url}
          aria-current={active === text ? "page" : undefined}
          href={url}
        >
          {text}
        </a>
      ))}
    </nav>
  );
}
function useAction(refresh: () => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function act(path: string, method: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, method, data);
      refresh();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, act };
}
function Safety({
  name,
  post,
  act,
  busy,
}: {
  name: string;
  post?: string;
  act: ReturnType<typeof useAction>["act"];
  busy: boolean;
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [sent, setSent] = useState(false);
  return (
    <details className="social-safety">
      <summary>Safety options</summary>
      <button disabled={busy} onClick={() => setOpen(!open)}>
        Report {post ? "post" : "profile"}
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await act("/me/social/report", "POST", {
                kind: post ? "post" : "profile",
                target: post ?? name,
                reason,
              })
            ) {
              setSent(true);
              setOpen(false);
            }
          }}
        >
          <label>
            Reason for reporting
            <textarea
              required
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={busy}>Send report</button>
        </form>
      )}
      {sent && <p role="status">Report received.</p>}
      <button
        disabled={busy}
        onClick={() =>
          void act("/me/social/block/" + name, "PUT", { active: true })
        }
      >
        Block @{name}
      </button>
      <small>
        Blocking applies while signed in. Public pages remain available to
        visitors.
      </small>
    </details>
  );
}
function PostCard({
  post,
  session,
  refresh,
  signin,
}: {
  post: Post;
  session: Session | null;
  refresh: () => void;
  signin: () => void;
}) {
  const { act, busy, error } = useAction(refresh);
  function toggle(type: string, target: string, on: boolean) {
    if (!session?.user) return signin();
    void act("/me/social/" + type + "/" + target, "PUT", { active: !on });
  }
  return (
    <article className="social-sleeve">
      <div className="sleeve-author">
        <a href={"/u/" + post.username}>
          {post.display_name} <span>@{post.username}</span>
        </a>
        <time dateTime={post.published_at}>
          {new Date(post.published_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </time>
      </div>
      <SleeveBody item={post} url={post.url} link={"/p/" + post.id} />
      <div className="sleeve-actions">
        <button
          disabled={busy}
          aria-pressed={!!post.liked}
          onClick={() => toggle("like", post.id, !!post.liked)}
        >
          <Heart size={15} /> Like · {post.likes}
        </button>
        <button
          disabled={busy}
          aria-pressed={!!post.bookmarked}
          onClick={() => toggle("bookmark", post.id, !!post.bookmarked)}
        >
          <Bookmark size={15} />
          {post.bookmarked ? "Saved" : "Save"}
        </button>
        {!post.mine && (
          <button
            disabled={busy}
            aria-pressed={!!post.following}
            onClick={() => toggle("follow", post.username, !!post.following)}
          >
            {post.following ? "Following" : "Follow"}
          </button>
        )}
        {post.url && (
          <a href={post.url} target="_blank" rel="noreferrer">
            Source <ArrowUpRight size={14} />
          </a>
        )}
      </div>
      {session?.user && !post.mine && (
        <Safety name={post.username} post={post.id} act={act} busy={busy} />
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
function PersonCard({
  p,
  session,
  refresh,
  signin,
}: {
  p: Person;
  session: Session | null;
  refresh: () => void;
  signin: () => void;
}) {
  const { act, error, busy } = useAction(refresh);
  return (
    <article className="social-person">
      <h2>
        <a href={"/u/" + p.username}>{p.display_name}</a>
      </h2>
      <small>@{p.username}</small>
      <p>{p.bio}</p>
      {!p.mine && (
        <button
          disabled={busy}
          aria-pressed={!!p.following}
          onClick={() =>
            session?.user
              ? void act("/me/social/follow/" + p.username, "PUT", {
                  active: !p.following,
                })
              : signin()
          }
        >
          {p.following ? "Following" : "Follow"}
        </button>
      )}
      {session?.user && !p.mine && (
        <Safety name={p.username} act={act} busy={busy} />
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
function Editor({ entry, settings }: { entry: string; settings: () => void }) {
  const [draft, setDraft] = useState<PostDraft>(),
    [caption, setCaption] = useState(""),
    [take, setTake] = useState(false),
    [mom, setMom] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [deleting, setDeleting] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    api<PostDraft>("/me/posts/" + entry)
      .then((d) => {
        if (live) {
          setDraft(d);
          setCaption(d.caption ?? "");
          setTake(!!d.include_takeaway);
          setMom(!!d.include_moments);
        }
      })
      .catch((e) => {
        if (live) setError(message(e));
      });
    return () => {
      live = false;
    };
  }, [entry, version]);
  async function save(published: boolean, remove = false) {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await api(
        "/me/posts/" + entry,
        remove ? "DELETE" : "PUT",
        remove
          ? { revision: draft.revision }
          : {
              revision: draft.revision ?? 0,
              entry_revision: draft.entry_revision,
              caption,
              published,
              include_takeaway: take,
              include_moments: mom,
            },
      );
      setStatus(
        remove
          ? "Post deleted."
          : published
            ? "Post published."
            : "Private draft saved.",
      );
      setDeleting(false);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>
        Post to <em>suni.</em>
      </h1>
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setVersion((v) => v + 1)}>
            Reload record
          </button>
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {draft ? (
        <>
          <p>Choose what appears on this listening postcard.</p>
          <label>
            Caption
            <textarea
              maxLength={400}
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </label>
          {draft.takeaway && (
            <label className="social-check">
              <input
                type="checkbox"
                checked={take}
                onChange={(e) => setTake(e.target.checked)}
              />
              Include public takeaway
            </label>
          )}
          {!!draft.moments.length && (
            <label className="social-check">
              <input
                type="checkbox"
                checked={mom}
                onChange={(e) => setMom(e.target.checked)}
              />
              Include individually shared moments
            </label>
          )}
          <section aria-label="Post preview" className="social-sleeve">
            <div className="sleeve-author">@{draft.username} · Preview</div>
            <SleeveBody
              url={draft.url}
              item={{
                ...draft,
                caption,
                takeaway: take ? draft.takeaway : "",
                moments: mom ? draft.moments : [],
              }}
            />
          </section>
          {!draft.profile_public && (
            <p>
              Publishing requires a public profile.{" "}
              <button onClick={settings}>Open profile settings</button>
            </p>
          )}
          {!draft.shared && (
            <p>
              This entry is private.{" "}
              <a href={"/?edit=" + entry}>Edit entry sharing</a>
            </p>
          )}
          {(!!draft.hidden || !!draft.profile_hidden) && (
            <p>This record is hidden by moderation.</p>
          )}
          <div className="sleeve-actions">
            <button
              className="button primary"
              disabled={
                busy ||
                !draft.shared ||
                !draft.profile_public ||
                !!draft.hidden ||
                !!draft.profile_hidden
              }
              onClick={() => void save(true)}
            >
              {draft.published ? "Update published post" : "Publish post"}
            </button>
            <button disabled={busy} onClick={() => void save(false)}>
              {draft.published
                ? "Unpublish and save draft"
                : "Save private draft"}
            </button>
            {draft.id && (
              <button disabled={busy} onClick={() => setDeleting(true)}>
                Delete post
              </button>
            )}
            {!!draft.published && !!draft.shared && !!draft.profile_public && (
              <a href={"/p/" + draft.id}>View post</a>
            )}
          </div>
          {deleting && (
            <div role="group" aria-label="Confirm deletion">
              <p>
                Delete this post and its likes and bookmarks? Your diary entry
                stays in your archive.
              </p>
              <button disabled={busy} onClick={() => void save(false, true)}>
                Confirm delete
              </button>
              <button onClick={() => setDeleting(false)}>Cancel</button>
            </div>
          )}
        </>
      ) : (
        !error && <p role="status">Opening your saved record…</p>
      )}
    </>
  );
}
type Page = {
  posts?: Post[];
  people?: Person[];
  next_cursor?: string | null;
  next?: string | null;
};
export default function Social({
  session,
  signin,
}: {
  session: Session | null;
  signin: () => void;
}) {
  const path = location.pathname,
    people = path === "/people",
    direct = path.startsWith("/p/"),
    editing = path.startsWith("/write/");
  const params = new URLSearchParams(location.search),
    scope = params.get("scope") ?? "discover",
    author = params.get("author") ?? "";
  const blocked = people && params.get("view") === "blocked";
  const active = people
    ? "People"
    : scope === "following"
      ? "Following"
      : scope === "saved"
        ? "Saved posts"
        : "Discover";
  const [text, setText] = useState(""),
    [term, setTerm] = useState(""),
    [version, setVersion] = useState(0),
    [page, setPage] = useState<Page>({}),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [cursor, setCursor] = useState(""),
    [more, setMore] = useState(false);
  const refresh = () => {
    setCursor("");
    setVersion((v) => v + 1);
  };
  const gated =
    editing || blocked || (!people && !direct && scope !== "discover");
  const account = session?.user?.email;
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(text.trim());
      setCursor("");
    }, 220);
    return () => clearTimeout(timer);
  }, [text]);
  const wall = people && !blocked && !term;
  useEffect(() => {
    if (wall || !session || editing || (gated && !account)) return;
    let live = true;
    setError("");
    if (!cursor) {
      setLoading(true);
      setPage({});
    } else setMore(true);
    const args = new URLSearchParams();
    if (term) args.set("q", term);
    if (!people) args.set("scope", scope);
    if (author) args.set("author", author);
    if (cursor) args.set(people ? "after" : "cursor", cursor);
    const endpoint = blocked
      ? "/me/social/blocks"
      : people
        ? "/people"
        : direct
          ? path
          : "/feed";
    api<Page | Post>(endpoint + "?" + args)
      .then((r) => {
        if (!live) return;
        const data = direct ? { posts: [r as Post] } : (r as Page);
        setPage((prev) => ({
          ...data,
          posts: [...(cursor ? (prev.posts ?? []) : []), ...(data.posts ?? [])],
          people: [
            ...(cursor ? (prev.people ?? []) : []),
            ...(data.people ?? []),
          ],
        }));
      })
      .catch((e) => {
        if (live) setError(message(e));
      })
      .finally(() => {
        if (live) {
          setLoading(false);
          setMore(false);
        }
      });
    return () => {
      live = false;
    };
  }, [
    session,
    account,
    author,
    blocked,
    wall,
    cursor,
    direct,
    editing,
    gated,
    path,
    people,
    scope,
    term,
    version,
  ]);
  const heading = blocked
    ? "Blocked listeners"
    : people
      ? "People"
      : direct
        ? "Listening postcard"
        : author
          ? "Posts by @" + author
          : active === "Discover"
            ? "Listening feed"
            : active;
  let content: ReactNode;
  if (!session) content = <p role="status">Opening…</p>;
  else if (gated && !account)
    content = (
      <>
        <h1>{editing ? "Post to suni." : heading}</h1>
        <button className="button" onClick={signin}>
          Sign in to continue
        </button>
      </>
    );
  else if (editing)
    content = (
      <Editor
        entry={path.slice(7)}
        settings={signin}
        key={(account ?? "") + String(session.profile?.published)}
      />
    );
  else
    content = (
      <>
        <h1>
          {heading}
          <em>.</em>
        </h1>
        {!direct && !blocked && (
          <label className="social-search">
            {people
              ? "Search by name or username"
              : "Search title, creator or show"}
            <input
              type="search"
              maxLength={64}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        )}
        {people && account && (
          <a
            className="plainlink"
            href={blocked ? "/people" : "/people?view=blocked"}
          >
            {blocked ? "Find listeners" : "Manage blocked listeners"}
          </a>
        )}
        {!wall && error && (
          <p role="alert">
            {error} <button onClick={refresh}>Try again</button>
          </p>
        )}
        {wall ? (
          <ListeningWall
            key={account ?? "guest"}
            signedIn={!!account}
            signin={signin}
          />
        ) : loading ? (
          <p role="status">Loading {people ? "listeners" : "posts"}…</p>
        ) : (
          <>
            {page.posts?.map((post) => (
              <PostCard key={post.id} {...{ post, session, signin, refresh }} />
            ))}
            {page.people?.map((p) =>
              blocked ? (
                <div className="social-person" key={p.username}>
                  @{p.username}{" "}
                  <button
                    onClick={() =>
                      void api("/me/social/block/" + p.username, "PUT", {
                        active: false,
                      })
                        .then(refresh)
                        .catch((e) => setError(message(e)))
                    }
                  >
                    Unblock
                  </button>
                </div>
              ) : (
                <PersonCard
                  key={p.username}
                  {...{ p, session, signin, refresh }}
                />
              ),
            )}
            {!error && !page.posts?.length && !page.people?.length && (
              <p className="social-empty">
                {people
                  ? blocked
                    ? "Your block list is empty."
                    : "No published listeners match."
                  : scope === "saved"
                    ? "Posts you bookmark will appear here."
                    : scope === "following"
                      ? "Follow a listener to see their published posts here."
                      : "No published listening posts match yet."}
                {!people && scope === "following" && (
                  <>
                    <br />
                    <FindListeners />
                  </>
                )}
              </p>
            )}
            {(page.next_cursor || page.next) && (
              <button
                className="button"
                disabled={more}
                onClick={() => setCursor((page.next_cursor || page.next)!)}
              >
                {more ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        )}
      </>
    );
  return (
    <div className="social-layout">
      <SocialNav active={active} />
      <section className="social-reading">{content}</section>
    </div>
  );
}
