import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { statuses, type Entry } from "../shared/diary";
import { durationWords, momentDestination } from "../shared/experience";
import { coverFor } from "./picks";
import { Modal } from "./ui";

export function RecordView({
  entry,
  close,
  edit,
}: {
  entry: Entry;
  close: () => void;
  edit: () => void;
}) {
  const x = entry.experience,
    cover = coverFor(entry);
  return (
    <Modal title={entry.title} close={close}>
      <article className="record-detail">
        {cover && (
          <img className="record-cover" src={cover} alt="Cover artwork" />
        )}
        <p className="record-byline">
          {[entry.creator, entry.show_name].filter(Boolean).join(" · ")}
        </p>
        <p>
          {[
            entry.kind,
            statuses[entry.status],
            x.duration_seconds ? durationWords(x.duration_seconds) : null,
            entry.rating ? entry.rating + "/5" : null,
            entry.replays ? entry.replays + " replays" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {entry.url && (
          <a
            className="plainlink"
            href={entry.url}
            target="_blank"
            rel="noreferrer"
          >
            Original source <ArrowUpRight size={15} />
          </a>
        )}
        {x.source_description && (
          <details>
            <summary>Publisher’s description</summary>
            <p>{x.source_description}</p>
          </details>
        )}
        {x.personal_description && (
          <section>
            <h3>In your own words</h3>
            <p>{x.personal_description}</p>
          </section>
        )}
        {x.reflection && (
          <section className="record-reflection">
            <h3>What stayed with you</h3>
            <p>{x.reflection}</p>
          </section>
        )}
        {!!x.moments.length && (
          <section>
            <h3>Favorite moments</h3>
            <ol>
              {x.moments.map((m, i) => {
                const link = momentDestination(entry.url, m.timestamp);
                return (
                  <li key={i}>
                    {m.timestamp && <small>{m.timestamp}</small>}
                    {m.title && <strong>{m.title}</strong>}
                    {m.description && <p>{m.description}</p>}
                    {link && (
                      <a
                        className="plainlink"
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open on YouTube at {m.timestamp}{" "}
                        <ArrowUpRight size={13} />
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
        {entry.note && (
          <section>
            <h3>
              <LockKeyhole size={14} /> Private note
            </h3>
            <p>{entry.note}</p>
          </section>
        )}
        {entry.takeaway && (
          <section>
            <h3>Public takeaway</h3>
            <p>{entry.takeaway}</p>
          </section>
        )}
        <button className="button" onClick={edit}>
          Edit listen
        </button>
      </article>
    </Modal>
  );
}
