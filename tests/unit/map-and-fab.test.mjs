import test from "node:test";
import assert from "node:assert/strict";
import { areaAcres, fieldSides, normPostcode, geocodePostcode } from "../../app/js/screens/map-geo.js";

test("a 100 m square is about 2.47 acres with four 100 m sides", () => {
  const lat = 54.85, lng = -6.57, dLat = 100 / 111320, dLng = 100 / (111320 * Math.cos(lat * Math.PI / 180));
  const sq = [{ lat, lng }, { lat: lat + dLat, lng }, { lat: lat + dLat, lng: lng + dLng }, { lat, lng: lng + dLng }];
  assert.ok(Math.abs(areaAcres(sq) - 2.471) < 0.03, String(areaAcres(sq)));
  const s = fieldSides(sq); assert.equal(s.sides.length, 4);
  for (const x of s.sides) assert.ok(Math.abs(x.len - 100) < 1.5);
  // points traced along a straight hedge join into one side
  const mid = { lat: lat + dLat / 2, lng };
  assert.equal(fieldSides([sq[0], mid, sq[1], sq[2], sq[3]]).sides.length, 4);
});
test("postcode tidy and bad postcodes don't hit the network", async () => {
  assert.equal(normPostcode(" bt45 8pj "), "BT458PJ");
  assert.equal(await geocodePostcode("not a postcode"), null);
  const cache = new Map([["fl-pc-BT458PJ", JSON.stringify({ lat: 1, lng: 2 })]]);
  assert.deepEqual(await geocodePostcode("BT45 8PJ", cache), { lat: 1, lng: 2 });
});
