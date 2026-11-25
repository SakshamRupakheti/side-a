import { useState } from "react";
import { Download } from "lucide-react";
import type { PublicPage } from "../shared/diary";
import { picks } from "./picks";
export function SharePoster({ page }: { page: PublicPage }) {
  const [message, setMessage] = useState("");
  async function download() {
    try {
      await document.fonts.ready;
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.fillStyle = "#101014";
      ctx.fillRect(0, 0, 1080, 1350);
      ctx.fillStyle = "#ff3038";
      ctx.fillRect(68, 102, 64, 6);
      ctx.fillStyle = "#f5f2ed";
      ctx.font = '700 52px "Anybody Variable", sans-serif';
      ctx.fillText("suni.", 68, 200);
      ctx.font = '30px "IBM Plex Mono", monospace';
      ctx.fillText("PUBLIC ARCHIVE", 68, 332);
      ctx.fillStyle = "#ffd447";
      ctx.font = '800 92px "Anybody Variable", sans-serif';
      ctx.fillText("@" + page.username, 60, 451, 960);
      const entries = page.entries.slice(0, 3);
      for (const [i, e] of entries.entries()) {
        const y = 565 + i * 188;
        ctx.fillStyle = "#343437";
        ctx.fillRect(68, y, 944, 2);
        const cover = picks.find((p) => p.url === e.url);
        if (cover) {
          const img = new Image();
          img.src = "/art/" + cover.art + ".webp";
          await img.decode();
          ctx.drawImage(img, 68, y + 22, 132, 132);
        } else {
          ctx.fillStyle = "#75202a";
          ctx.fillRect(68, y + 22, 132, 132);
          ctx.fillStyle = "#ffd447";
          ctx.font = '64px "Anybody Variable", sans-serif';
          ctx.fillText(e.title.slice(0, 1), 90, y + 111);
        }
        ctx.fillStyle = "#ffd447";
        ctx.font = '24px "IBM Plex Mono", monospace';
        ctx.fillText(e.kind.toUpperCase(), 230, y + 64);
        ctx.fillStyle = "#f5f2ed";
        ctx.font = '700 43px "Anybody Variable", sans-serif';
        ctx.fillText(e.title, 230, y + 126, 760);
      }
      ctx.fillStyle = "#f5f2ed";
      ctx.font = '26px "IBM Plex Mono", monospace';
      ctx.fillText(location.host + "/u/" + page.username, 68, 1258, 944);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Export failed");
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "suni-" + page.username + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Share card downloaded.");
    } catch {
      setMessage("Could not create the share card. Try again.");
    }
  }
  return (
    <>
      <button
        className="button poster-download"
        onClick={() => void download()}
      >
        <Download size={16} /> Download share card
      </button>
      <span role="status">{message}</span>
    </>
  );
}
