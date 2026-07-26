// Just enough geometry to frame and point at a commune. The real spatial work
// (buffers, spatial joins) happens in the ETL; nothing here needs to be exact.

function outerRings(geometry) {
  return geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0]);
}

// [[west, south], [east, north]] over a set of features, for fitBounds.
export function bounds(features) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const feature of features) {
    for (const ring of outerRings(feature.geometry)) {
      for (const [lng, lat] of ring) {
        if (lng < west) west = lng;
        if (lng > east) east = lng;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      }
    }
  }
  return [
    [west, south],
    [east, north],
  ];
}

// Average of the outer ring vertices : close enough to place a popup and a map
// centre, and far cheaper than a true centroid on 1285 polygons.
export function centroid(geometry) {
  let x = 0;
  let y = 0;
  let n = 0;

  for (const ring of outerRings(geometry)) {
    for (const [lng, lat] of ring) {
      x += lng;
      y += lat;
      n += 1;
    }
  }
  return [x / n, y / n];
}
