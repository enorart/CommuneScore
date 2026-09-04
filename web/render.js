// Every HTML string the app builds : the popup, the ranking rows and the spine
// bars. Nothing here holds state; app.js passes in the weights, the current
// scope and the dataset metadata, so display never has to reach for a global.

import { CRITERIA, NEARBY_RADIUS_KM } from "./sliders.js";
import { compositeScore } from "./scoring.js";
import { rampColor } from "./colors.js";
import { zonesOf } from "./scopes.js";
import { MODES } from "./network.js";

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
const MAX_SCHOOLS = 4;

// Shared by the school lists and the equipment-type lists : same shape, same
// GDAL caveat, same "" for a commune with none.
function listValue(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : JSON.parse(value);
}

function ipsRows(props) {
  const rows = [];

  for (const { key, label } of IPS_LEVELS) {
    const schools = listValue(props[key]);
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

// BPE counts equipments by type and never names them, so this is as close to
// "what is actually there" as the source gets : the types a commune has, most
// numerous first. The ETL ships the whole list, so the cap is display only and
// the last row can say how much of it is not shown.
const MAX_TYPES = 5;

function typeRows(column) {
  return (props) => {
    const types = listValue(props[column]);
    const rows = types.slice(0, MAX_TYPES).map(([label, count]) => ({
      label: escapeHtml(label),
      value: numberFormat.format(count),
    }));

    const hidden = types.length - MAX_TYPES;
    if (hidden > 0) rows.push({ label: `+ ${numberFormat.format(hidden)} autres types`, value: "", wrap: true });

    return rows;
  };
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

  // No unit and no `scored` on these : the criterion row above carries both,
  // and the types listed sum to exactly the count it shows.
  sports: typeRows("types_sports"),
  culture: typeRows("types_culture"),

  // The radiance above is a 2018 satellite pass at 23h40.
  pollution_lumineuse: (props) => [
    {
      label: "Éclairage public",
      value: props.eclairage_depuis
        ? `${props.eclairage_pratique} (${props.eclairage_depuis})`
        : props.eclairage_pratique || "non renseigné",
      wrap: true,
    },
  ],

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

// Footnotes for each criteria
const NOTES = {
  loyer: () => `
    Moyenne des indicateurs appartement et maison publiés par l'ANIL, en €/m².
    Les typologies T1–T2 et T3 et plus sont affichées dans le détail mais non
    comptées : sous-ensembles de l'indicateur appartement, elles pèseraient trois
    fois l'appartement contre une fois la maison.
    Noté au rang inversé : moins cher, mieux noté.`,

  transport: () => `
    Nombre de lignes distinctes atteignables à moins de ${NEARBY_RADIUS_KM} km,
    tous modes confondus — et non nombre de gares : trois arrêts du même RER
    mènent au même endroit. C'est le seul critère qui franchit les limites de la
    commune, Île-de-France Mobilités étant la seule source à publier les
    coordonnées de ses points. Ce n'est pas un temps de trajet.`,

  securite: (props, meta) => `
    Faits enregistrés par la police et la gendarmerie en ${meta.securite.annee}
    sur le territoire de la commune, pour 1 000 habitants, sur
    ${meta.securite.nb_indicateurs} indicateurs.
    Ils sont comptés là où ils se produisent : une commune avec une gare, un
    centre commercial ou un aéroport absorbe des faits visant des personnes qui
    n'y habitent pas.${securityFootnote(props, meta.securite.nb_indicateurs)}
    Noté au rang inversé.`,

  commerces: () => `
    Commerces et services de proximité recensés par l'INSEE sur le territoire de
    la commune seule. Une commune voisine d'un centre-ville se lit donc comme
    n'ayant rien.
    Échelle logarithmique : passer de 1 à 10 commerces compte davantage que de
    300 à 3 000.`,

  sante: () => `
    Médecins, spécialistes, dentistes, infirmiers, pharmacies, laboratoires et
    établissements de soins présents dans la commune. L'action sociale n'est pas
    comptée : ce n'est pas de l'accès aux soins.
    Échelle logarithmique.`,

  air: (props, meta) => `
    Moyennes annuelles ${meta.air.annee} modélisées par Airparif, moyennées sur
    la superficie de la commune. L'indice rapporte le NO₂ et les PM2.5 aux seuils
    recommandés par l'OMS (${meta.air.seuils_oms.no2} et
    ${meta.air.seuils_oms.pm25} µg/m³) : 1 vaut « au niveau recommandé ».
    Les PM10 et l'ozone sont affichés mais non comptés.
    Moyenne de surface et non de population : une commune au centre dense et à la
    forêt derrière lui se lit mieux que ses habitants ne la vivent.
    Noté au rang inversé.`,

  bruit: (props, meta) => `
    Part des habitants exposés en ${meta.bruit.annee} à un niveau
    ${meta.bruit.indicateur} supérieur aux valeurs recommandées par l'OMS
    (${meta.bruit.seuils_oms.route} dB pour la route,
    ${meta.bruit.seuils_oms.fer} pour le fer,
    ${meta.bruit.seuils_oms.air} pour l'aérien), ces trois trafics confondus.
    Le ${meta.bruit.indicateur} est une moyenne annuelle qui majore la soirée de
    5 dB et la nuit de 10 dB : c'est une mesure de la gêne, pas du bruit brut.
    Une douzaine de communes en bordure de la modélisation de Roissy ne sont pas
    notées, faute d'une population modélisée représentative.`,

  espaces_verts: (props, meta) => `
    Part de la surface de la commune occupée en ${meta.espaces_verts.annee} par
    des bois, espaces naturels, parcs et jardins publics.
    Les terres agricoles et les jardins privés sont affichés mais non comptés :
    verts sans être accessibles.
    Mesuré sur la commune seule : Vincennes ne reçoit rien du bois de Vincennes,
    qui est dans le 12e.`,

  pollution_lumineuse: (props, meta) => `
    Lumière émise vers le ciel par la commune, mesurée par le satellite
    ${meta.pollution_lumineuse.satellite} en ${meta.pollution_lumineuse.annee} à
    ${meta.pollution_lumineuse.resolution_m} m
    (${meta.pollution_lumineuse.passages.join(" et ")}), moyennée sur sa
    superficie : lumière qui part du sol, non la clarté du ciel telle
    qu'on la voit.
    Les valeurs sous ${meta.pollution_lumineuse.seuil_bruit}
    ${meta.pollution_lumineuse.unite} sont ramenées à zéro par la source.
    Les deux passages ont lieu avant l'heure d'extinction pratiquée par beaucoup
    de communes : la pratique d'éclairage, détectée séparément sur
    ${meta.eclairage_nocturne.periode}, est dans le détail du critère.
    Noté au rang inversé.`,

  enseignement: () => `
    Écoles, collèges et lycées implantés dans la commune : premier degré
    (maternelles, primaires, élémentaires), collèges, puis lycées général,
    professionnel et agricole. Rien au-delà du lycée — ni université, ni
    formation continue.
    Échelle logarithmique.`,

  ips: (props, meta) => `
    Indice de position sociale moyen des établissements de la commune à la
    rentrée ${meta.enseignement_ips.annee}, écoles, collèges et lycées confondus.
    L'IPS décrit l'origine sociale des élèves accueillis, pas les résultats ni
    l'enseignement. Moyenne non pondérée par les effectifs, que la source ne
    publie pas.
    Les communes sans aucun établissement noté sortent du critère plutôt que
    d'être mal notées.`,

  petite_enfance: () => `
    Crèches, micro-crèches, relais petite enfance et lieux d'accueil
    enfants-parents présents dans la commune. Les accueils de loisirs et les
    centres sociaux ne sont pas comptés.
    Échelle logarithmique.`,

  sports: () => `
    Équipements sportifs recensés dans la commune ; les cinq types les plus
    nombreux sont dans le détail du critère. Les sites de sports de nature
    (randonnée, baignade, nautisme) ne sont pas comptés : ce sont des lieux, pas
    des équipements de proximité.
    Échelle logarithmique.`,

  culture: () => `
    Bibliothèques, cinémas, arts du spectacle, conservatoires, lieux d'exposition
    et de patrimoine recensés dans la commune ; les cinq types les plus nombreux
    sont dans le détail du critère.
    Échelle logarithmique.`,
};

// The note is prose in a full width row, for the same reason the line lists are:
// it has nothing to align with. `note:` keeps its data-group distinct from the
// detail rows' so one (i) and one chevron never fight over the same key.
function noteRow(key, props, meta) {
  const note = NOTES[key];
  if (!note) return "";

  return `<tr class="row-note" data-group="note:${key}" hidden>
            <td colspan="5"><p class="note-text">${note(props, meta)}</p></td>
          </tr>`;
}

function detailRows(key, props) {
  const build = DETAILS[key];
  if (!build) return "";

  return build(props)
    .map(({ label, value, scored, wrap }) => {
      const classes = `row-detail${scored ? " is-scored" : ""}`;
      return wrap
        ? `<tr class="${classes}" data-group="${key}" hidden>
             <td colspan="5"><span class="detail-label">${label}</span><span class="detail-value">${value}</span></td>
           </tr>`
        : `<tr class="${classes}" data-group="${key}" hidden>
             <th colspan="2">${label}</th><td class="num" colspan="3">${value}</td>
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

// A criterion's own row, then its note, then its detail rows when it has any.
// The chevron and the (i) answer different questions — what else this commune
// has, and what the number means — so they are two controls, not one.
function criterionRows(criterion, props, weights, meta) {
  const score = props[criterion.property];
  const muted = weights[criterion.key] === 0 ? " is-muted" : "";

  // Bare text, not a span: `.criterion-label` is the sidebar slider's class and
  // styling it here would silently restyle the popup too. The `<th>`'s own font
  // is what the toggle inherits, so plain text is what matches it.
  const label = DETAILS[criterion.key]
    ? `<button type="button" class="detail-toggle" data-group="${criterion.key}" aria-expanded="false">${criterion.label}</button>`
    : criterion.label;

  const info = NOTES[criterion.key]
    ? `<button type="button" class="criterion-info" data-group="note:${criterion.key}"
               aria-expanded="false" aria-label="Comment ${criterion.label} est mesuré"
               title="Comment ${criterion.label} est mesuré">i</button>`
    : "";

  return `
    <tr class="criterion-row${muted}">
      <th>${label}</th>
      <td class="info">${info}</td>
      <td class="num">${formatRaw(criterion, props)}</td>
      <td class="bar">
        <span style="width:${score ?? 0}%;background:${rampColor(score)}"></span>
      </td>
      <td class="num score">${score == null ? NO_VALUE : scoreFormat.format(score)}</td>
    </tr>
    ${noteRow(criterion.key, props, meta)}
    ${detailRows(criterion.key, props)}`;
}

export function popupHtml(props, { weights, scope, scopeCount, meta, travel, travelMinutes }) {
  const composite = compositeScore(props, weights);

  // Side by side rather than one list: ten criteria stacked make a popup
  // taller than the map has room for. Each half is its own table so that a
  // criterion's detail rows still open directly beneath it, and so the two
  // columns size their numbers independently.
  const half = Math.ceil(CRITERIA.length / 2);
  const columns = [CRITERIA.slice(0, half), CRITERIA.slice(half)]
    .map((group) => `<table>${group.map((c) => criterionRows(c, props, weights, meta)).join("")}</table>`)
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

      ${travelRow(props, travel, travelMinutes)}

      <div class="popup-criteria">${columns}</div>

      <p class="popup-footnote">
        Chaque critère explique sa mesure et ses limites derrière son
        <span class="info-inline">i</span>.
        Tous les scores sont relatifs aux ${numberFormat.format(scopeCount)}
        communes de « ${scope.label} » : un 100 est le meilleur de cette
        sélection, pas de la région.
      </p>
    </div>
  `;
}

/**
 * The one line that turns the popup into the way into travel-time mode, and
 * out of it into another origin.
 *
 * With the mode already on it also answers the question you opened this
 * commune to ask: how far is it from where I am measuring.
 */
function travelRow(props, travel, minutes) {
  const origin = travel?.origin === props.code_insee;
  const reach = travel && !origin ? minutes.get(props.code_insee) : null;

  // `travel.max` is the ETL's ceiling, not the slider: a commune absent from
  // the row was not reached in two hours, whatever the user set the limit to.
  const distance = !travel || origin
    ? ""
    : `<span class="travel-reach">${reach == null ? `plus de ${travel.max} min` : `${reach} min`}</span>`;

  const label = origin ? "Origine des temps de trajet" : travel ? "Mesurer depuis ici" : "Temps de trajet depuis ici";

  return `
    <p class="popup-travel">
      ${distance}
      <button type="button" class="travel-link" data-code="${props.code_insee}"
              ${origin ? "disabled" : ""}>${label}</button>
    </p>`;
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

/**
 * The popup for a transport stop. Not a commune : no scores, no criteria, no
 * zone links, just what stops here.
 *
 * It reuses `.commune-popup` and keeps <header> as its first child on purpose.
 * app.js's wirePopup rehomes MapLibre's close button into
 * `.commune-popup header`, and style.css makes that header sticky ; a root
 * class of its own would mean duplicating both rules.
 *
 * `lignes` arrives as "mode:shortName" so a line can be shown in its own
 * colour and grouped under its own mode. `colors` is the map lineColors()
 * builds from the traces file, and `communeName` is looked up by app.js,
 * which holds the communes the stop's code_insee refers to.
 */
export function stopPopupHtml(props, { communeName, colors }) {
  const lignes = Array.isArray(props.lignes) ? props.lignes : JSON.parse(props.lignes);
  const modes = Array.isArray(props.modes) ? props.modes : JSON.parse(props.modes);

  const groups = MODES.filter(({ key }) => modes.includes(key)).map(({ key, label, color }) => {
    const pills = lignes
      .filter((line) => line.startsWith(`${key}:`))
      .map((line) => {
        const short = line.slice(key.length + 1);
        return `<span class="line-pill" style="background:${colors.get(line) ?? color}">${escapeHtml(short)}</span>`;
      })
      .join("");

    return `
      <tr class="stop-mode">
        <th>${label}</th>
        <td>${pills}</td>
      </tr>`;
  });

  return `
    <div class="commune-popup stop-popup">
      <header>
        <h3>${escapeHtml(props.nom)}</h3>
        <p class="popup-meta">${escapeHtml(communeName ?? props.code_insee)}</p>
      </header>

      <table class="stop-lines">${groups.join("")}</table>
    </div>
  `;
}
