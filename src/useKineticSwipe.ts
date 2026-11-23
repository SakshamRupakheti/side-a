import { flushSync } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  advance,
  inputSpeed,
  recordSample,
  released,
  stopped,
  type Motion,
  type Sample,
  type Tuning,
} from "./swipe-physics";

export type SwipeReading = {
  speed: number;
  travel: number;
  elapsed: number;
  interrupted: boolean;
};
export function useKineticSwipe(settings: Tuning) {
  const stage = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState(() => stopped(0));
  const [reading, setReading] = useState<SwipeReading | null>(null);
  const live = useRef(motion),
    tuning = useRef(settings),
    animation = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const run = useRef<{ position: number; time: number; speed: number } | null>(
    null,
  );
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    origin: number;
    unit: number;
    drag: boolean;
    samples: Sample[];
  } | null>(null);
  const suppressClick = useRef(false);
  useLayoutEffect(() => {
    tuning.current = settings;
  }, [settings]);
  const publish = useCallback((m: Motion) => {
    live.current = m;
    setMotion(m);
  }, []);
  const finishReading = useCallback((interrupted: boolean) => {
    const r = run.current;
    if (!r) return;
    setReading({
      speed: r.speed,
      travel: Math.abs(live.current.position - r.position),
      elapsed: Math.max(0, performance.now() - r.time),
      interrupted,
    });
    run.current = null;
  }, []);
  const cancel = useCallback(() => {
    cancelAnimationFrame(animation.current);
    clearTimeout(wheelTimer.current);
    finishReading(true);
  }, [finishReading]);
  const animate = useCallback(
    (start: Motion) => {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        publish(
          stopped(
            start.phase === "coast" ? Math.round(start.position) : start.target,
          ),
        );
        finishReading(false);
        return;
      }
      publish(start);
      let last = performance.now();
      function frame(now: number) {
        // A long scheduling gap must not skip a whole foreground item on resume.
        const dt = Math.min(1 / 30, Math.max(0, now - last) / 1000);
        last = now;
        const next = advance(live.current, dt, tuning.current.damping);
        publish(next);
        if (next.phase !== "rest")
          animation.current = requestAnimationFrame(frame);
        else finishReading(false);
      }
      animation.current = requestAnimationFrame(frame);
    },
    [publish, finishReading],
  );
  const select = useCallback(
    (destination: number) => {
      cancel();
      gesture.current = null;
      animate({
        ...stopped(live.current.position),
        phase: "snap",
        target: destination,
      });
    },
    [cancel, animate],
  );
  function move(direction: number) {
    select(
      (live.current.phase === "snap"
        ? live.current.target
        : Math.round(live.current.position)) + direction,
    );
  }
  const unit = useCallback(() => {
    const cover = stage.current?.querySelector<HTMLElement>(".sleeve");
    return Math.max(1, cover?.offsetWidth ?? 200) / tuning.current.sensitivity;
  }, []);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    function wheel(e: WheelEvent) {
      if (
        gesture.current ||
        e.ctrlKey ||
        Math.abs(e.deltaX) <= Math.abs(e.deltaY)
      )
        return;
      e.preventDefault();
      cancel();
      const scale =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el!.clientWidth : 1;
      publish({
        ...stopped(live.current.position + (e.deltaX * scale) / unit()),
        phase: "drag",
      });
      // Trackpads already emit inertial deltas. Snap only after the stream ends.
      wheelTimer.current = setTimeout(
        () => select(Math.round(live.current.position)),
        85,
      );
    }
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", wheel);
      cancelAnimationFrame(animation.current);
      clearTimeout(wheelTimer.current);
    };
  }, [cancel, select, unit, publish]);

  function down(e: PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary || e.button !== 0) return;
    suppressClick.current = live.current.phase !== "rest";
    cancel();
    const origin = live.current.position;
    publish(stopped(origin));
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      origin,
      unit: unit(),
      drag: false,
      samples: [{ x: e.clientX, time: e.timeStamp }],
    };
  }
  function drag(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    const firstMove = !g.drag;
    if (firstMove) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) >= 3) {
        gesture.current = null;
        select(Math.round(live.current.position));
        return;
      }
      if (Math.abs(dx) < 1 || Math.abs(dx) < Math.abs(dy)) return;
      g.drag = true;
      suppressClick.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    for (const sample of e.nativeEvent.getCoalescedEvents?.() ?? [])
      recordSample(g.samples, sample.clientX, sample.timeStamp);
    recordSample(g.samples, e.clientX, e.timeStamp);
    const position = g.origin - dx / g.unit;
    const next: Motion = {
      ...stopped(position),
      phase: "drag",
      velocity: inputSpeed(g.samples, e.timeStamp, g.unit),
    };
    // Commit the first displacement in the input event; batch subsequent samples.
    if (firstMove) flushSync(() => publish(next));
    else publish(next);
  }
  function release(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.drag || e.type !== "pointerup") {
      select(Math.round(live.current.position));
      return;
    }
    recordSample(g.samples, e.clientX, e.timeStamp);
    const position = g.origin - (e.clientX - g.x) / g.unit;
    const next = released(
      position,
      inputSpeed(g.samples, e.timeStamp, g.unit),
      tuning.current,
    );
    run.current = {
      position,
      time: performance.now(),
      speed: Math.abs(next.velocity),
    };
    animate(next);
  }
  function leave() {
    if (gesture.current && !gesture.current.drag) {
      gesture.current = null;
      select(Math.round(live.current.position));
    }
  }
  return {
    stage,
    motion,
    reading,
    select,
    move,
    suppressClick,
    handlers: {
      onPointerDown: down,
      onPointerMove: drag,
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave: leave,
      onLostPointerCapture: (e: PointerEvent<HTMLDivElement>) => {
        // A touch can transfer implicit capture from a cover to its stage.
        if (e.target === e.currentTarget) release(e);
      },
    },
  };
}
