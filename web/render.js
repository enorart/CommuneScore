// Every HTML string the app builds : the popup, the ranking rows and the spine
// bars. Nothing here holds state; app.js passes in the weights, the current
// scope and the dataset metadata, so display never has to reach for a global.

import { CRITERIA, NEARBY_RADIUS_KM } from "./sliders.js";
import { compositeScore } from "./scoring.js";
import { rampColor } from "./colors.js";
import { zonesOf } from "./scopes.js";

const NO_VALUE = "—";

const numberFormat = new Intl.NumberFormat("fr-FR");
const scoreFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const rawFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

// A Paris arrondissement has twenty odd stations, enough to bury the rest of
// the popup. The line list is left whole : that one answers "where can I get to".
const MAX_LISTED = 6;

function shorten(list) {
  if (!list) return "aucune";

  const items = list.split(", ");
  if (items.length <= MAX_LISTED) return list;
  return `${items.slice(0, MAX_LISTED).join(", ")} + ${items.length - MAX_LISTED} autres`;
}

function formatValue(value, unit) {
  return value == null ? NO_VALUE : `${rawFormat.format(value)} ${unit}`;
}

function formatRaw(criterion, props) {
  const value = props[criterion.raw];
  if (value == null) return NO_VALUE;
  // Equipment counts are whole things, rent and rates are not.
  const formatted = Number.isInteger(value) ? numberFormat.format(value) : rawFormat.format(value);
  return `${formatted} ${criterion.unit}`;
}

// ANIL publishes four rent indicators. Only appartement and maison feed the
// score (see RENT_COLUMNS in etl/pipeline.py), but all four are worth seeing :
// which one matters depends entirely on what you are looking for.
const RENT_TYPOLOGIES = [
  { key: "loyer_m2_appartement", label: "Appartement", scored: true },
  { key: "loyer_m2_t1_t2", label: "T1–T2" },
  { key: "loyer_m2_t3_plus", label: "T3 et plus" },
  { key: "loyer_m2_maison", label: "Maison", scored: true },
];

// The two families SSMSI's 9 curated offence classes fall into. Both feed the
// score; they are split because violence and burglary rank communes differently.
const CRIME_FAMILIES = [
  { key: "taux_atteintes_personnes", label: "Atteintes aux personnes", scored: true },
  { key: "taux_atteintes_biens", label: "Atteintes aux biens", scored: true },
];

// One row per entry, each reading a raw column and sharing a unit.
function unitRows(entries, unit) {
  return (props) =>
    entries.map(({ key, label, scored }) => ({ label, scored, value: formatValue(props[key], unit) }));
}

// Criteria whose single number hides something worth naming. `scored` marks the
// part the score is built from, `wrap` is for values too long for a right
// aligned column. A criterion absent here simply has no expandable row.
const DETAILS = {
  loyer: unitRows(RENT_TYPOLOGIES, "€/m²"),
  securite: unitRows(CRIME_FAMILIES, "‰"),

  transport: (props) => [
    { label: "Gares dans la commune", value: shorten(props.gares), wrap: true },
    {
      label: `Lignes à ${NEARBY_RADIUS_KM} km`,
      value: props[`lignes_${NEARBY_RADIUS_KM}km`] || "aucune",
      wrap: true,
      scored: true,
    },
  ],
};

function detailRows(key, props) {
  const build = DETAILS[key];
  if (!build) return "";

  return build(props)
    .map(({ label, value, scored, wrap }) => {
      const classes = `row-detail${scored ? " is-scored" : ""}`;
      return wrap
        ? `<tr class="${classes}" data-group="${key}" hidden>
             <td colspan="4"><span class="detail-label">${label}</span><span class="detail-value">${value}</span></td>
           </tr>`
        : `<tr class="${classes}" data-group="${key}" hidden>
             <th>${label}</th><td class="num" colspan="3">${value}</td>
           </tr>`;
    })
    .join("");
}

// One bar per criterion, coloured by the page's single scale. Same grammar in
// the ranking and in the popup, so a commune's profile is recognisable at a
// glance before you read a number.
function spineHtml(props, weights) {
  return CRITERIA.map((criterion) => {
    const score = props[criterion.property] ?? 0;
    const muted = weights[criterion.key] === 0 ? " is-muted" : "";
    return `<i class="spine-bar${muted}" style="height:${Math.max(8, score)}%;background:${rampColor(score)}" title="${criterion.label} : ${scoreFormat.format(score)}"></i>`;
  }).join("");
}

