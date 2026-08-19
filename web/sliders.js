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

// Fourteen sliders in one flat list was a wall to read, so they are grouped.
// Ordered by how much of the composite they usually carry rather than by
// theme: habitat holds the two heaviest defaults, and the sidebar scrolls, so
// putting the criteria nobody has weighted yet at the top would bury them.
//
// CRITERIA below is kept in this same order, so the popup and the ranking
// spine read left to right in the order the sliders read top to bottom. One
// order, defined once.
export const FAMILIES = [
  { key: "habitat", label: "Habitat" },
  { key: "environnement", label: "Environnement" },
  { key: "famille", label: "Famille" },
  { key: "loisirs", label: "Loisirs" },
];

export const CRITERIA = [
  {
    key: "loyer",
    family: "habitat",
    label: "Loyer",
    property: "score_loyer",
    raw: "loyer_m2_moyen",
    unit: "€/m²",
    defaultWeight: 5,
  },
  {
    key: "transport",
    family: "habitat",
    label: "Transports",
    property: "score_transport",
    raw: `nb_lignes_${NEARBY_RADIUS_KM}km`,
    unit: `lignes à ${NEARBY_RADIUS_KM} km`,
    defaultWeight: 3,
    note: "Réseau ferré : RER, Transilien, métro, tramway",
  },
  {
    key: "securite",
    family: "habitat",
    label: "Sécurité",
    property: "score_securite",
    raw: "taux_delinquance",
    unit: "faits ‰ hab.",
    defaultWeight: 5,
    note: "Atteintes aux personnes et aux biens, hors stupéfiants",
  },
  {
    key: "commerces",
    family: "habitat",
    label: "Commerces",
    property: "score_commerces",
    raw: "nb_commerces",
    unit: "dans la commune",
    defaultWeight: 2,
  },
  {
    key: "sante",
    family: "habitat",
    label: "Santé",
    property: "score_sante",
    raw: "nb_sante",
    unit: "dans la commune",
    defaultWeight: 1,
  },
  {
    key: "air",
    family: "environnement",
    label: "Qualité de l'air",
    property: "score_air",
    raw: "indice_oms",
    unit: "× le seuil OMS",
    defaultWeight: 1,
    note: "NO₂ et PM2.5, moyennes annuelles modélisées",
  },
  {
    key: "bruit",
    family: "environnement",
    label: "Bruit",
    property: "score_bruit",
    raw: "pct_pop_bruit_oms",
    unit: "% des habitants",
    defaultWeight: 3,
    note: "Trafic routier, ferroviaire et aérien, au-delà du seuil OMS",
  },
  {
    key: "espaces_verts",
    family: "environnement",
    label: "Espaces verts",
    property: "score_espaces_verts",
    raw: "pct_espaces_verts",
    unit: "% de la commune",
    defaultWeight: 3,
    note: "Bois, parcs et jardins publics, hors terres agricoles",
  },
  {
    key: "pollution_lumineuse",
    family: "environnement",
    label: "Ciel nocturne",
    property: "score_pollution_lumineuse",
    raw: "radiance_nocturne",
    unit: "nW/cm²/sr",
    defaultWeight: 1,
    note: "Lumière émise vers le ciel, vue par satellite vers 23h40",
  },
  {
    key: "enseignement",
    family: "famille",
    label: "Enseignement",
    property: "score_enseignement",
    raw: "nb_enseignement",
    unit: "dans la commune",
    defaultWeight: 0,
    note: "Maternelles, écoles, collèges et lycées",
  },
  {
    key: "ips",
    family: "famille",
    label: "Qualité de l'enseignement",
    property: "score_ips",
    raw: "ips_moyen",
    unit: "IPS moyen",
    defaultWeight: 0,
    note: "Indice de position sociale des élèves, tous niveaux confondus. Les écoles maternelles et hors contrat ne sont pas listées.",
  },
  {
    key: "petite_enfance",
    family: "famille",
    label: "Petite enfance",
    property: "score_petite_enfance",
    raw: "nb_petite_enfance",
    unit: "dans la commune",
    defaultWeight: 0,
  },
  {
    key: "sports",
    family: "loisirs",
    label: "Sport",
    property: "score_sports",
    raw: "nb_sports",
    unit: "dans la commune",
    defaultWeight: 1,
  },
  {
    key: "culture",
    family: "loisirs",
    label: "Culture",
    property: "score_culture",
    raw: "nb_culture",
    unit: "dans la commune",
    defaultWeight: 0,
  },
];

// initialisation
export function initialWeights() {
  return Object.fromEntries(CRITERIA.map((c) => [c.key, c.defaultWeight]));
}

// One slider, its label and its weight readout. `afterPaint` lets the family
// around it update its own summary from the same event, so the two cannot
// disagree about how many criteria are active.
function criterionRow(criterion, weights, onChange, afterPaint) {
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
    afterPaint?.();
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
  return row;
}

// render the sliders, grouped by family, each family collapsible
//
// <details> rather than a button and a hidden class: it carries the open state,
// the keyboard handling and the ARIA for free, and renderSliders is called once
// at startup, so what the user folds away stays folded.
export function renderSliders(container, weights, onChange) {
  container.innerHTML = "";

  for (const family of FAMILIES) {
    const members = CRITERIA.filter((criterion) => criterion.family === family.key);
    if (members.length === 0) continue;

    const section = document.createElement("details");
    section.className = "criterion-family";
    // Folded only when nothing inside it reaches the score at all, which today
    // is Famille and nothing else. A family carrying weight is never hidden
    // behind a click: the panel has to show what the map is being coloured by.
    section.open = members.some((criterion) => weights[criterion.key] > 0);

    const heading = document.createElement("summary");
    heading.className = "criterion-family-title";

    const name = document.createElement("span");
    name.textContent = family.label;

    // The count is what makes a folded family readable rather than opaque.
    const count = document.createElement("span");
    count.className = "criterion-family-count";

    const paintFamily = () => {
      const active = members.filter((criterion) => weights[criterion.key] > 0).length;
      count.textContent = active === 0 ? "ignorée" : `${active}/${members.length}`;
      section.classList.toggle("is-muted", active === 0);
    };

    heading.append(name, count);
    section.append(heading);

    for (const criterion of members) {
      section.append(criterionRow(criterion, weights, onChange, paintFamily));
    }
    paintFamily();
    container.append(section);
  }

  // A criterion whose family is missing from FAMILIES would simply never be
  // drawn, and its weight would sit at its default with no way to change it —
  // the same silent class of bug as forgetting a SCORERS entry. Say so.
  const placed = new Set(FAMILIES.map(({ key }) => key));
  const orphans = CRITERIA.filter((criterion) => !placed.has(criterion.family));
  if (orphans.length > 0) {
    console.warn(`criteria with no family in FAMILIES, no slider drawn: ${orphans.map((c) => c.key).join(", ")}`);
  }
}
