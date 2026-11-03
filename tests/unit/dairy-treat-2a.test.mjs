// Dairy treatment product list (review B #7): grouped by type, the farm's usual mastitis product, warnings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { productGroup, usualMastitisProduct, mastitisWarning } from "../../app/js/sectors/dairy/flows/treatment.js";

const store = [
  { id: "b", name: "Bultavo 3", kind: "Vaccine" }, { id: "s", name: "Synulox LC" }, { id: "u", name: "Ubrolexin" , kind: "Intramammary tube" },
  { id: "o", name: "Orbeseal" }, { id: "c", name: "Cepravin Dry Cow" }, { id: "m", name: "Metacam 20 mg/ml injection" }, { id: "x", name: "Hoof spray" },
];
test("groups: in-milk tubes, dry cow, injectables, vaccines, other", () => {
  assert.deepEqual(store.map(productGroup), ["vaccine", "inmilk", "inmilk", "dry", "dry", "injectable", "other"]);
});
test("usual mastitis product: the one used most; else the first in-milk tube", () => {
  const meds = [{ reason: "Mastitis", productId: "u" }, { reason: "Mastitis", productName: "ubrolexin" }, { reason: "Mastitis", productId: "s" }, { reason: "Lame", productId: "m" }];
  assert.equal(usualMastitisProduct({ data: { medicines: meds } }, store).id, "u");
  assert.equal(usualMastitisProduct({ data: { medicines: [] } }, store).id, "s");
});
test("warn on a vaccine or dry-cow tube for a milking cow's mastitis", () => {
  assert.match(mastitisWarning("Mastitis", store[0], true), /Bultavo 3 is a vaccine/);
  assert.match(mastitisWarning("Mastitis", store[3], true), /dry cow tube/);
  assert.equal(mastitisWarning("Mastitis", store[3], false), "");
  assert.equal(mastitisWarning("Lame", store[0], true), "");
  assert.equal(mastitisWarning("Mastitis", store[1], true), "");
});
