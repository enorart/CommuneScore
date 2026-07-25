// The criteria the composite score is built from, and the weight state the
// user controls. app.js reads both to recolor the map and rebuild the
// ranking on every slider move (see PROJECT_PLAN.md section 6).
//
// `property` is the 0-100 score column written by etl/pipeline.py; `raw` is
// the underlying value shown in the popup, so a commune's real numbers stay
// visible next to its abstract score.

export const MAX_WEIGHT = 6;

export const CRITERIA = [
  {
    key: "loyer",
    label: "Loyer",
    property: "score_loyer",
    raw: "loyer_m2_moyen",
    unit: "€/m²",
    // Rent is the constraint that actually rules a housing search, so it
    // starts heavier than the rest.
    defaultWeight: 5,
  },
  {
    key: "commerces",
    label: "Commerces",
    property: "score_commerces",
    raw: "nb_commerces_5km",
    unit: "à 5 km",
    defaultWeight: 2,
  },
  {
    key: "sante",
    label: "Santé",
    property: "score_sante",
    raw: "nb_sante_5km",
    unit: "à 5 km",
    defaultWeight: 2,
  },
  {
    key: "enseignement",
    label: "Écoles",
    property: "score_enseignement",
    raw: "nb_enseignement_5km",
    unit: "à 5 km",
    defaultWeight: 2,
  },
  {
    key: "petite_enfance",
    label: "Petite enfance",
    property: "score_petite_enfance",
    raw: "nb_petite_enfance_5km",
    unit: "à 5 km",
    defaultWeight: 1,
  },
  {
    key: "sports",
    label: "Sport",
    property: "score_sports",
    raw: "nb_sports_5km",
    unit: "à 5 km",
    defaultWeight: 2,
  },
  {
    key: "culture",
    label: "Culture",
    property: "score_culture",
    raw: "nb_culture_5km",
    unit: "à 5 km",
    defaultWeight: 2,
  },
  {
    key: "transport",
    label: "Gares",
    property: "score_transport",
    raw: "nb_transport_5km",
    unit: "à 5 km",
    defaultWeight: 1,
    note: "Gares SNCF et RER seulement, ni métro ni bus",
  },
];

export function initialWeights() {
  return Object.fromEntries(CRITERIA.map((c) => [c.key, c.defaultWeight]));
}

// Renders one range input per criterion into `container`. `weights` is a
// mutable object the caller owns; onChange() fires after every move.
export function renderSliders(container, weights, onChange) {
  container.innerHTML = "";

  for (const criterion of CRITERIA) {
    const row = document.createElement("div");
    row.className = "criterion";

    const label = document.createElement("label");
    label.className = "criterion-label";
    label.htmlFor = `weight-${criterion.key}`;
    label.textContent = criterion.label;

    const value = document.createElement("span");
    value.className = "criterion-weight";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = `weight-${criterion.key}`;
    slider.min = "0";
    slider.max = String(MAX_WEIGHT);
    slider.step = "1";
    slider.value = String(weights[criterion.key]);

    const paint = () => {
      const weight = weights[criterion.key];
      value.textContent = weight === 0 ? "ignoré" : String(weight);
      row.classList.toggle("is-muted", weight === 0);
      // Fill the track up to the thumb, so the slider row itself reads as a
      // bar chart of the user's priorities.
      slider.style.setProperty("--fill", `${(weight / MAX_WEIGHT) * 100}%`);
    };

    slider.addEventListener("input", () => {
      weights[criterion.key] = Number(slider.value);
      paint();
      onChange();
    });

    const head = document.createElement("div");
    head.className = "criterion-head";
    head.append(label, value);
    row.append(head, slider);

    if (criterion.note) {
      const note = document.createElement("p");
      note.className = "criterion-note";
      note.textContent = criterion.note;
      row.append(note);
    }

    paint();
    container.append(row);
  }
}
