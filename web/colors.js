// The one colour scale on the page. The map, the ranking spines, the popup
// bars and the legend all read from it, so a shade means the same thing
// everywhere and a single legend explains all of them.
// Sand through to deep marine, monotonically darkening, so it survives being
// read as pure lightness.

const RAMP = [
  [0, [244, 238, 226]],
  [25, [202, 220, 210]],
  [50, [143, 189, 187]],
  [75, [75, 138, 155]],
  [100, [23, 73, 95]],
];

const NO_DATA_COLOR = "#DDDDCA";

function rgb([r, g, b]) {
  return `rgb(${r} ${g} ${b})`;
}

// Linear interpolation through RAMP, matching MapLibre's own `interpolate`
// so JS rendered bars and GPU rendered polygons agree exactly.
export function rampColor(score) {
  if (score == null) return NO_DATA_COLOR;
  const clamped = Math.max(0, Math.min(100, score));

  for (let i = 1; i < RAMP.length; i += 1) {
    const [stop, color] = RAMP[i];
    if (clamped > stop) continue;

    const [prevStop, prevColor] = RAMP[i - 1];
    const t = stop === prevStop ? 0 : (clamped - prevStop) / (stop - prevStop);
    return rgb(prevColor.map((c, j) => Math.round(c + (color[j] - c) * t)));
  }
  return rgb(RAMP[RAMP.length - 1][1]);
}

// The same ramp as a MapLibre paint expression, reading the composite out of
// feature state. (-1 means "no composite yet, or every weight at zero".)
export function fillColorExpression() {
  const score = ["coalesce", ["feature-state", "composite"], -1];
  const stops = RAMP.flatMap(([stop, color]) => [stop, rgb(color)]);
  return ["case", ["<", score, 0], NO_DATA_COLOR, ["interpolate", ["linear"], score, ...stops]];
}

export function renderLegend(container) {
  const gradient = RAMP.map(([stop, color]) => `${rgb(color)} ${stop}%`).join(", ");
  container.innerHTML = `
    <p class="legend-title">Score composite</p>
    <div class="legend-scale" style="background:linear-gradient(90deg, ${gradient})"></div>
    <div class="legend-ticks"><span>0</span><span>50</span><span>100</span></div>
  `;
}
