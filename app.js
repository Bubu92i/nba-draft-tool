import { DRAFT_ID, LEAGUE_ID, DEFAULT_API, POLL_MS, USERS_REFRESH_MS } from "./lib/config.js";
import { deriveState, createPoller, secondsLeft } from "./lib/live.js";
import { bestLineup, STARTER_SLOTS, ROSTER_SIZE } from "./lib/recommend.js";

const params = new URLSearchParams(location.search);
const API = (params.get("api") ?? DEFAULT_API).replace(/\/+$/, "");
const DRAFT = params.get("draft") ?? DRAFT_ID;
const TABS = ["draft", "team", "board"];
const TIER_BADGE = {
  gone: ["gone", "⏳ Partira avant ton tour"],
  coinflip: ["coinflip", "⚖️ 50-50"],
  wait: ["wait", "✅ Peut attendre"],
};
const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

async function getJson(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

const app = {
  snapshot: null,
  draft: null,
  picks: [],
  traded: [],
  users: [],
  usersAt: 0,
  view: null,
  viewKey: null,
  tab: TABS.includes(localStorage.getItem("tab")) ? localStorage.getItem("tab") : "draft",
};

const el = {
  net: document.getElementById("net-banner"),
  status: document.getElementById("status"),
  foot: document.getElementById("foot"),
  panels: Object.fromEntries(TABS.map((t) => [t, document.getElementById(`tab-${t}`)])),
  tabs: [...document.querySelectorAll(".tab")],
};

function posBadges(positions) {
  return positions.map((p) => h("span", { class: `pos pos-${p}` }, p));
}
const seasonPts = (p) => Math.round(p.fpg * p.expectedGames);
function pickLabel(view, pickNo) {
  const teams = view.board[0].length;
  return `${Math.ceil(pickNo / teams)}.${String(((pickNo - 1) % teams) + 1).padStart(2, "0")}`;
}

function renderStatus() {
  const v = app.view;
  el.status.className = "status";
  el.status.replaceChildren();
  if (!v) {
    el.status.append(h("span", {}, "Chargement…"));
    return;
  }
  const secs = v.status === "drafting" && app.draft ? secondsLeft(app.draft, Date.now()) : null;
  const timer = secs != null ? h("span", { class: "timer" }, `⏱ ${secs} s`) : null;
  if (v.status === "pre_draft") {
    el.status.append(h("span", {}, "En attente du début de la draft"));
  } else if (v.status === "complete") {
    el.status.classList.add("done");
    el.status.append(h("span", {}, "Draft terminée"));
  } else if (v.isMyTurn) {
    el.status.classList.add("mine");
    el.status.append(h("span", {}, `À TOI ! · Pick ${pickLabel(v, v.currentPickNo)}`), timer);
  } else {
    const paused = v.status === "paused" ? "Draft en pause · " : "";
    let when = "ordre de draft pas encore connu";
    if (v.orderKnown) {
      if (v.picksUntilMe == null) when = "plus de pick pour toi";
      else if (v.picksUntilMe === 1) when = "à toi au prochain pick";
      else when = `à toi dans ${v.picksUntilMe} picks`;
    }
    el.status.append(h("span", {}, `${paused}Pick ${pickLabel(v, v.currentPickNo)} · ${when}`), timer);
  }
}

function emptyRecsMessage(v) {
  if (v.status === "complete") return "Draft terminée : plus rien à choisir.";
  if (v.myRoster.length >= ROSTER_SIZE) return "Aucune recommandation : ton effectif est complet.";
  return "Aucune recommandation : aucun joueur disponible ne comble un poste vide de ton cinq.";
}

function recCard(r) {
  const p = r.player;
  const badges = [];
  if (r.tier) badges.push(h("span", { class: `badge ${TIER_BADGE[r.tier][0]}` }, TIER_BADGE[r.tier][1]));
  if (p.injuryBadge) badges.push(h("span", { class: "badge inj" }, `🩹 ${p.injuryBadge}`));
  return h(
    "article",
    { class: "rec" },
    h("div", { class: "name" }, p.name),
    h("div", { class: "meta" }, posBadges(p.positions), p.team),
    h("div", { class: "pts" }, `≈ ${fmt0.format(seasonPts(p))} pts sur la saison`),
    h("div", { class: "why" }, r.reason),
    badges.length ? h("div", { class: "badges" }, badges) : null,
  );
}

function renderDraft(v) {
  const recs = v.recommendations.length
    ? h("div", { class: "recs" }, v.recommendations.map(recCard))
    : h("div", { class: "empty" }, emptyRecsMessage(v));
  const rows = v.topAvailable.map((p, i) =>
    h(
      "tr",
      {},
      h("td", { class: "n" }, i + 1),
      h("td", {}, h("b", {}, p.name), p.injuryBadge ? h("div", { class: "inj" }, `🩹 ${p.injuryBadge}`) : null),
      h("td", { class: "pos-cell" }, posBadges(p.positions)),
      h("td", {}, p.team),
      h("td", { class: "n" }, fmt.format(p.fpg)),
    ),
  );
  el.panels.draft.replaceChildren(
    h("h2", {}, "Recommandations"),
    recs,
    h("h2", {}, `Meilleurs joueurs disponibles (${v.topAvailable.length})`),
    h(
      "table",
      { class: "list" },
      h("thead", {}, h("tr", {}, h("th", { class: "n" }, "#"), h("th", {}, "Joueur"), h("th", {}, "Postes"), h("th", {}, "Éq."), h("th", { class: "n" }, "Pts/match"))),
      h("tbody", {}, rows),
    ),
  );
}

function renderTeam(v) {
  const L = bestLineup(v.myRoster);
  const byId = new Map(v.myRoster.map((p) => [p.id, p]));
  const starterIds = new Set();
  let starterTotal = 0;
  const slots = STARTER_SLOTS.map((slot) => {
    const p = byId.get(L.assignment[slot]);
    if (!p) {
      return h("div", { class: "slot vide" }, h("span", { class: "lbl" }, slot), h("span", { class: "who" }, "vide"));
    }
    starterIds.add(p.id);
    starterTotal += seasonPts(p);
    return h(
      "div",
      { class: "slot" },
      h("span", { class: "lbl" }, slot),
      h("span", { class: "who" }, p.name, h("div", { class: "sub" }, `${p.positions.join("/")} · ${p.team}`)),
      h("span", { class: "pts" }, `${fmt0.format(seasonPts(p))} pts`),
    );
  });
  const bench = v.myRoster.filter((p) => !starterIds.has(p.id));
  const benchSlots = Array.from({ length: ROSTER_SIZE - STARTER_SLOTS.length }, (_, i) => {
    const p = bench[i];
    if (!p) return h("div", { class: "slot vide" }, h("span", { class: "lbl" }, "BN"), h("span", { class: "who" }, "vide"));
    return h(
      "div",
      { class: "slot" },
      h("span", { class: "lbl" }, "BN"),
      h("span", { class: "who" }, p.name, h("div", { class: "sub" }, `${p.positions.join("/")} · ${p.team}`)),
      h("span", { class: "pts" }, `${fmt0.format(seasonPts(p))} pts`),
    );
  });
  el.panels.team.replaceChildren(
    h("h2", {}, "Cinq majeur"),
    h("div", { class: "lineup" }, slots),
    h("div", { class: "total" }, `Total attendu (cinq majeur) : ${fmt0.format(starterTotal)} pts sur la saison`),
    h("h2", {}, `Banc (${bench.length}/${ROSTER_SIZE - STARTER_SLOTS.length})`),
    h("div", { class: "lineup" }, benchSlots),
  );
}

const SUFFIX = new Set(["Jr.", "Sr.", "II", "III", "IV", "V"]);
function shortName(name) {
  const parts = name.split(" ");
  if (parts.length < 2) return name;
  let last = parts.slice(-1);
  if (SUFFIX.has(parts.at(-1)) && parts.length > 2) last = parts.slice(-2);
  return `${parts[0][0]}. ${last.join(" ")}`;
}

function renderBoard(v) {
  const head = h(
    "tr",
    {},
    h("th", { class: "rowh" }, "R"),
    v.columns.map((c) => h("th", { class: c.slot === v.mySlot ? "mine-col" : "" }, c.label)),
  );
  const rows = v.board.map((row, ri) =>
    h(
      "tr",
      {},
      h("th", { class: "rowh" }, ri + 1),
      row.map((cell, ci) => {
        const classes = ["cell"];
        if (ci + 1 === v.mySlot) classes.push("mine-col");
        if (cell.pickNo === v.currentPickNo) classes.push("current");
        if (cell.player) classes.push(`p-${cell.player.positions[0] ?? "X"}`);
        else if (cell.isMine) classes.push("mine-future");
        const body = cell.player
          ? [h("span", { class: "pk" }, pickLabel(v, cell.pickNo)), h("span", { class: "nm" }, shortName(cell.player.name))]
          : cell.isMine
            ? [h("span", { class: "nm" }, `à toi #${cell.pickNo}`)]
            : [h("span", { class: "pk" }, pickLabel(v, cell.pickNo))];
        return h("td", { class: classes.join(" ") }, body);
      }),
    ),
  );
  el.panels.board.replaceChildren(h("div", { class: "board-wrap" }, h("table", { class: "board" }, h("thead", {}, head), h("tbody", {}, rows))));
}

function renderPanels() {
  if (!app.view) return;
  renderDraft(app.view);
  renderTeam(app.view);
  renderBoard(app.view);
}

function showTab(tab) {
  app.tab = tab;
  localStorage.setItem("tab", tab);
  for (const t of TABS) el.panels[t].hidden = t !== tab;
  for (const b of el.tabs) {
    b.classList.toggle("active", b.dataset.tab === tab);
    b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  }
}

function recompute(now) {
  const key = JSON.stringify([app.draft.status, app.draft.draft_order, app.draft.slot_to_roster_id, app.picks.length, app.picks.at(-1)?.player_id, app.traded, app.users]);
  if (key === app.viewKey) return false;
  app.viewKey = key;
  app.view = deriveState({ snapshot: app.snapshot, draft: app.draft, picks: app.picks, tradedPicks: app.traded, users: app.users, now });
  return true;
}

async function fetchOnce() {
  const needUsers = Date.now() - app.usersAt > USERS_REFRESH_MS;
  const [draft, picks, traded, users] = await Promise.all([
    getJson(`/v1/draft/${DRAFT}`),
    getJson(`/v1/draft/${DRAFT}/picks`),
    getJson(`/v1/draft/${DRAFT}/traded_picks`),
    needUsers ? getJson(`/v1/league/${LEAGUE_ID}/users`) : null,
  ]);
  return { draft, picks, traded, users };
}

function onData({ draft, picks, traded, users }) {
  el.net.hidden = true;
  app.draft = draft;
  app.picks = picks;
  app.traded = traded;
  if (users) {
    app.users = users;
    app.usersAt = Date.now();
  }
  if (recompute(Date.now())) renderPanels();
  renderStatus();
}

function onError(err) {
  console.error("Sleeper API:", err);
  el.net.hidden = false;
}

async function main() {
  for (const b of el.tabs) b.addEventListener("click", () => showTab(b.dataset.tab));
  showTab(app.tab);
  renderStatus();
  const res = await fetch("data/snapshot.json");
  if (!res.ok) throw new Error(`snapshot.json → HTTP ${res.status}`);
  app.snapshot = await res.json();
  el.foot.textContent = `Données du ${new Date(app.snapshot.generatedAt).toLocaleString("fr-FR")} · API ${API}`;
  setInterval(() => {
    if (app.view) renderStatus();
  }, 1000);
  createPoller({ fetchOnce, onData, onError, delayMs: POLL_MS }).start();
}

main().catch((err) => {
  console.error(err);
  el.status.className = "status";
  el.status.textContent = `Erreur de chargement : ${err.message}`;
});
