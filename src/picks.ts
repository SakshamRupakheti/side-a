import type { Draft } from "../shared/diary";
import { blank } from "../shared/diary";

type Pick = {
  art: string;
  title: string;
  show: string;
  creator: string;
  category: string;
  kind: Draft["kind"];
  url: string;
  why: string;
};
export const picks: Pick[] = [
  {
    art: "groove",
    title: "Lorde — “Sober”",
    show: "Song Exploder",
    creator: "Hrishikesh Hirway",
    category: "Music",
    kind: "podcast",
    url: "https://songexploder.net/lorde",
    why: "Lorde revisits the early demos behind a song from Melodrama.",
  },
  {
    art: "signal",
    title: "Ten Thousand Years",
    show: "99% Invisible",
    creator: "Roman Mars",
    category: "Design",
    kind: "podcast",
    url: "https://99percentinvisible.org/episode/ten-thousand-years/",
    why: "How do you design a warning that someone can read ten millennia from now?",
  },
  {
    art: "botanic",
    title: "The Intelligence of Plants",
    show: "On Being",
    creator: "Krista Tippett",
    category: "Nature",
    kind: "podcast",
    url: "https://onbeing.org/programs/robin-wall-kimmerer-the-intelligence-of-plants-2022/",
    why: "Botanist Robin Wall Kimmerer listens closely to what plants can teach us.",
  },
  {
    art: "time",
    title: "The Time Machine",
    show: "H. G. Wells",
    creator: "H. G. Wells",
    category: "Science fiction",
    kind: "audiobook",
    url: "https://librivox.org/the-time-machine-by-hg-wells/",
    why: "A Victorian inventor travels to a future where humanity has split in two.",
  },
  {
    art: "garden",
    title: "The Secret Garden",
    show: "Frances Hodgson Burnett",
    creator: "Frances Hodgson Burnett",
    category: "Fiction",
    kind: "audiobook",
    url: "https://librivox.org/the-secret-garden-by-frances-hodgson-burnett/",
    why: "A locked door in a Yorkshire garden gives Mary Lennox a reason to stay curious.",
  },
  {
    art: "universe",
    title: "Universe",
    show: "National Film Board of Canada",
    creator: "Roman Kroitor and Colin Low",
    kind: "documentary",
    category: "Science",
    url: "https://www.nfb.ca/film/universe/",
    why: "An observatory at night opens onto an imagined voyage through space.",
  },
  {
    art: "sea",
    title: "The Awakening",
    show: "Kate Chopin",
    creator: "Kate Chopin",
    category: "Classics",
    kind: "audiobook",
    url: "https://librivox.org/the-awakening-by-kate-chopin/",
    why: "On the Louisiana coast, Edna Pontellier begins to imagine a life of her own.",
  },
];
export function draftFromPick(pick: Pick): Draft {
  return {
    ...blank,
    title: pick.title,
    kind: pick.kind,
    url: pick.url,
    creator: pick.creator,
    show_name: pick.kind === "podcast" ? pick.show : "",
  };
}

export function coverFor(entry: { url: string; artwork: string }) {
  const pick = picks.find((p) => p.url === entry.url);
  return entry.artwork || (pick ? "/art/" + pick.art + ".webp" : "");
}
