// The criteria the composite score is built from, and the weight state the
// user controls. app.js reads both to recolor the map and rebuild the
// ranking on every slider move.

// Radius the equipment counts were aggregated over. Must match
// NEARBY_SUFFIX in etl/pipeline.py => the column names.
export const NEARBY_RADIUS_KM = 1;

const MAX_WEIGHT = 6;

export const CRITERIA = [
  {
    key: "loyer",
    label: "Loyer",
    property: "score_loyer",
    raw: "loyer_m2_moyen",
    unit: "€/m²",
    defaultWeight: 5,
  },
  {
    key: "commerces",
    label: "Commerces",
    property: "score_commerces",
    raw: `nb_commerces_${NEARBY_RADIUS_KM}km`,
    unit: `à ${NEARBY_RADIUS_KM} km`,
    defaultWeight: 2,
  },
  {
    key: "sante",
    label: "Santé",
    property: "score_sante",
    raw: `nb_sante_${NEARBY_RADIUS_KM}km`,
    unit: `à ${NEARBY_RADIUS_KM} km`,
    defaultWeight: 2,
  },
  {
    key: "enseignement",
    label: "Écoles",
    property: "score_enseignement",
    raw: `nb_enseignement_${NEARBY_RADIUS_KM}km`,
    unit: `à ${NEARBY_RADIUS_KM} km`,
    defaultWeight: 0,
  },
  {
    key: "petite_enfance",
    label: "Petite enfance",
    property: "score_petite_enfance",
    raw: `nb_petite_enfance_${NEARBY_RADIUS_KM}km`,
    unit: `à ${NEARBY_RADIUS_KM} km`,
    defaultWeight: 0,
  },
  {
    key: "sports",
    label: "Sport",
    property: "score_sports",
    raw: `nb_sports_${NEARBY_RADIUS_KM}km`,
    unit: `à ${NEARBY_RADIUS_KM} km`,
    defaultWeight: 1,
  },
  {
    key: "culture",
    label: "Culture",
    property: "score_culture",
    raw: `nb_culture_${NEARBY_RADIUS_KM}km`,
    unit: `à ${NEARBY_RADIUS_KM} km`,
    defaultWeight: 0,
  },
  {
    key: "transport",
    label: "Transports",
    property: "score_transport",
    raw: `nb_lignes_${NEARBY_RADIUS_KM}km`,
    unit: `lignes à ${NEARBY_RADIUS_KM} km`,
    defaultWeight: 3,
    note: "Réseau ferré : RER, Transilien, métro, tramway",
  },
  {
    key: "securite",
    label: "Sécurité",
    property: "score_securite",
    raw: "taux_delinquance",
    unit: "faits ‰ hab.",
    defaultWeight: 3,
    note: "Atteintes aux personnes et aux biens, hors stupéfiants",
  },
];

// initialisation
export function initialWeights() {
  return Object.fromEntries(CRITERIA.map((c) => [c.key, c.defaultWeight]));
}

// render the sliders
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
