export const defaults = { sensitivity: 1, momentum: 1, damping: 3.5 };
export type Tuning = typeof defaults;
export type Motion = {
  position: number;
  velocity: number; // slots per second, positive toward the next item
  phase: "rest" | "drag" | "coast" | "snap";
  target: number;
};

export function stopped(position: number): Motion {
  return { position, velocity: 0, phase: "rest", target: Math.round(position) };
}

export function released(
  position: number,
  velocity: number,
  settings: Tuning,
): Motion {
  const launch = Math.max(-12, Math.min(12, velocity * settings.momentum));
  return {
    position,
    velocity: launch,
    phase: Math.abs(launch) > 0.85 ? "coast" : "snap",
    target: Math.round(position + launch / settings.damping),
  };
}

// Integrate exponential drag and the critically damped snap exactly in elapsed seconds.
// One frame may contain the end of the coast and the beginning of the snap.
export function advance(
  previous: Motion,
  seconds: number,
  damping: number,
): Motion {
  let { position, velocity, phase, target } = previous;
  if (phase === "rest" || phase === "drag" || seconds <= 0) return previous;
  if (phase === "coast") {
    const crossing = Math.max(0, Math.log(Math.abs(velocity) / 0.85) / damping);
    const dt = Math.min(seconds, crossing);
    position += (velocity * -Math.expm1(-damping * dt)) / damping;
    velocity *= Math.exp(-damping * dt);
    target = Math.round(position + velocity / damping);
    if (seconds < crossing) return { position, velocity, phase, target };
    seconds -= dt;
    phase = "snap";
  }
  const rate = 16,
    displacement = position - target;
  const slope = velocity + rate * displacement,
    decay = Math.exp(-rate * seconds);
  position = target + (displacement + slope * seconds) * decay;
  velocity = (velocity - rate * slope * seconds) * decay;
  if (Math.abs(position - target) < 0.001 && Math.abs(velocity) < 0.02)
    return stopped(target);
  return { position, velocity, phase, target };
}

export type Sample = { x: number; time: number };
// Use a short tail of real input samples. A pause decays release velocity;
// a direction change discards the previous stroke immediately.
export function recordSample(samples: Sample[], x: number, time: number) {
  const last = samples.at(-1);
  if (!last) {
    samples.push({ x, time });
    return;
  }
  if (time < last.time || x === last.x) return;
  const prior = samples.at(-2);
  if (prior && (x - last.x) * (last.x - prior.x) < 0)
    samples.splice(0, samples.length - 1);
  samples.push({ x, time });
  while (samples.length > 2 && samples[1].time <= time - 65) samples.shift();
}
export function inputSpeed(
  samples: Sample[],
  time: number,
  pixelsPerSlot: number,
) {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1],
    first = samples[0];
  const elapsed = last.time - first.time;
  if (elapsed <= 0 || time - last.time >= 80) return 0;
  return (
    (((first.x - last.x) * 1000) / (elapsed * pixelsPerSlot)) *
    Math.max(0, 1 - (time - last.time) / 80)
  );
}
