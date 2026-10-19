import test from "node:test";
import assert from "node:assert/strict";
import { expertLine, expertDisagreement, noteBadge, expertSourcesLine } from "../site/lib/experts.js";

const P = (avgRank, ranks = {}, toolRank = 50, notes = []) => ({ toolRank, experts: avgRank == null ? { avgRank: null, ranks: {}, notes } : { avgRank, ranks, notes } });

test("expertLine : null sans avis experts", () => {
  assert.equal(expertLine({}), null);
  assert.equal(expertLine(P(null)), null);
});

test("expertLine : sources présentes dans l'ordre ESPN, Yahoo, FantasyPros", () => {
  assert.equal(expertLine(P(14, { fp: 14, espn: 12, yahoo: 16 })), "Experts : 14e (ESPN 12 · Yahoo 16 · FantasyPros 14)");
  assert.equal(expertLine(P(145, { yahoo: 145 })), "Experts : 145e (Yahoo 145)");
  assert.equal(expertLine(P(131, { espn: 117, fp: 145 })), "Experts : 131e (ESPN 117 · FantasyPros 145)");
});

test("expertLine : 1er pour le rang 1", () => {
  assert.equal(expertLine(P(1, { espn: 1, yahoo: 1, fp: 1 })), "Experts : 1er (ESPN 1er · Yahoo 1er · FantasyPros 1er)");
});

test("expertDisagreement : null sans experts, sans toolRank ou hors top 150 experts", () => {
  assert.equal(expertDisagreement({}), null);
  assert.equal(expertDisagreement(P(null)), null);
  assert.equal(expertDisagreement({ experts: { avgRank: 10, ranks: {}, notes: [] } }), null);
  assert.equal(expertDisagreement(P(151, {}, 400)), null);
  assert.equal(expertDisagreement(P(180, {}, 20)), null);
});

test("expertDisagreement : optimistes quand l'outil classe plus bas (seuil max(20, 0,5×avg))", () => {
  assert.deepEqual(expertDisagreement(P(10, {}, 30)), { kind: "optimistes", text: "⚠️ Experts plus optimistes : 10e chez eux, 30e dans l'outil (classement général)" });
  assert.equal(expertDisagreement(P(10, {}, 29)), null);
  assert.equal(expertDisagreement(P(60, {}, 89)), null);
  assert.equal(expertDisagreement(P(60, {}, 90))?.kind, "optimistes");
  assert.equal(expertDisagreement(P(100, {}, 149)), null);
  assert.equal(expertDisagreement(P(100, {}, 150))?.kind, "optimistes");
});

test("expertDisagreement : « hors top 200 » au-delà de 200", () => {
  assert.equal(expertDisagreement(P(90, {}, 200)).text, "⚠️ Experts plus optimistes : 90e chez eux, 200e dans l'outil (classement général)");
  assert.equal(expertDisagreement(P(90, {}, 201)).text, "⚠️ Experts plus optimistes : 90e chez eux, hors top 200 dans l'outil (classement général)");
});

test("expertDisagreement : prudents quand l'outil classe plus haut (seuil max(20, 0,5×toolRank))", () => {
  assert.deepEqual(expertDisagreement(P(60, {}, 20)), { kind: "prudents", text: "⚠️ Experts plus prudents : 60e chez eux, 20e dans l'outil (classement général)" });
  assert.equal(expertDisagreement(P(39, {}, 20)), null);
  assert.equal(expertDisagreement(P(89, {}, 60)), null);
  assert.equal(expertDisagreement(P(90, {}, 60))?.kind, "prudents");
});

test("expertDisagreement : rang 1 en ordinal", () => {
  assert.equal(expertDisagreement(P(40, {}, 1)).text, "⚠️ Experts plus prudents : 40e chez eux, 1er dans l'outil (classement général)");
});

test("noteBadge : icône par étiquette", () => {
  assert.deepEqual(noteBadge({ tag: "sleeper", text: "a" }), { icon: "💎", text: "a" });
  assert.deepEqual(noteBadge({ tag: "bust", text: "b" }), { icon: "📉", text: "b" });
  assert.deepEqual(noteBadge({ tag: "role", text: "c" }), { icon: "🔄", text: "c" });
  assert.deepEqual(noteBadge({ tag: "injury", text: "d" }), { icon: "🏥", text: "d" });
});

test("expertSourcesLine : dates j/m, absente sans sources", () => {
  assert.equal(expertSourcesLine(undefined), null);
  assert.equal(expertSourcesLine([]), null);
  assert.equal(
    expertSourcesLine([{ key: "espn", label: "ESPN", date: "2026-10-09" }, { key: "yahoo", label: "Yahoo", date: "2026-09-29" }, { key: "fp", label: "FantasyPros", date: "2026-10-18" }]),
    "Avis d'experts (ligues aux points) : ESPN 9/10 · Yahoo 29/9 · FantasyPros 18/10. Le classement de l'outil n'en tient pas compte.",
  );
});
