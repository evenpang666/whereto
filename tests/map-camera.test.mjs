import test from 'node:test';
import assert from 'node:assert/strict';
import { geoNaturalEarth1, geoMercator, geoPath } from 'd3-geo';
import { mapCamera, interpolateCamera, cameraProjection } from '../src/map-camera.js';

test('animated camera preserves fitted world and local projections, including manual zoom and pan', () => {
  const projections = [
    geoNaturalEarth1().fitExtent([[30, 30], [910, 565]], { type: 'Sphere' }),
    geoMercator().rotate([105.5, 0]).fitExtent([[70, 50], [870, 540]], {
      type: 'MultiPoint', coordinates: [[-109, 37], [-102, 41]],
    }),
  ];
  for (const [index, projection] of projections.entries()) {
    for (const zoom of [1, 2.6]) {
      const pan = [37, -19];
      const animated = cameraProjection(mapCamera(projection, index === 1, zoom, pan));
      for (const coordinates of [[-105, 39], [-73, 41], [139, 36], [0, 0]]) {
        const expected = projection(coordinates).map((v, i) => [470, 310][i] + (v - [470, 310][i]) * zoom + pan[i]);
        animated(coordinates).forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-7));
      }
    }
  }
});

test('world-to-city transition has finite intermediate geometry at poles and the date line', () => {
  const from = mapCamera(geoNaturalEarth1().scale(170), false);
  const to = mapCamera(geoMercator().rotate([-178, 0]).scale(150000).translate([470, 160000]), true);
  const points = [[-180, -90], [180, 90], [179.9, 40], [-179.9, -30], [0, 0]];
  for (let step = 0; step <= 20; step++) {
    const camera = interpolateCamera(from, to, step / 20);
    const projection = cameraProjection(camera);
    assert.ok(camera.scale >= from.scale && camera.scale <= to.scale);
    for (const coordinates of points) assert.ok(projection(coordinates).every(Number.isFinite));
    assert.doesNotMatch(geoPath(projection)({ type: 'Sphere' }) || '', /NaN|Infinity/);
  }
  assert.equal(interpolateCamera(from, to, 0), from);
  assert.equal(interpolateCamera(from, to, 1), to);
});

test('interrupted camera transitions resume at the displayed view and cross the date line by the short arc', () => {
  const from = mapCamera(geoMercator().rotate([179, 0]).scale(200), true);
  const to = mapCamera(geoMercator().rotate([-179, 0]).scale(800), true);
  const middle = interpolateCamera(from, to, .5);
  assert.equal(middle.rotation, 180);
  const interrupted = interpolateCamera(middle, from, 0);
  assert.deepEqual(interrupted, middle);
  assert.ok(Math.abs(middle.scale - 400) < 1e-7);
});
