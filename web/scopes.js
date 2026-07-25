// The comparison set: the communes a score is measured against.
//
// Île-de-France as a whole is the wrong yardstick once you have narrowed your
// search — inside one intercommunalité every commune lands in the same narrow
// band. Picking a scope re-scores the selection against itself (see
// scoring.js), so 100 means "the best of what I am actually choosing between".

export const REGION_SCOPE_ID = "idf";

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

  const departments = Object.entries(DEPARTMENTS).map(([code, name]) => ({
    id: `dep:${code}`,
    label: `${name} (${code})`,
    group: "Départements",
    matches: (props) => props.code_departement === code,
  }));

  const intercommunalites = [...epci]
    .map(([code, name]) => ({
      id: `epci:${code}`,
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
    ...departments,
    ...intercommunalites,
  ];
}

// Renders the scope picker into `container`. onChange(scope) fires on every
// selection.
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
}
