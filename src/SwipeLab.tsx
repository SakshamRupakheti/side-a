import { defaults, type Tuning } from "./swipe-physics";
import type { SwipeReading } from "./useKineticSwipe";
import "./swipe-lab.css";

const controls = [
  {
    key: "sensitivity",
    label: "Sensitivity",
    min: 0.5,
    max: 2,
    step: 0.05,
    unit: "×",
    help: "Card travel per pixel dragged.",
  },
  {
    key: "momentum",
    label: "Momentum",
    min: 0,
    max: 2,
    step: 0.05,
    unit: "×",
    help: "Release speed carried into the glide.",
  },
  {
    key: "damping",
    label: "Damping",
    min: 2,
    max: 10,
    step: 0.25,
    unit: "/s",
    help: "Higher values slow the glide sooner.",
  },
] as const;
export function SwipeLab({
  settings,
  change,
  reading,
  phase,
}: {
  settings: Tuning;
  change: (t: Tuning) => void;
  reading: SwipeReading | null;
  phase: string;
}) {
  return (
    <section className="swipe-controls" aria-label="Swipe physics controls">
      <div className="lab-heading">
        <h2>Swipe settings</h2>
        <button
          type="button"
          className="plainlink"
          onClick={() => change({ ...defaults })}
        >
          Reset defaults
        </button>
      </div>
      <div className="swipe-sliders">
        {controls.map(({ key, label, min, max, step, unit, help }) => (
          <div key={key}>
            <label htmlFor={"swipe-" + key}>
              {label}
              <span>
                {settings[key].toFixed(2)}
                {unit}
              </span>
            </label>
            <input
              id={"swipe-" + key}
              type="range"
              min={min}
              max={max}
              step={step}
              value={settings[key]}
              aria-describedby={"swipe-help-" + key}
              onChange={(e) =>
                change({ ...settings, [key]: e.target.valueAsNumber })
              }
            />
            <small id={"swipe-help-" + key}>{help}</small>
          </div>
        ))}
      </div>
      <div className="lab-reading">
        <strong>Last swipe</strong>
        <span>
          {phase === "drag"
            ? "Dragging"
            : phase === "coast"
              ? "Gliding"
              : phase === "snap"
                ? "Settling"
                : reading?.interrupted
                  ? "Interrupted"
                  : "At rest"}
        </span>
        {reading ? (
          <dl>
            <div>
              <dt>Launch speed</dt>
              <dd>{reading.speed.toFixed(2)} cards/s</dd>
            </div>
            <div>
              <dt>Release travel</dt>
              <dd>{reading.travel.toFixed(2)} cards</dd>
            </div>
            <div>
              <dt>Release time</dt>
              <dd>{Math.round(reading.elapsed)} ms</dd>
            </div>
          </dl>
        ) : (
          <p>Drag a cover and release to measure a swipe.</p>
        )}
      </div>
    </section>
  );
}
