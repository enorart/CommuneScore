// The comparison set: the communes a score is measured against.
// Picking a scope re-scores the selection against itself,
// so 100 means "the best of what I am actually choosing between".

export const REGION_SCOPE_ID = "idf";

const COURONNE_SCOPE = "couronne";
const DEPARTMENT_SCOPE = "dep";
const EPCI_SCOPE = "epci";

const DEPARTMENTS = {
  75: "Paris",
  77: "Seine-et-Marne",
  78: "Yvelines",
  91: "Essonne",
  92: "Hauts-de-Seine",
  93: "Seine-Saint-Denis",
  94: "Val-de-Marne",
  95: "Val-d'Oise",
};

// The two rings around Paris, in INSEE's sense. Paris itself belongs to
// neither, being what they are rings around. Useful as a comparison set
// because the inner ring is a different housing market from the outer one,
// and either is a fairer yardstick than the whole region.
const COURONNES = {
  petite: { label: "Petite couronne", departments: ["92", "93", "94"] },
  grande: { label: "Grande couronne", departments: ["77", "78", "91", "95"] },
};

function couronneOf(department) {
  return Object.keys(COURONNES).find((key) => COURONNES[key].departments.includes(department));
}

/**
 * Build the scope list from the loaded features, so the intercommunalités
 * come from the data rather than from a list here that would go stale on the
 * next COG.
 *
 * Each scope is { id, label, group, matches(props) }.
 */
export function buildScopes(features) {
  const epci = new Map();
  for (const { properties } of features) {
    epci.set(properties.code_epci, properties.nom_epci);
  }

  const couronnes = Object.entries(COURONNES).map(([key, { label, departments }]) => ({
    id: `${COURONNE_SCOPE}:${key}`,
    label,
    group: "Région",
    // Also read by network.js, which cannot call matches() : it has to build a
    // MapLibre expression rather than run a predicate.
    departments,
    matches: (props) => departments.includes(props.code_departement),
  }));

  const departments = Object.entries(DEPARTMENTS).map(([code, name]) => ({
    id: `${DEPARTMENT_SCOPE}:${code}`,
    label: `${name} (${code})`,
    group: "Départements",
    matches: (props) => props.code_departement === code,
  }));

  const intercommunalites = [...epci]
    .map(([code, name]) => ({
      id: `${EPCI_SCOPE}:${code}`,
      label: name,
      group: "Intercommunalités",
      matches: (props) => props.code_epci === code,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  return [
    {
      id: REGION_SCOPE_ID,
      label: "Toute l’Île-de-France",
      group: "Région",
      matches: () => true,
    },
    ...couronnes,
    ...departments,
    ...intercommunalites,
  ];
}

/**
 * The zones a given commune belongs to, broadest first: couronne, département,
 * intercommunalité. Paris arrondissements have no couronne, so they return two.
 *
 * Lets the popup name where a commune sits and, since each entry carries the
 * scope id, offer the zone as something to select : picking a comparison set
 * off the map rather than out of a list of 60 odd names.
 */
export function zonesOf(props) {
  const couronne = couronneOf(props.code_departement);

  return [
    ...(couronne ? [{ id: `${COURONNE_SCOPE}:${couronne}`, label: COURONNES[couronne].label }] : []),
    { id: `${DEPARTMENT_SCOPE}:${props.code_departement}`, label: DEPARTMENTS[props.code_departement] },
    { id: `${EPCI_SCOPE}:${props.code_epci}`, label: props.nom_epci },
  ];
}

// The zone of the same kind as `scope` that `props` belongs to : what clicking
// an out-of-scope commune jumps to. Staying at the same granularity .
export function siblingZone(scope, props) {
  const kind = scope.id.split(":")[0];
  const zones = zonesOf(props);

  // Paris has no couronne, so a couronne scope has nothing of its own kind to
  // offer there. Fall back to the département, which every commune has, rather
  // than leave the click doing nothing.
  return (
    zones.find((zone) => zone.id.startsWith(`${kind}:`)) ??
    zones.find((zone) => zone.id.startsWith(`${DEPARTMENT_SCOPE}:`))
  );
}

// Renders the scope picker into `container` and returns the <select>, so the
// caller can keep it in step with selections made on the map. onChange(scope)
// fires on every selection.
export function renderScopeSelect(container, scopes, onChange) {
  container.innerHTML = "";

  const select = document.createElement("select");
  select.id = "scope-select";
  select.className = "scope-select";

  let group = null;
  for (const scope of scopes) {
    if (!group || group.label !== scope.group) {
      group = document.createElement("optgroup");
      group.label = scope.group;
      select.append(group);
    }

    const option = document.createElement("option");
    option.value = scope.id;
    option.textContent = scope.label;
    group.append(option);
  }

  select.addEventListener("change", () => {
    onChange(scopes.find((scope) => scope.id === select.value));
  });

  container.append(select);
  return select;
}
