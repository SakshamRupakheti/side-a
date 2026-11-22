export interface Moment {
  timestamp: string;
  title: string;
  description: string;
}
export interface Experience {
  source_description: string;
  duration_seconds: number | null;
  personal_description: string;
  reflection: string;
  moments: Moment[];
}
export const emptyExperience: Experience = {
  source_description: "",
  duration_seconds: null,
  personal_description: "",
  reflection: "",
  moments: [],
};
export function timestampSeconds(value: string) {
  const match = /^(\d{2,4}):([0-5]\d):([0-5]\d)$/.exec(value);
  return match
    ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    : null;
}
export function clockTime(seconds: number) {
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
export function durationWords(seconds: number) {
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor(seconds / 60) % 60,
    rest = seconds % 60;
  return [
    [hours, "hour"],
    [minutes, "minute"],
    [rest, "second"],
  ]
    .filter(([n]) => n)
    .map(([n, label]) => n + " " + label + (n === 1 ? "" : "s"))
    .join(" and ");
}
export function reflectionPrompt(seconds: number | null) {
  return seconds
    ? "Of " +
        (seconds === 1 || seconds === 60 || seconds === 3600
          ? "this "
          : "these ") +
        durationWords(seconds) +
        ", what stayed with you?"
    : "What stayed with you?";
}
export function momentDestination(source: string, stamp: string) {
  const seconds = timestampSeconds(stamp);
  if (seconds === null || !source) return null;
  try {
    const u = new URL(source);
    if (
      u.origin !== "https://www.youtube.com" ||
      u.pathname !== "/watch" ||
      !/^[-\w]{11}$/.test(u.searchParams.get("v") || "")
    )
      return null;
    const dest = new URL("https://www.youtube.com/watch");
    dest.searchParams.set("v", u.searchParams.get("v")!);
    dest.searchParams.set("t", seconds + "s");
    return dest.href;
  } catch {
    return null;
  }
}
