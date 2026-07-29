// The criteria the composite score is built from, and the weight state the
// user controls. app.js reads both to recolor the map and rebuild the
// ranking on every slider move.

// Radius the rail network is measured over, and the only criterion still using
// one: transport is the one source publishing real coordinates, so it can
// measure to the stations themselves. Must match neighbourhood.DEFAULT_RADIUS_KM
// in the ETL => the column names. app.js warns if the two drift apart.
// Equipment counts are the commune's own, see etl/sources/bpe.py.
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
    raw: "nb_commerces",
    unit: "dans la commune",
    defaultWeight: 2,
  },
  {
    key: "sante",
    label: "Santé",
    property: "score_sante",
    raw: "nb_sante",
    unit: "dans la commune",
    defaultWeight: 1,
  },
  {
    key: "enseignement",
    label: "Enseignement",
    property: "score_enseignement",
    raw: "nb_enseignement",
    unit: "dans la commune",
    defaultWeight: 0,
    note: "Maternelles, écoles, collèges et lycées",
  },
  {
    key: "ips",
    label: "Qualité de l'enseignement",
    property: "score_ips",
    raw: "ips_moyen",
    unit: "IPS moyen",
    defaultWeight: 0,
    note: "Indice de position sociale des élèves, tous niveaux confondus. Les écoles maternelles et hors contrat ne sont pas listées.",
  },
  {
    key: "petite_enfance",
    label: "Petite enfance",
    property: "score_petite_enfance",
    raw: "nb_petite_enfance",
    unit: "dans la commune",
    defaultWeight: 0,
  },
  {
    key: "sports",
    label: "Sport",
    property: "score_sports",
    raw: "nb_sports",
    unit: "dans la commune",
    defaultWeight: 1,
  },
  {
    key: "culture",
    label: "Culture",
    property: "score_culture",
    raw: "nb_culture",
    unit: "dans la commune",
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
    defaultWeight: 5,
    note: "Atteintes aux personnes et aux biens, hors stupéfiants",
  },
  {
    key: "air",
    label: "Qualité de l'air",
    property: "score_air",
    raw: "indice_oms",
    unit: "× le seuil OMS",
    defaultWeight: 1,
    note: "NO₂ et PM2.5, moyennes annuelles modélisées",
  },
  {
    key: "bruit",
    label: "Bruit",
    property: "score_bruit",
    raw: "pct_pop_bruit_oms",
    unit: "% des habitants",
    defaultWeight: 3,
    note: "Trafic routier, ferroviaire et aérien, au-delà du seuil OMS",
  },
  {
    key: "espaces_verts",
    label: "Espaces verts",
    property: "score_espaces_verts",
    raw: "pct_espaces_verts",
    unit: "% de la commune",
    defaultWeight: 3,
    note: "Bois, parcs et jardins publics, hors terres agricoles",
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