// Where the commune sits. Each zone carries its scope id, so reaching an
// intercommunalité by clicking a commune inside it beats finding its name
// among 63 in a list.
function zoneLinks(props, scope) {
  return zonesOf(props)
    .map(({ id, label }) => {
      const active = id === scope.id ? " is-active" : "";
      const title = active ? "Sélection actuelle" : `Comparer dans ${label}`;
      return `<button type="button" class="zone-link${active}" data-scope="${id}" title="${title}">${label}</button>`;
    })
    .join("");
}

// SSMSI withholds any count below 5 faits over 3 years and publishes its
// département's mean instead. On a small commune that covers most of the figure.
function securityFootnote(props, total) {
  const estimated = props.nb_indicateurs_estimes;
  if (!estimated) return "";

  const one = estimated === 1;
  return ` ${estimated} des ${total} indicateurs y ${one ? "est couvert" : "sont couverts"}
    par le secret statistique et ${one ? "remplacé" : "remplacés"} par la moyenne départementale.`;
}

export function popupHtml(props, { weights, scope, scopeCount, meta }) {
  const composite = compositeScore(props, weights);

  const rows = CRITERIA.map((criterion) => {
    const score = props[criterion.property];
    const muted = weights[criterion.key] === 0 ? " is-muted" : "";

    const label = DETAILS[criterion.key]
      ? `<button type="button" class="detail-toggle" data-group="${criterion.key}" aria-expanded="false">${criterion.label}</button>`
      : criterion.label;

    return `
      <tr class="criterion-row${muted}">
        <th>${label}</th>
        <td class="num">${formatRaw(criterion, props)}</td>
        <td class="bar">
          <span style="width:${score ?? 0}%;background:${rampColor(score)}"></span>
        </td>
        <td class="num score">${score == null ? NO_VALUE : scoreFormat.format(score)}</td>
      </tr>
      ${detailRows(criterion.key, props)}`;
  }).join("");

  return `
    <div class="commune-popup">
      <header>
        <h3>${props.name}</h3>
        <p class="popup-meta">
          ${props.code_insee} · ${numberFormat.format(props.population)} hab.
        </p>
        <p class="popup-zones">${zoneLinks(props, scope)}</p>
      </header>

      <div class="popup-score" style="border-color:${rampColor(composite)}">
        <span class="popup-score-value">${composite == null ? NO_VALUE : scoreFormat.format(composite)}</span>
        <span class="popup-score-label">score composite</span>
      </div>

      <table>${rows}</table>

      <p class="popup-footnote">
        Loyer : moyenne appartement et maison, en €/m². Équipements accessibles
        dans un rayon de ${NEARBY_RADIUS_KM} km, soit
        ${numberFormat.format(props[`population_${NEARBY_RADIUS_KM}km`])} habitants.
        Sécurité : faits enregistrés en ${meta.securite.annee} sur le territoire de la
        commune, pour 1 000 habitants.${securityFootnote(props, meta.securite.nb_indicateurs)}
        Les scores des équipements suivent une échelle logarithmique : passer de 1
        à 10 équipements pèse plus que de 300 à 3 000 ; le loyer et la sécurité,
        des rangs. Tous sont relatifs aux
        ${numberFormat.format(scopeCount)} communes de « ${scope.label} » : un 100 est le meilleur de cette sélection, pas de la région.
      </p>
    </div>
  `;
}

export function rankingHtml(ranked, { weights, selected }) {
  return ranked
    .map(({ props, score }, index) => {
      const active = props.code_insee === selected ? " is-selected" : "";
      return `
        <li class="rank-row${active}" data-code="${props.code_insee}" tabindex="0">
          <span class="rank-position">${String(index + 1).padStart(2, "0")}</span>
          <span class="rank-name">${props.name}</span>
          <span class="spine">${spineHtml(props, weights)}</span>
          <span class="rank-score" style="color:${rampColor(score)}">${scoreFormat.format(score)}</span>
        </li>`;
    })
    .join("");
}

export function formatCount(value) {
  return numberFormat.format(value);
}
