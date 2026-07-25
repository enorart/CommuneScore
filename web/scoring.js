// Per-criterion 0-100 scores, recomputed in the browser over whatever set of
// communes the user has scoped to (see scopes.js).
//
// This is a port of etl/common/normalize.py and of the scoring block in
// etl/pipeline.py. The ETL still writes score_* columns for all of
// Île-de-France; those are the baseline and the reference this port is checked
// against — at the Île-de-France scope the two must agree.
//
// Scoring has to happen here rather than in the ETL because the comparison set
// is the user's choice: what counts as good transport among 1285 communes is
// not what counts as good transport inside one intercommunalité.

import { CRITERIA } from "./sliders.js";

// Null in, null out, everywhere below: a commune with no ANIL rent must score
// nothing rather than score badly, the way pandas skips NaN.
function scaleFinite(values, transform) {
  const known = values.filter((value) => value != null);
  if (known.length === 0) return values.map(() => null);
  return transform(values, known);
}

export function minMaxScale(values, { invert = false } = {}) {
  return scaleFinite(values, (all, known) => {
    const low = Math.min(...known);
    const high = Math.max(...known);

    // Every commune identical — reachable in a small scope, where a handful of
    // rural communes can share a count exactly. 50 rather than a division by
    // zero, matching normalize.min_max_scale.
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
export function logMinMaxScale(values, options) {
  return minMaxScale(
    values.map((value) => (value == null ? null : Math.log1p(value))),
    options
  );
}

// Rank as a percentage, ties sharing the average of the ranks they span —
// pandas' rank(method="average", pct=True).
export function percentileRank(values, { invert = false } = {}) {
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

// criterion key -> how its score is built, mirroring the scoring block of
// etl/pipeline.py. Every criterion is a count scored on a log scale, bar rent:
// it is a price, not a count, so the log has nothing to say about it, and
// cheaper is better — hence the inverted rank.
const SCORERS = { loyer: { scale: percentileRank, invert: true } };

for (const { key } of CRITERIA) {
  SCORERS[key] ??= { scale: logMinMaxScale };
}

/**
 * Score `inScope` against itself and write the results onto every feature.
 *
 * Scores land on `feature.properties.score_*`, replacing what the ETL wrote,
 * so the rest of app.js keeps reading `props[criterion.property]` and knows
 * nothing about scopes. Features outside the scope are scored `null`, which
 * compositeScore() already treats as "no answer".
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
