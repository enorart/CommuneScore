// Weight state for each scoring criterion, adjustable via sidebar sliders.
// app.js reads this state to recompute the composite score client-side
// on every slider change (see PROJECT_PLAN.md section 6).

export const CRITERIA = [
  { key: "rent", label: "Loyer", defaultWeight: 1, invert: true },
  { key: "sports", label: "Sport & loisirs", defaultWeight: 1 },
  { key: "culture", label: "Culture", defaultWeight: 1 },
  { key: "education", label: "Éducation", defaultWeight: 1 },
  { key: "health", label: "Santé", defaultWeight: 1 },
  { key: "amenities", label: "Commerces", defaultWeight: 1 },
  { key: "security", label: "Sécurité", defaultWeight: 1 },
  { key: "environment", label: "Environnement", defaultWeight: 1 },
];

export function initialWeights() {
  return Object.fromEntries(CRITERIA.map((c) => [c.key, c.defaultWeight]));
}

// TODO: render one <input type="range"> per criterion into #sliders,
// call onChange(weights) whenever a slider moves.
export function renderSliders(container, weights, onChange) {
  throw new Error("TODO: implement slider rendering + wiring");
}
