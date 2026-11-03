// Picker ranking (review A #1): exact management number, then the tag's own number as a block,
// then name, then loose matches — in every animal / cow / sow picker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchScore, rankMatches, cattleKeys, cowKeys, sowKeys, isExact } from "../../app/js/core/rank.js";
import { tagCheckDigit, tagMatches } from "../../app/js/sectors/beef/model/tags.js";
import { cowMatches } from "../../app/js/sectors/dairy/model/cows.js";
import { sowMatches } from "../../app/js/sectors/pigs/model/sows.js";

const tag = (n) => { const a = String(n).padStart(4, "0"); return `UK 9 012345 ${a} ${tagCheckDigit("012345", a)}`; };
// The seed herd the reviewer used: stock bull B1 (tag 0011), Peggy mgmt 0105 (tag 0403),
// a calf whose tag is 0105, steer 0111.
const herd = [
  { id: "bull", mgmtNo: "B1", name: "Gulladuff Ruler", tag: tag(11) },
  { id: "calf105", tag: tag(105) },
  { id: "peggy", mgmtNo: "0105", name: "Peggy", tag: tag(403) },
  { id: "steer111", tag: tag(111) },
  { id: "daisy", mgmtNo: "0412", name: "Daisy", tag: tag(400) },
  { id: "rosie", mgmtNo: "0291", name: "Rosie", tag: tag(402) },
];
const ids = (q) => rankMatches(herd, q, cattleKeys).map((x) => x.item.id);

test("cattle: management number beats a calf whose tag has the same digits", () => {
  assert.equal(ids("0105")[0], "peggy");
  assert.equal(ids("0105")[1], "calf105");
  assert.equal(ids("105")[0], "peggy", "leading zeros don't matter for the management number");
});

test("cattle: the tag's own number beats the stock bull whose tag merely ends in it", () => {
  assert.equal(ids("0111")[0], "steer111");
  assert.equal(ids("111")[0], "steer111");
  assert.ok(ids("0111").includes("bull"), "the bull still shows, lower down");
  const last5 = tag(111).replace(/\D/g, "").slice(-5);
  assert.equal(ids(last5)[0], "steer111", "last 5 digits with the check digit");
});

test("cattle: tag block, then name, then contains", () => {
  assert.equal(ids("0403")[0], "peggy", "Peggy's tag number");
  assert.equal(ids("peggy")[0], "peggy");
  assert.equal(ids("ros")[0], "rosie");
  assert.deepEqual(ids("ruler"), ["bull"]);
  assert.deepEqual(ids("zzz"), []);
  assert.equal(ids("").length, herd.length, "empty search lists everything in order");
  assert.deepEqual(ids(""), herd.map((a) => a.id));
});

test("scores: exactness levels", () => {
  assert.equal(matchScore(cattleKeys(herd[2]), "0105"), 0);
  assert.equal(matchScore(cattleKeys(herd[1]), "0105"), 1);
  assert.equal(matchScore(cattleKeys(herd[4]), "daisy"), 2);
  assert.ok(isExact(0) && isExact(2) && !isExact(5) && !isExact(null));
  assert.equal(matchScore(cattleKeys(herd[0]), "0111"), 5, "the bull: tag ends with the digits");
});

test("dairy cows: cow number first, then tag, then name", () => {
  const cows = [
    { id: "a", cowNo: "1170", name: "", tag: "UK 9 223344 00117" },
    { id: "b", cowNo: "117", name: "Rosie", tag: "UK 9 223344 10819" },
    { id: "c", cowNo: "17", name: "Number seventeen", tag: "UK 9 223344 11170" },
  ];
  const r = rankMatches(cows, "117", cowKeys).map((x) => x.item.id);
  assert.equal(r[0], "b");
  assert.ok(cowMatches(cows[0], "117") && cowMatches(cows[1], "rosie") && !cowMatches(cows[1], "zz"));
});

test("pigs: sow number exact beats sow numbers that start with it", () => {
  const sows = [{ id: "s93", sowNo: "93", tag: "UK1234 931" }, { id: "s931", sowNo: "931", tag: "UK1234 555" }, { id: "s9", sowNo: "9", tag: "UK1234 093" }];
  assert.deepEqual(rankMatches(sows, "93", sowKeys).map((x) => x.item.id).slice(0, 2), ["s93", "s931"]);
  assert.ok(sowMatches(sows[1], "931") && !sowMatches(sows[1], "77"));
});

test("old match helpers agree with the ranking (no animal lost)", () => {
  for (const q of ["0105", "111", "peggy", "uk9012345", "4031"]) for (const a of herd) assert.equal(tagMatches(a, q), matchScore(cattleKeys(a), q) != null, `${q} ${a.id}`);
});
