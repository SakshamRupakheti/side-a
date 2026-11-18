import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X, AudioLines, ArrowUpRight, BookOpen, Compass } from "lucide-react";
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
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby={id} onCancel={close}>
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
    <a className="brand" href="/" aria-label="Side A home">
      <span className="brandmark">
        <AudioLines strokeWidth={2.3} />
      </span>
      Side A<span className="brand-dot">.</span>
    </a>
  );
}
export function Header({
  session,
  open,
  active,
}: {
  session: Session | null;
  open: () => void;
  active: string;
}) {
  return (
    <header>
      <div className="frame top">
        <Brand />
        <nav aria-label="Main">
          <a className={active === "diary" ? "current" : ""} href="/">
            <BookOpen /> Diary
          </a>
          <a
            className={active === "discover" ? "current" : ""}
            href="/discover"
          >
            <Compass /> Discover
          </a>
        </nav>
        <button className="button top-action" onClick={open}>
          {session?.user ? "Profile settings" : "Sign in"}
          <ArrowUpRight size={15} />
        </button>
      </div>
    </header>
  );
}
