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
const ipsFormat = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Everything else on this page is a number or a name the app controls. The
// school names are 5 536 free text values straight out of a ministry file, and
// they go into a template string, so they get escaped before they get there.
function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

// A Paris arrondissement has twenty odd stations, enough to bury the rest of
// the popup. The line list is left whole : that one answers "where can I get to".
const MAX_LISTED = 6;

function shorten(list) {
  if (!list) return "aucune";

  const items = list.split(", ");
  const shown = items.length <= MAX_LISTED ? list : `${items.slice(0, MAX_LISTED).join(", ")} + ${items.length - MAX_LISTED} autres`;
  return escapeHtml(shown);
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

// Airparif models four pollutants. Only NO₂ and PM2.5 build indice_oms, the
// two with the clearest health basis; PM10 is shown because it is the figure
// people know, and O₃ because it is the one that does not follow the others.
// Ozone is published as a count of bad days, not a concentration, so it
// carries its own unit.
const AIR_POLLUTANTS = [
  { key: "no2", label: "NO₂", scored: true },
  { key: "pm25", label: "PM2.5", scored: true },
  { key: "pm10", label: "PM10" },
  // The unit carries the threshold rather than the label: the label column
  // sizes the whole table, and widening it squeezes the score bars flat.
  { key: "o3_jours_depassement", label: "O₃", unit: "jours > 120 µg/m³" },
];

// The two halves of the score, then the two kinds of green it deliberately
// leaves out — so the popup answers "why is this commune not green" as well as
// "how green is it". A Beauce commune reads 0.2 % scored against 96 % agricole.
const GREEN_FAMILIES = [
  { key: "pct_foret", label: "Bois, nature", scored: true },
  { key: "pct_parcs", label: "Parcs, jardins", scored: true },
  { key: "pct_agricole", label: "Agricole" },
  { key: "pct_jardins_prives", label: "Jardins privés" },
];

// The three levels the IPS covers, each a [[nom, ips], ...] list sorted best
// first. All three feed the score : one flat mean over every establishment, so
// none is marked `scored` against the others.
//
// The ETL writes them as JSON strings, but GDAL recognises a string whose
// content parses as JSON and writes it back out as a real array, so the
// property arrives already parsed. Read both shapes rather than depend on
// which GDAL is installed. Communes with none of a level carry "".
const IPS_LEVELS = [
  { key: "ecoles_ips", label: "Écoles" },
  { key: "colleges_ips", label: "Collèges" },
  { key: "lycees_ips", label: "Lycées" },
];

// Paris 20e has 47 écoles : enough to bury the rest of the popup, the same
// reason MAX_LISTED exists for stations. The level's own summary row carries
// the count and the mean over all of them, so the cap hides names, never the
// figure the score is built from.
const MAX_SCHOOLS = 10;

function schoolList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : JSON.parse(value);
}

function ipsRows(props) {
  const rows = [];

  for (const { key, label } of IPS_LEVELS) {
    const schools = schoolList(props[key]);
    if (schools.length === 0) continue;

    const mean = schools.reduce((total, [, ips]) => total + ips, 0) / schools.length;
    rows.push({
      label,
      scored: true,
      value: `${numberFormat.format(schools.length)} · IPS moyen ${ipsFormat.format(mean)}`,
    });

    for (const [nom, ips] of schools.slice(0, MAX_SCHOOLS)) {
      rows.push({ label: escapeHtml(nom), value: ipsFormat.format(ips), wrap: true });
    }

    const hidden = schools.length - MAX_SCHOOLS;
    if (hidden > 0) rows.push({ label: `+ ${numberFormat.format(hidden)} autres`, value: "", wrap: true });
  }

  return rows;
}

// One row per entry, each reading a raw column and sharing a unit unless it
// names its own.
function unitRows(entries, unit) {
  return (props) =>
    entries.map(({ key, label, scored, unit: own }) => ({
      label,
      scored,
      value: formatValue(props[key], own ?? unit),
    }));
}

