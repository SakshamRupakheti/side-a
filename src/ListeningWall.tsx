import { useEffect, useState } from "react";
import {
  socialBadges,
  type WallListener,
  type WallPage,
} from "../shared/social";
import { api, message } from "./ui";
import { picks } from "./picks";

type FollowState = { active: boolean; pending: boolean; error?: string };
type Section = "ranked" | "fresh";
type Controls = {
  follow: (person: WallListener) => void;
  states: Record<string, FollowState>;
};
function Listener({
  person,
  rank,
  follow,
  states,
}: { person: WallListener; rank?: number } & Controls) {
  const state = states[person.username];
  const following = state?.active ?? !!person.following;
  const covers = person.covers.flatMap((cover) => {
    const pick = cover.url && picks.find((p) => p.url === cover.url);
    const src = pick ? "/art/" + pick.art + ".webp" : cover.artwork;
    return src ? [{ src, title: cover.title }] : [];
  });
  return (
    <article className="wall-person">
      {rank && (
        <span className="wall-rank" aria-label={`Rank ${rank}`}>
          {String(rank).padStart(2, "0")}
        </span>
      )}
      <div className="wall-identity">
        <span className="wall-initial" aria-hidden="true">
          {Array.from(person.display_name.trim())[0]}
        </span>
        <h3>
          <a href={"/u/" + person.username}>
            {person.display_name}
            <small>@{person.username}</small>
          </a>
        </h3>
      </div>
      <button
        type="button"
        aria-label={`${following ? "Unfollow" : "Follow"} @${person.username}`}
        aria-pressed={following}
        aria-disabled={state?.pending || undefined}
        onClick={() => follow(person)}
      >
        {following ? "Following" : "Follow"}
      </button>
      <div className="wall-details">
        <small>
          {person.badges.length} sharing{" "}
          {person.badges.length === 1 ? "badge" : "badges"}
        </small>
        {person.badges.slice(-2).map((id) => (
          <span className={"wall-stamp stamp-" + id} key={id}>
            {socialBadges[id]}
          </span>
        ))}
        {covers.length > 0 && (
          <div className="wall-covers">
            {covers.map((cover, i) => (
              <img
                src={cover.src}
                alt={cover.title}
                key={i}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.hidden = true;
                }}
              />
            ))}
          </div>
        )}
      </div>
      {state?.error && (
        <p className="wall-error" role="alert">
          {state.error}
        </p>
      )}
    </article>
  );
}
function WallSection({
  section,
  ...controls
}: { section: Section } & Controls) {
  const [people, setPeople] = useState<WallListener[]>([]);
  const [after, setAfter] = useState("");
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api<WallPage>(
      "/wall/" + section + (after ? "?after=" + encodeURIComponent(after) : ""),
    )
      .then((page) => {
        if (!live) return;
        setPeople((prev) =>
          after
            ? [
                ...prev,
                ...page.people.filter(
                  (p) => !prev.some((old) => old.username === p.username),
                ),
              ]
            : page.people,
        );
        setNext(page.next);
      })
      .catch((e) => {
        if (live) setError(message(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [section, after, attempt]);
  const ranked = section === "ranked";
  return (
    <section
      className="wall-section"
      id={section}
      aria-labelledby={"heading-" + section}
    >
      <h2 id={"heading-" + section}>
        {ranked ? "Listening Wall" : "Fresh Voices"}
      </h2>
      <p>
        {ranked
          ? "Listeners who chose to share their rank, ordered by earned sharing badges."
          : "Meet the listeners behind the latest public postcards."}
      </p>
      {people.map((person, i) => (
        <Listener
          key={person.username}
          person={person}
          rank={ranked ? i + 1 : undefined}
          {...controls}
        />
      ))}
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </p>
      )}
      {loading && <p role="status">Loading listeners…</p>}
      {!error && !loading && !people.length && (
        <p className="social-empty">
          {ranked
            ? "No eligible listeners have joined the ranking yet."
            : "New voices will appear as listeners publish postcards."}
        </p>
      )}
      {next && !error && (
        <button disabled={loading} onClick={() => setAfter(next)}>
          More {ranked ? "ranked listeners" : "fresh voices"}
        </button>
      )}
    </section>
  );
}
export default function ListeningWall({
  signedIn,
  signin,
}: {
  signedIn: boolean;
  signin: () => void;
}) {
  const [states, setStates] = useState<Controls["states"]>({});
  async function follow(person: WallListener) {
    if (!signedIn) return signin();
    const previous = states[person.username];
    if (previous?.pending) return;
    const active = previous?.active ?? !!person.following;
    const update = (value: FollowState) =>
      setStates((prev) => ({ ...prev, [person.username]: value }));
    update({ active: !active, pending: true });
    try {
      const result = await api<{ active: boolean }>(
        "/me/social/follow/" + person.username,
        "PUT",
        { active: !active },
      );
      update({ active: result.active, pending: false });
    } catch (e) {
      update({ active, pending: false, error: message(e) });
    }
  }
  return (
    <>
      <a className="plainlink" href="#fresh">
        Jump to Fresh Voices
      </a>
      <WallSection section="ranked" follow={follow} states={states} />
      <WallSection section="fresh" follow={follow} states={states} />
    </>
  );
}
