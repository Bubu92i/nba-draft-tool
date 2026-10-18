import { test } from "node:test";
import assert from "node:assert/strict";
import { replacementFpg, seasonValue } from "../site/lib/value.js";

test("remplacement = moyenne rangs 121-130", () => {
  const f = Array.from({ length: 200 }, (_, i) => 200 - i);
  assert.equal(replacementFpg(f), 75.5);
});
test("valeur au-dessus du remplaçant", () => {
  assert.equal(seasonValue(50, 70, 20), 2100);
  assert.equal(seasonValue(15, 70, 20), -350);
});
test("une star fragile n'est pas écrasée par un joueur moyen durable", () => {
  assert.ok(seasonValue(55, 50, 20) > seasonValue(35, 80, 20));
});