// Criteria whose single number hides something worth naming. `scored` marks the
// part the score is built from, `wrap` is for values too long for a right
// aligned column. A criterion absent here simply has no expandable row.
const DETAILS = {
  loyer: unitRows(RENT_TYPOLOGIES, "€/m²"),
  securite: unitRows(CRIME_FAMILIES, "‰"),
  air: unitRows(AIR_POLLUTANTS, "µg/m³"),
  // Bare "%" here: the criterion row above already says what the share is of,
  // and repeating it on all four rows only widens the column.
  espaces_verts: unitRows(GREEN_FAMILIES, "%"),
  ips: ipsRows,

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

// A criterion's own row, followed by its detail rows when it has any.
function criterionRows(criterion, props, weights) {
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
}

export function popupHtml(props, { weights, scope, scopeCount, meta }) {
  const composite = compositeScore(props, weights);

  // Side by side rather than one list: ten criteria stacked make a popup
  // taller than the map has room for. Each half is its own table so that a
  // criterion's detail rows still open directly beneath it, and so the two
  // columns size their numbers independently.
  const half = Math.ceil(CRITERIA.length / 2);
  const columns = [CRITERIA.slice(0, half), CRITERIA.slice(half)]
    .map((group) => `<table>${group.map((c) => criterionRows(c, props, weights)).join("")}</table>`)
    .join("");

  return `
    <div class="commune-popup">
      <header>
        <h3>${escapeHtml(props.name)}</h3>
        <p class="popup-meta">
          ${props.code_insee} · ${numberFormat.format(props.population)} hab.
        </p>
        <p class="popup-zones">${zoneLinks(props, scope)}</p>
      </header>

      <div class="popup-score" style="border-color:${rampColor(composite)}">
        <span class="popup-score-value">${composite == null ? NO_VALUE : scoreFormat.format(composite)}</span>
        <span class="popup-score-label">score composite</span>
      </div>

      <div class="popup-criteria">${columns}</div>

      <p class="popup-footnote">
        Loyer : moyenne appartement et maison, en €/m². Équipements recensés sur
        le territoire de la commune seule. 
        Les transports font exception, l'unique source publiant
        les coordonnées de ses points : lignes desservies à moins de
        ${NEARBY_RADIUS_KM} km.
        Sécurité : faits enregistrés en ${meta.securite.annee} sur le territoire de la
        commune, pour 1 000 habitants.${securityFootnote(props, meta.securite.nb_indicateurs)}
        Qualité de l'air : moyennes annuelles ${meta.air.annee} modélisées par Airparif,
        moyennées sur la superficie de la commune ; l'indice rapporte le NO₂ et les
        PM2.5 aux seuils recommandés par l'OMS (${meta.air.seuils_oms.no2} et
        ${meta.air.seuils_oms.pm25} µg/m³), donc 1 vaut « au niveau recommandé ».
        Espaces verts : part de la surface de la commune occupée en
        ${meta.espaces_verts.annee} par des bois, espaces naturels, parcs et jardins
        publics. Les terres agricoles et les jardins privés sont affichés mais non
        comptés : verts sans être accessibles.
        Qualité de l'enseignement : indice de position sociale moyen des
        établissements de la commune à la rentrée ${meta.enseignement_ips.annee},
        écoles, collèges et lycées confondus. L'IPS décrit l'origine sociale des
        élèves accueillis, pas les résultats ni l'enseignement.
        Les scores des équipements suivent une échelle logarithmique : passer de 1
        à 10 équipements pèse plus que de 300 à 3 000 ; le loyer, la sécurité et
        l'air, des rangs. Tous sont relatifs aux
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
          <span class="rank-name">${escapeHtml(props.name)}</span>
          <span class="spine">${spineHtml(props, weights)}</span>
          <span class="rank-score" style="color:${rampColor(score)}">${scoreFormat.format(score)}</span>
        </li>`;
    })
    .join("");
}

export function formatCount(value) {
  return numberFormat.format(value);
}
