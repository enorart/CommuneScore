// Per-criterion 0-100 scores, recomputed in the browser over whatever set of
// communes the user has scoped to.
// This is the only place scoring happens. The ETL writes raw values only,
// because a 0-100 score only means something relative to a set
// of communes, and which set that is belongs to the user: what counts as good
// transport among 1285 communes is not what counts as good transport inside
// one intercommunalité.

import { CRITERIA } from "./sliders.js";

// Null in, null out, everywhere below: a commune with no ANIL rent must score
// nothing rather than score badly, the way pandas skips NaN.
function scaleFinite(values, transform) {
  const known = values.filter((value) => value != null);
  if (known.length === 0) return values.map(() => null);
  return transform(values, known);
}

function minMaxScale(values, { invert = false } = {}) {
  return scaleFinite(values, (all, known) => {
    const low = Math.min(...known);
    const high = Math.max(...known);

    // Case where every commune are identical
    if (high === low) return all.map((value) => (value == null ? null : 50));

    return all.map((value) => {
      if (value == null) return null;
      const scaled = ((value - low) / (high - low)) * 100;
      return invert ? 100 - scaled : scaled;
    });
  });
}

// For counts that saturate: going from 1 reachable bakery to 10 changes daily
// life, going from 300 to 3000 does not.
function logMinMaxScale(values, options) {
  return minMaxScale(
    values.map((value) => (value == null ? null : Math.log1p(value))),
    options
  );
}

// Rank as a percentage, ties sharing the average of the ranks they span
function percentileRank(values, { invert = false } = {}) {
  return scaleFinite(values, (all, known) => {
    const order = [...known].sort((a, b) => (invert ? b - a : a - b));

    // First index of each value, plus its run length, gives the average rank
    // of the whole tie group in one pass.
    const averageRank = new Map();
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j < order.length && order[j] === order[i]) j += 1;
      // Ranks are 1-based, so the group spans i+1 .. j.
      averageRank.set(order[i], (i + 1 + j) / 2);
      i = j;
    }

    return all.map((value) => (value == null ? null : (averageRank.get(value) / order.length) * 100));
  });
}

// criterion key -> how its score is built. Counts are scored on a log scale;
// the exceptions are the criteria that are not counts. Rent is a price,
// security a rate and air a ratio to a health guideline, so saturation has
// nothing to say about any of them, and for all three less is better : inverted.
// Rank rather than min-max because each has a long tail
// that would otherwise flatten everything else against it: for air it is the
// handful of communes the périphérique runs through.
//
// Green space is the fourth exception and the only one scored upward. It is a
// share of surface, already bounded 0-100, so the log would only compress the
// forest communes against each other while spreading the mineral ones apart —
// exactly backwards. Plain min-max rather than a rank because the spread is
// real and worth keeping: 84 % of Fontainebleau under trees is a different
// place from the 19 % of the median commune, and a rank would say only "higher".
const SCORERS = {
  loyer: { scale: percentileRank, invert: true },
  securite: { scale: percentileRank, invert: true },
  air: { scale: percentileRank, invert: true },
  espaces_verts: { scale: minMaxScale },
};

for (const { key } of CRITERIA) {
  SCORERS[key] ??= { scale: logMinMaxScale };
}

/**
 * Score `inScope` against itself and write the results onto every feature.
 *
 * Scores land on `feature.properties.score_*`, so the rest of app.js reads
 * them as ordinary properties and knows nothing about scopes. Features outside
 * the scope are scored `null`, which compositeScore() already treats as
 * "no answer".
 */
export function applyScores(features, inScope) {
  for (const feature of features) {
    for (const { property } of CRITERIA) feature.properties[property] = null;
  }

  for (const criterion of CRITERIA) {
    const { scale, invert } = SCORERS[criterion.key];
    // `raw` is the column the popup already shows next to the score, so the
    // number scored and the number displayed cannot drift apart.
    const scores = scale(
      inScope.map((feature) => feature.properties[criterion.raw] ?? null),
      { invert }
    );

    scores.forEach((score, index) => {
      inScope[index].properties[criterion.property] = score == null ? null : Math.round(score * 10) / 10;
    });
  }
}

/**
 * Weighted average of the enabled criteria, on the same 0-100 scale as its parts.
 *
 * A criterion at weight 0 drops out of the average entirely rather than pulling
 * the result toward zero, so muting one means "don't care", not "score badly".
 * Same for a null score: no answer, rather than a bad one.
 */
export function compositeScore(props, weights) {
  let weighted = 0;
  let total = 0;

  for (const criterion of CRITERIA) {
    const weight = weights[criterion.key];
    const score = props[criterion.property];
    if (!weight || score == null) continue;
    weighted += weight * score;
    total += weight;
  }

  return total === 0 ? null : weighted / total;
}
