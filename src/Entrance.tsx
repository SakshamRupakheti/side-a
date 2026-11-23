import { useEffect, useRef, useState } from "react";
function firstVisit() {
  try {
    return (
      !sessionStorage.getItem("suni-entrance") &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}
export function Entrance() {
  const [open, setOpen] = useState(firstVisit);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    try {
      sessionStorage.setItem("suni-entrance", "seen");
    } catch {
      /* Storage is optional. */
    }
    const target = document
      .querySelector(".top .brand")
      ?.getBoundingClientRect();
    if (target && root.current) {
      root.current.style.setProperty(
        "--logo-x",
        target.x + target.width / 2 - window.innerWidth / 2 + "px",
      );
      root.current.style.setProperty(
        "--logo-y",
        target.y + target.height / 2 - window.innerHeight / 2 + "px",
      );
      root.current.style.setProperty(
        "--logo-scale",
        String(
          target.width /
            (root.current.querySelector("strong")?.getBoundingClientRect()
              .width || 400),
        ),
      );
    }
    const end = () => setOpen(false);
    const timer = window.setTimeout(end, 3100);
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    motion.addEventListener("change", end);
    return () => {
      clearTimeout(timer);
      motion.removeEventListener("change", end);
    };
  }, [open]);
  return open ? (
    <div
      className="entrance"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <div className="intro-line" />
      <strong aria-label="suni.">
        <span>su</span>
        <span>ni</span><i aria-hidden="true">.</i>
      </strong>
      <p>Keep what you heard.</p>
      <button onClick={() => setOpen(false)}>Skip intro ↗</button>
    </div>
  ) : null;
}
