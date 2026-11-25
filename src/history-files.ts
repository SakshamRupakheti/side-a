import { BlobReader, ZipReader } from "@zip.js/zip.js/index-native.js";
import { Parser } from "htmlparser2";
import { Organizer } from "./history-recognition.ts";
import type { EvidenceKind } from "../shared/history.ts";

const MiB = 1024 * 1024,
  memberLimit = 48 * MiB,
  recordLimit = 64 * 1024;
const invalid = () =>
  new Error("The history file is malformed. Choose the original export.");
type Kind = EvidenceKind | "auto";
function format(
  name: string,
  inside: boolean,
): { format: string; kind: Kind } | null {
  const path = name.toLowerCase(),
    base = path.split("/").pop() ?? "",
    ext = base.split(".").pop();
  if (!["json", "html", "csv"].includes(ext ?? "")) return null;
  if (/watch[-_ ]history\.(json|html)$/.test(base))
    return { format: ext!, kind: "watch" };
  if (
    /(?:^|\/)playlists?\//.test(path) ||
    /playlist|saved[-_ ]videos|watch[-_ ]later|liked[-_ ]videos|favorites|^.+-videos\.csv$/.test(
      base,
    ) ||
    (!inside && ext === "csv")
  )
    return {
      format: ext!,
      kind: /saved|watch[-_ ]later|liked[-_ ]videos|favorites/.test(path)
        ? "saved"
        : "playlist",
    };
  if (
    ext === "json" &&
    /(?:streaming[_ ]?history|endsong|streaminghistory)/.test(base)
  )
    return { format: ext, kind: "stream" };
  return !inside && ext === "json" ? { format: ext, kind: "auto" } : null;
}
function jsonRows(input: string, add: (r: unknown) => void) {
  // Find each complete JSON value without allocating an array of all raw events.
  let i = 0;
  const whitespace = () => {
    while (i < input.length && /\s/.test(input[i])) i++;
  };
  whitespace();
  if (input[i++] !== "[") throw invalid();
  whitespace();
  if (input[i] !== "]")
    for (;;) {
      const start = i;
      let depth = 0,
        quoted = false,
        escaped = false;
      for (; i < input.length; i++) {
        const c = input[i];
        if (i - start > recordLimit || depth > 32)
          throw Error("A history record is too large or deeply nested.");
        if (quoted) {
          if (escaped) escaped = false;
          else if (c === "\\") escaped = true;
          else if (c === '"') quoted = false;
        } else if (c === '"') quoted = true;
        else if (c === "{" || c === "[") depth++;
        else if (depth === 0 && (c === "," || c === "]")) break;
        else if (c === "}" || c === "]") depth--;
        if (depth < 0) throw invalid();
      }
      let row;
      try {
        row = JSON.parse(input.slice(start, i));
      } catch {
        throw invalid();
      }
      add(row);
      if (input[i] === "]") break;
      if (input[i++] !== ",") throw invalid();
      whitespace();
    }
  if (input[i++] !== "]") throw invalid();
  whitespace();
  if (i !== input.length) throw invalid();
}
function csvRows(s: string, add: (r: unknown) => void) {
  let headers: string[] | null = null,
    row: string[] = [],
    cell = "",
    quoted = false,
    closed = false,
    len = 0;
  const finish = () => {
    row.push(cell);
    if (!headers) {
      headers = row.map((x) => x.trim());
      if (!headers.includes("Video ID"))
        throw Error(
          "Choose a playlist video CSV containing a Video ID column.",
        );
    } else if (row.some(Boolean))
      add(Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])));
    row = [];
    cell = "";
    closed = false;
    len = 0;
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (++len > recordLimit || row.length > 100) throw invalid();
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === ",") {
      row.push(cell);
      closed = false;
      cell = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      finish();
    } else if (closed) throw invalid();
    else if (c === '"') {
      if (cell) throw invalid();
      quoted = true;
    } else cell += c;
  }
  if (quoted) throw invalid();
  if (cell || row.length || closed) finish();
}
function watchHtml(s: string, add: (r: unknown) => void) {
  let depth = 0,
    start = -1,
    blocked = 0,
    link: { href: string; text: string } | null = null,
    links: { href: string; text: string }[] = [],
    lines = "",
    size = 0,
    cells = 0;
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        depth++;
        if (depth > 128) throw invalid();
        if (name === "script" || name === "style") blocked++;
        if (blocked) return;
        if (
          start === -1 &&
          name === "div" &&
          (attrs.class ?? "").split(/\s+/).includes("content-cell")
        ) {
          start = depth;
          links = [];
          lines = "";
          size = 0;
          cells++;
        }
        if (start < 0) return;
        if (name === "br") lines += "\n";
        if (name === "a" && links.length < 8)
          link = { href: (attrs.href ?? "").slice(0, 2048), text: "" };
      },
      ontext(t) {
        if (start < 0 || blocked) return;
        if ((size += t.length) > recordLimit) throw invalid();
        lines += t;
        if (link) link.text += t;
      },
      onclosetag(name) {
        if (!blocked && start >= 0) {
          if (name === "a" && link) {
            links.push(link);
            link = null;
          }
          if (depth === start) {
            if (links.length || /^\s*Watched\b/i.test(lines))
              add({
                titleUrl: links[0]?.href,
                title: links[0]?.text,
                channel: links[1]?.text,
                time: lines.trim().split("\n").pop(),
              });
            start = -1;
            link = null;
          }
        }
        if (name === "script" || name === "style")
          blocked = Math.max(0, blocked - 1);
        depth--;
      },
    },
    { decodeEntities: true },
  );
  parser.end(s);
  if (!cells && !/<html\b/i.test(s)) throw invalid();
}
function parse(
  s: string,
  type: NonNullable<ReturnType<typeof format>>,
  org: Organizer,
) {
  const add = (row: unknown) => {
    if (
      row &&
      typeof row === "object" &&
      "snippet" in row &&
      row.snippet &&
      typeof row.snippet === "object"
    ) {
      const snippet = row.snippet as Record<string, unknown>;
      const resource = snippet.resourceId as { videoId?: string } | undefined;
      org.accept(
        {
          videoId: resource?.videoId,
          title: snippet.title,
          channelTitle: snippet.videoOwnerChannelTitle,
          time: snippet.publishedAt,
        },
        type.kind,
      );
    } else org.accept(row, type.kind);
  };
  if (type.format === "html") watchHtml(s, add);
  else if (type.format === "csv") csvRows(s, add);
  else jsonRows(s, add);
}
function safePath(path: string) {
  return (
    path.length <= 1200 &&
    !/^[\\/]|[\\:]/.test(path) &&
    Array.from(path).every((c) => c.charCodeAt(0) >= 32) &&
    !path.split("/").some((x) => x === ".." || x === ".")
  );
}
async function checkDirectory(blob: Blob) {
  const tail = new DataView(await blob.slice(-65557).arrayBuffer());
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (
      tail.getUint32(i, true) !== 0x06054b50 ||
      i + 22 + tail.getUint16(i + 20, true) !== tail.byteLength
    )
      continue;
    if (
      tail.getUint16(i + 4, true) ||
      tail.getUint16(i + 6, true) ||
      tail.getUint16(i + 10, true) > 10000 ||
      tail.getUint32(i + 12, true) > 4 * MiB
    )
      throw Error(
        "Split, ZIP64 or oversized ZIP directories are unsupported. Select the history files directly.",
      );
    return;
  }
  throw Error("This ZIP is incomplete or unsupported.");
}
export async function organizeFiles(
  files: File[],
  progress: (scanned: number, files: number) => void = () => {},
) {
  if (
    !files.length ||
    files.length > 128 ||
    files.reduce((n, f) => n + f.size, 0) > 512 * MiB
  )
    throw Error("Choose up to 128 files totaling at most 512 MiB.");
  const org = new Organizer();
  let bytes = 0,
    processed = 0;
  const read = (
    data: Uint8Array,
    type: NonNullable<ReturnType<typeof format>>,
  ) => {
    if ((bytes += data.length) > 256 * MiB)
      throw Error(
        "The selected history exceeds 256 MiB. Use fewer history files.",
      );
    parse(new TextDecoder("utf-8", { fatal: true }).decode(data), type, org);
    progress(org.scanned, ++processed);
  };
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      const type = format(file.name, false);
      if (!type)
        throw Error(
          "Choose a Spotify history, YouTube history or playlist file.",
        );
      if (file.size > memberLimit)
        throw Error("Individual history files must be 48 MiB or smaller.");
      read(new Uint8Array(await file.arrayBuffer()), type);
      continue;
    }
    await checkDirectory(file);
    const zip = new ZipReader(new BlobReader(file), {
      useWebWorkers: false,
      checkSignature: true,
      checkOverlappingEntry: true,
    });
    try {
      let members = 0,
        expanded = 0,
        matched = false;
      for await (const entry of zip.getEntriesGenerator()) {
        if (
          ++members > 10000 ||
          !safePath(entry.filename) ||
          !safePath(new TextDecoder().decode(entry.rawFilename)) ||
          entry.symlink
        )
          throw Error("Unsafe ZIP member or directory.");
        if (
          (expanded += entry.uncompressedSize) > 4 * 1024 * MiB ||
          entry.uncompressedSize > Math.max(1024, entry.compressedSize) * 250
        )
          throw Error("ZIP expansion exceeds the safety limit.");
        if (entry.directory) continue;
        const type = format(entry.filename, true);
        if (!type || /\/playlists\/playlists\.csv$/i.test(entry.filename))
          continue;
        if (
          entry.encrypted ||
          entry.uncompressedSize > memberLimit ||
          bytes + entry.uncompressedSize > 256 * MiB
        )
          throw Error("Encrypted or oversized history member.");
        let used = 0;
        const output = new Uint8Array(entry.uncompressedSize);
        await entry.getData(
          new WritableStream<Uint8Array>({
            write(chunk) {
              if (used + chunk.length > output.length)
                throw Error("ZIP member expanded beyond its declaration.");
              output.set(chunk, used);
              used += chunk.length;
            },
          }),
        );
        if (used !== output.length) throw Error("Incomplete ZIP member.");
        read(output, type);
        matched = true;
      }
      if (!matched)
        throw Error("No supported listening history was found in this ZIP.");
    } finally {
      await zip.close();
    }
  }
  return org.result();
}
