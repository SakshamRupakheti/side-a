import {
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X, ArrowUpRight, BookOpen, Compass, Plus } from "lucide-react";
import type { Profile } from "../shared/diary";
import type { SocialProvider } from "../shared/sign-in";

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "The diary is offline. Check your connection and try again.",
    );
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const failure = data as {
      error?: string | { message: string };
      message?: string;
    } | null;
    throw new Error(
      (typeof failure?.error === "string"
        ? failure.error
        : failure?.error?.message) ||
        failure?.message ||
        "The diary is unavailable. Try again.",
    );
  }
  return data as T;
}
export type Session = {
  linkedProviders: string[];
  user: { name: string; email: string } | null;
  profile: Profile | null;
  methods: Record<SocialProvider | "local", boolean>;
};
export const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong.";
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
export function ErrorText({ text }: { text: string }) {
  return text ? (
    <p className="error" role="alert">
      {text}
    </p>
  ) : null;
}
export function Modal({
  title,
  children,
  cinematic = false,
  close,
}: {
  title: string;
  children: ReactNode;
  cinematic?: boolean;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useLayoutEffect(() => {
    const d = ref.current!;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const start = trigger?.getBoundingClientRect();
    d.showModal();
    let animation: Animation | undefined;
    if (
      cinematic &&
      start &&
      trigger !== document.body &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const end = d.getBoundingClientRect();
      const dx = start.left + start.width / 2 - end.left - end.width / 2;
      const dy = start.top + start.height / 2 - end.top - end.height / 2;
      animation = d.animate(
        [
          {
            opacity: 0,
            transform: "translate(" + dx + "px," + dy + "px) scale(.12)",
          },
          { opacity: 1, transform: "none" },
        ],
        { duration: 260, easing: "cubic-bezier(.2,.8,.25,1)" },
      );
    }
    return () => {
      animation?.cancel();
      d.close();
    };
  }, [cinematic]);
  return (
    <dialog
      ref={ref}
      className={cinematic ? "composer" : undefined}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="modal-head">
        <h2 id={id}>{title}</h2>
        <button className="icon" onClick={close} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Brand() {
  return (
    <a className="brand" href="/" aria-label="PoFolio home">
      PoFolio
    </a>
  );
}
export function Header({
  session,
  open,
  add,
  active,
}: {
  session: Session | null;
  open: () => void;
  add: () => void;
  active: string;
}) {
  return (
    <header>
      <div className="frame top">
        <Brand />
        <nav aria-label="Main">
          <a
            className={active === "diary" ? "current" : ""}
            href={session?.user ? "/#archive" : "/?signin"}
          >
            <BookOpen /> My Archive
          </a>
          <a
            className={active === "discover" ? "current" : ""}
            href="/discover"
          >
            <Compass /> Explore
          </a>
          <button className="nav-add" onClick={add} aria-label="Add a listen">
            <span className="nav-add-surface">
              <Plus size={15} aria-hidden="true" />
              Add
            </span>
          </button>
        </nav>
        <button className="button top-action" onClick={open}>
          {session?.user ? "Profile settings" : "Sign in"}
          <ArrowUpRight size={15} />
        </button>
      </div>
    </header>
  );
}
