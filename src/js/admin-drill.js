// FUTCHY's dashboard drill-downs (Chen, 2026-11-23): /admin/installs (the installs tile), /admin/today (the "played
// today" tile) and /admin/live (the "playing now" tile: who is connected right now, refreshed every 30 seconds). The same sign-in as /admin (admin-auth.js); the numbers come from public.admin_installs(p_days) and
// public.admin_played_day(p_day) / public.admin_live_now(), which answer only the owners (analytics.is_admin, else 'forbidden'). Every raw id is
// shown in the game's own Hebrew (admin-labels.js). Everything from the server is written as text, never as HTML.
// On the local preview only (localhost/admin/installs?demo): the fixtures in tools/fixtures - the real functions' output
// on a synthetic database - served by tools/serve.mjs at /__mock/.
const { BACKEND, ANON, KEY, stored, token } = window.FutchyAuth;
const L = window.FutchyLabels;
const PAGE = document.body.dataset.page;
const DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has("demo");

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat("he-IL");
const num = (v) => (v === null || v === undefined || Number.isNaN(+v)) ? "–" : nf.format(Math.round(+v));
const pct = (v) => (v === null || v === undefined || !Number.isFinite(+v)) ? "–" : `${(+v).toLocaleString("he-IL", { maximumFractionDigits: 1 })}%`;
const share = (a, b) => b > 0 ? 100 * a / b : null;
const dayOf = (s) => new Date(s + "T12:00:00");
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, k) => { const d = dayOf(s); d.setDate(d.getDate() + k); return iso(d); };
const shortDate = (s) => dayOf(s).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
const longDate = (s) => dayOf(s).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}
function duration(sec) {
  if (sec === null || sec === undefined) return "–";
  sec = Math.round(+sec);
  if (sec < 60) return `${sec} שנ׳`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, "0")} דק׳`;
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, "0")} שע׳`;
}
const hours = (sec) => sec ? nf.format(Math.round(sec / 3600)) : "–";
// A length for a big tile: "13:18" (the unit goes in the line under it, so the display font shows digits only).
function clock(sec) {
  if (sec === null || sec === undefined) return ["–", ""];
  sec = Math.round(+sec);
  if (sec < 60) return [String(sec), "שניות"];
  const m = Math.floor(sec / 60);
  if (m < 60) return [`${m}:${String(sec % 60).padStart(2, "0")}`, "דקות"];
  return [`${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`, "שעות"];
}
// A number with its sign, kept left-to-right inside Hebrew text ("+13.3%").
const signed = (v) => `\u2066${v >= 0 ? "+" : "−"}${pct(Math.abs(v))}\u2069`;
const version = (v, b) => `${!v || v === "?" ? "לא ידוע" : v}${b ? ` · בילד ${b}` : ""}`;
const countryName = (c) => `${L.flag(c)} ${L.country(c)}`.trim();

// ---- sign-in, loading ---------------------------------------------------------------------------------------------

function gate(note) {
  $("board").hidden = true; $("tools").hidden = true; $("gate").hidden = false;
  $("gate-note").textContent = note || "";
  $("status").textContent = "";
}
$("signin").addEventListener("click", () => window.FutchyAuth.signIn(location.pathname + location.hash).catch(e => gate(e.message)));

let loading = false, retried = false;
async function rpc(fn, args) {
  if (DEMO) return demo(fn, args);
  const t = await token();
  if (!t) { gate(""); return null; }
  const r = await fetch(`${BACKEND}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify(args) });
  const j = await r.json().catch(() => null);
  if (r.status === 401 || r.status === 403 || (j && /forbidden/.test(j.message || ""))) {
    const who = stored()?.email || "";
    localStorage.removeItem(KEY);
    gate(`לחשבון ${who} אין גישה ללוח הזה.`);
    return null;
  }
  if (!r.ok || !j) throw new Error(j?.message || `שגיאה ${r.status}`);
  return j;
}
async function load(fn, args, draw, quiet = false) {
  if (loading) return;
  loading = true;
  if (!quiet) $("status").textContent = "טוען…";
  try {
    const d = await rpc(fn, args);
    if (!d) return;
    $("gate").hidden = true; $("board").hidden = false; $("tools").hidden = false;
    draw(d);
    $("status").textContent = "";
    const at = new Date(d.generated_at).toLocaleTimeString("he-IL", PAGE === "live" ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
    $("stamp").textContent = DEMO ? "נתוני דוגמה" : PAGE === "live" ? `עודכן ${at} · מתרענן כל 30 שניות` : `עודכן ${at}`;
    retried = false;
  } catch (e) {
    if (!retried && /timeout/i.test(e.message || "")) {   // a cold server cache: the second try loads
      retried = true; loading = false;
      $("status").textContent = "טוען…";
      setTimeout(() => load(fn, args, draw), 3000);
      return;
    }
    retried = false;
    $("status").textContent = `לא הצלחנו לטעון: ${e.message}`;
  } finally { loading = false; }
}

// The local preview's fixtures (the real functions' output on a synthetic database).
let demoToday = null;
async function demo(fn, args) {
  const get = async (name) => (await fetch(`/__mock/${name}.json`)).json();
  if (fn === "admin_installs") return get(`admin_installs_${args.p_days >= 90 ? 90 : 30}`);
  if (fn === "admin_live_now") return { ...(await get("admin_live_now")), generated_at: new Date().toISOString() };
  if (!demoToday) demoToday = (await get("admin_played_day_0")).today;
  const want = args.p_day || demoToday;
  const back = Math.round((dayOf(demoToday) - dayOf(want)) / 864e5);
  const d = await get(`admin_played_day_${Math.min(6, Math.max(0, back))}`);
  return back > 6 ? { ...d, day: want, is_today: false } : d;
}

// ---- drawing: tiles, tables, a stacked bar chart -----------------------------------------------------------------

function tile(label, value, sub, opts = {}) {
  const t = el("div", "tile" + (opts.accent ? " tile--accent" : "") + (opts.live ? " tile--live" : ""));
  const head = el("div", "tile__label");
  if (opts.live) head.append(el("span", "pulse"));
  head.append(document.createTextNode(label));
  t.append(head, el("div", "tile__value", value));
  if (sub) t.append(el("div", "tile__sub", sub));
  if (opts.meter !== undefined && opts.meter !== null) {
    const m = el("div", "tile__meter"); const f = el("span"); f.style.width = `${Math.max(0, Math.min(100, opts.meter))}%`; m.append(f); t.append(m);
  }
  if (opts.hint) t.title = opts.hint;
  return t;
}

// A table: columns {label, get, fmt, num, bar, raw}; opts {wide, empty, onRow, max (rows shown before "more")}.
function table(title, sub, cols, rows, opts = {}) {
  const card = el("article", "card" + (opts.wide ? " wide" : ""));
  card.append(el("h2", null, title));
  if (sub) card.append(el("p", "sub", sub));
  if (!rows?.length) { card.append(el("p", "empty", opts.empty || "אין נתונים ליום הזה.")); return card; }
  const t = el("table");
  const head = el("tr");
  const cls = (c) => [c.num ? "n" : "", c.wideOnly ? "ph-hide" : ""].filter(Boolean).join(" ") || null;
  for (const c of cols) { const th = el("th", cls(c), c.label); if (c.short) th.dataset.short = c.short; head.append(th); }
  const thead = el("thead"); thead.append(head); t.append(thead);
  const body = el("tbody");
  const maxes = cols.map(c => c.bar ? Math.max(1, ...rows.map(r => +c.get(r) || 0)) : 0);
  for (const r of rows) {
    const tr = el("tr");
    if (opts.onRow) { tr.classList.add("clickable"); tr.tabIndex = 0; tr.addEventListener("click", () => opts.onRow(r));
                      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") opts.onRow(r); }); }
    cols.forEach((c, i) => {
      const v = c.get(r);
      const td = el("td", cls(c));
      if (c.bar) {
        if (+v > 0) { const meter = el("span", "meter"); meter.style.setProperty("--w", `${Math.round(100 * (+v || 0) / maxes[i])}%`); td.append(meter); }
        td.append(el("span", "meter__v", (c.fmt || num)(v)));
        td.classList.add("has-meter");
      } else td.textContent = (c.fmt || (c.num ? num : ((x) => x ?? "–")))(v);
      const raw = c.raw ? c.raw(r) : null;
      if (raw && String(raw) !== td.textContent) { td.append(el("span", "raw", raw)); td.title = String(raw); }
      tr.append(td);
    });
    body.append(tr);
  }
  t.append(body);
  const wrap = el("div", "scroll"); wrap.append(t);
  card.append(wrap);
  return card;
}

const SVGNS = "http://www.w3.org/2000/svg";
function svg(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }

function legend(box, series) {
  box.replaceChildren(...series.map(s => { const i = el("span", "legend__i"); i.append(el("span", `sw ${s.cls}`), document.createTextNode(s.label)); return i; }));
}

// Stacked bars: rows [{...}], series [{key, label, cls}], opts {label(row), every, tip(row) -> [lines], ghost(row), mark(row)}.
function stacked(box, rows, series, opts) {
  box.replaceChildren();
  const total = (r) => series.reduce((s, x) => s + (+r[x.key] || 0), 0);
  if (!rows.length || !rows.some(r => total(r) > 0)) { box.append(el("p", "empty", "אין נתונים.")); }
  // drawn at the box's own width (CSS pixels): crisp text and bars on a phone and on a desktop alike
  const W = Math.max(300, Math.round(box.clientWidth || 760)), H = W < 520 ? Math.round((opts.height || 240) * 0.9) : (opts.height || 240);
  const top = 14, bottom = 26, left = 4, right = 36;
  const every = Math.max(opts.every || 1, Math.ceil(rows.length / Math.max(4, Math.floor((W - left - right) / 46))));
  const max = Math.max(1, ...rows.map(total)) * 1.1;
  const step = (W - left - right) / rows.length, bw = Math.max(2, step * 0.72);
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "" });
  const y = (v) => top + (H - top - bottom) * (1 - v / max);
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    s.append(svg("line", { x1: left, x2: W - right, y1: y(max * f), y2: y(max * f), class: "gridline" }));
    if (f % 0.5 === 0) { const lab = svg("text", { x: W - right + 6, y: y(max * f) + 4, class: "axis", "text-anchor": "start" }); lab.textContent = num(max * f); s.append(lab); }
  }
  const tip = el("div", "tip"); tip.hidden = true;
  let on = null;
  rows.forEach((r, i) => {
    const x = left + i * step + (step - bw) / 2;
    const g = svg("g", { class: "stack" + (opts.ghost?.(r) ? " stack--ghost" : "") + (opts.mark?.(r) ? " stack--mark" : "") });
    let acc = 0;
    for (const ser of series) {
      const v = +r[ser.key] || 0;
      if (v <= 0) continue;
      const h = Math.max(1.5, (H - top - bottom) * v / max);
      g.append(svg("rect", { x, y: y(acc) - h, width: bw, height: h, class: `seg ${ser.cls}` }));
      acc += v;
    }
    const caps = g.querySelectorAll("rect");
    if (caps.length) caps[caps.length - 1].setAttribute("rx", Math.min(3, bw / 3));
    const hit = svg("rect", { x: left + i * step, y: top, width: step, height: H - top - bottom, class: "hit" });
    const show = () => {
      tip.replaceChildren(...opts.tip(r).map((line, k) => el(k ? "span" : "strong", null, line)));
      tip.hidden = false;
      const bx = box.getBoundingClientRect(), hx = hit.getBoundingClientRect();
      const tw = Math.min(200, bx.width - 8);
      tip.style.width = `${tw}px`;
      tip.style.left = `${Math.min(bx.width - tw, Math.max(0, hx.left - bx.left + hx.width / 2 - tw / 2))}px`;
      if (on) on.classList.remove("stack--on");
      g.classList.add("stack--on"); on = g;
    };
    const hide = () => { tip.hidden = true; g.classList.remove("stack--on"); };
    hit.addEventListener("pointerenter", show); hit.addEventListener("pointerleave", hide); hit.addEventListener("pointerdown", show);
    s.append(g, hit);
    if ((rows.length - 1 - i) % every === 0) {
      const t = svg("text", { x: x + bw / 2, y: H - 8, class: "axis", "text-anchor": "middle" });
      t.textContent = opts.label(r);
      s.append(t);
    }
  });
  box.append(s, tip);
}

// ================================================================================================================
// /admin/installs
// ================================================================================================================

let days = 30, filter = "", inst = null;
const PLAT = [{ key: "ios", label: "אייפון", cls: "s-ios" }, { key: "android", label: "אנדרואיד", cls: "s-android" },
              { key: "other", label: "גרסת פיתוח / אחר", cls: "s-other" }];
const platKey = (p) => p === "iOS" ? "ios" : p === "Android" ? "android" : "other";

function drawInstalls(d) {
  inst = d;
  const t = d.totals, r = d.recent;
  const wk = r.prev_7 > 0 ? 100 * (r.last_7 - r.prev_7) / r.prev_7 : null;
  $("tiles").replaceChildren(
    tile("סך הכול התקנות", num(t.installs_total), `${num(t.tracked_total)} נמדדו · ${num(t.pre_analytics_estimate)} לפני המדידה*`, { accent: true }),
    tile("היום", num(r.today), `אתמול ${num(r.yesterday)}`),
    tile("7 הימים האחרונים", num(r.last_7), wk === null ? "אין עדיין שבוע קודם להשוואה" : `${signed(wk)} לעומת 7 הימים שלפני`),
    tile(`ב-${d.days} הימים`, num(t.period), `ממוצע ${num(t.period / d.days)} ביום`),
    tile("מחוברים לחשבון", pct(share(t.signed_in_total, t.tracked_total)), `${num(t.signed_in_total)} התקנות עם חשבון`, { meter: share(t.signed_in_total, t.tracked_total) }),
    tile("חזרו למחרת", pct(share(r.d1, r.d1_base)), `${num(r.d1)} מתוך ${num(r.d1_base)} שעבר להן יום`, { meter: share(r.d1, r.d1_base), hint: "שיחקו שוב ביום שאחרי יום ההתקנה (D1)" }),
    tile("חזרו אחרי שבוע", pct(share(r.d7, r.d7_base)), `${num(r.d7)} מתוך ${num(r.d7_base)} שעבר להן שבוע`, { meter: share(r.d7, r.d7_base), hint: "שיחקו ביום השביעי אחרי ההתקנה (D7)" }),
    tile("חזרו ביום אחר", pct(share(r.returned, t.period)), `${num(r.returned)} התקנות שנראו גם אחרי יום ההתקנה`, { meter: share(r.returned, t.period) }));
  $("estimate").textContent = `* הסך הכול כולל כ-${num(t.pre_analytics_estimate)} הורדות מה-App Store בין 24 ל-27.10.2026, לפני שהמשחק התחיל למדוד. הן לא מופיעות בפירוט לפי יום, מדינה או מכשיר. ימים לפי שעון ישראל.`;

  // the country filter: a select with every country, chips for the biggest
  const countries = d.countries.filter(c => c.period > 0);
  const sel = $("country");
  sel.replaceChildren(el("option", null, "כל המדינות"));
  sel.firstChild.value = "";
  for (const c of countries) { const o = el("option", null, `${countryName(c.country)} (${num(c.period)})`); o.value = c.country; sel.append(o); }
  if (filter && !countries.some(c => c.country === filter)) filter = "";
  sel.value = filter;
  const chips = $("chips");
  chips.replaceChildren(...[{ country: "" }, ...countries.slice(0, 6)].map(c => {
    const b = el("button", "chip", c.country ? countryName(c.country) : "הכל");
    b.type = "button"; b.dataset.country = c.country;
    b.setAttribute("aria-pressed", String(c.country === filter));
    b.addEventListener("click", () => setFilter(c.country));
    return b;
  }));
  drawDaily();
  drawInstallTables(d);
}

function setFilter(c) {
  filter = c || "";
  $("country").value = filter;
  for (const b of $("chips").children) b.setAttribute("aria-pressed", String(b.dataset.country === filter));
  drawDaily();
}
$("country")?.addEventListener("change", (e) => setFilter(e.target.value));

function drawDaily() {
  const d = inst;
  const byDay = new Map();
  for (let k = 0; k < d.days; k++) { const day = addDays(d.first_day, k); byDay.set(day, { day, ios: 0, android: 0, other: 0, signed: 0 }); }
  for (const c of d.cells) {
    if (filter && c.country !== filter) continue;
    const r = byDay.get(c.day);
    if (!r) continue;
    r[platKey(c.platform)] += c.installs;
    r.signed += c.signed_in || 0;
  }
  const cohorts = new Map(d.cohorts.map(c => [c.day, c]));
  const rows = [...byDay.values()];
  const sum = rows.reduce((s, r) => s + r.ios + r.android + r.other, 0);
  $("daily-sub").textContent = `${filter ? countryName(filter) : "כל המדינות"} · ${num(sum)} התקנות ב-${d.days} ימים · לפי יום בשעון ישראל`;
  legend($("legend"), PLAT);
  stacked($("daily"), rows, PLAT, {
    aria: "התקנות חדשות בכל יום", height: 260, every: d.days > 40 ? 10 : 5, label: (r) => shortDate(r.day),
    mark: (r) => r.day === d.today,
    tip: (r) => {
      const n = r.ios + r.android + r.other, c = cohorts.get(r.day);
      const lines = [longDate(r.day), `${num(n)} התקנות`];
      if (r.ios) lines.push(`אייפון ${num(r.ios)}`);
      if (r.android) lines.push(`אנדרואיד ${num(r.android)}`);
      if (r.other) lines.push(`פיתוח / אחר ${num(r.other)}`);
      if (n) lines.push(`מחוברים לחשבון ${pct(share(r.signed, n))}`);
      if (!filter && c?.d1_base) lines.push(`חזרו למחרת ${pct(share(c.d1, c.d1_base))}`);
      return lines;
    },
  });
}

function drawInstallTables(d) {
  const per = `ב-${d.days} הימים`;
  const os = L.groupBy(d.os, r => L.os(r.value), ["total", "period"]).sort((a, b) => b.total - a.total);
  const rawOf = (r) => r.raws.length === 1 ? r.raws[0].value : `${r.raws.length} גרסאות: ${r.raws.slice(0, 3).map(x => x.value).join(", ")}${r.raws.length > 3 ? "…" : ""}`;
  const cohorts = [...d.cohorts].reverse().slice(0, 21);
  const first = d.first_versions.map(v => ({ ...v, label: version(v.app_version, v.build_number) }));
  $("tables").replaceChildren(
    table("מדינות", `כל ההתקנות שנמדדו · לחיצה על מדינה מסננת את הגרף · לפי הגדרת האזור בטלפון`, [
      { label: "מדינה", get: r => countryName(r.country), raw: r => r.country === "?" ? null : r.country },
      { label: "סך הכול", get: r => r.total, num: true, bar: true },
      { label: per, get: r => r.period, num: true, wideOnly: true },
      { label: "מחוברים", short: "חשבון", get: r => share(r.signed_in, r.period), fmt: pct, num: true },
      { label: "למחרת", get: r => share(r.d1, r.d1_base), fmt: pct, num: true },
      { label: "אחרי שבוע", get: r => share(r.d7, r.d7_base), fmt: pct, num: true, wideOnly: true }],
      d.countries, { wide: true, onRow: (r) => { setFilter(r.country); document.querySelector(".card.wide").scrollIntoView({ behavior: "smooth", block: "start" }); } }),
    table("חזרו לשחק, לפי יום ההתקנה", "מכל יום: כמה חזרו למחרת, אחרי שבוע, ובכלל", [
      { label: "יום", get: r => shortDate(r.day) },
      { label: "התקנות", get: r => r.installs, num: true, bar: true },
      { label: "למחרת", get: r => r.d1_base ? share(r.d1, r.d1_base) : null, fmt: pct, num: true },
      { label: "אחרי שבוע", short: "שבוע", get: r => r.d7_base ? share(r.d7, r.d7_base) : null, fmt: pct, num: true },
      { label: "חזרו", get: r => share(r.returned, r.installs), fmt: pct, num: true }], cohorts),
    table("סוג טלפון", null, [
      { label: "סוג", get: r => L.platform(r.value), raw: r => r.value },
      { label: "סך הכול", get: r => r.total, num: true, bar: true },
      { label: per, get: r => r.period, num: true }], d.platforms),
    table("הגרסה שבה התקינו", `${per} · מאיפה הורידו: חנות, בדיקה או פיתוח`, [
      { label: "גרסה", get: r => r.label },
      { label: "מאיפה", get: r => L.env(r.env) },
      { label: "התקנות", get: r => r.installs, num: true, bar: true }], first),
    table("הגרסה שיש להם עכשיו", "הגרסה האחרונה שכל התקנה דיווחה", [
      { label: "גרסה", get: r => r.value === "?" ? "לא ידוע" : r.value },
      { label: "סך הכול", get: r => r.total, num: true, bar: true },
      { label: per, get: r => r.period, num: true }], d.versions),
    table("מכשירים", null, [
      { label: "דגם", get: r => L.device(r.value), raw: r => r.value },
      { label: "סך הכול", get: r => r.total, num: true, bar: true },
      { label: per, get: r => r.period, num: true }], d.devices),
    table("גרסת מערכת", null, [
      { label: "מערכת", get: r => r.label, raw: rawOf },
      { label: "סך הכול", get: r => r.total, num: true, bar: true },
      { label: per, get: r => r.period, num: true }], os));
}

// ================================================================================================================
// /admin/today
// ================================================================================================================

let day = null, dayInfo = null;
const HOURS = [{ key: "back", label: "חוזרים", cls: "s-ios" }, { key: "new", label: "חדשים (התקינו באותו יום)", cls: "s-new" }];

function drawDay(d) {
  dayInfo = d;
  day = d.day;
  const t = d.totals;
  $("page-title").textContent = d.is_today ? "שיחקו היום" : `שיחקו ב${longDate(d.day)}`;
  document.title = `${$("page-title").textContent} — FUTCHY`;
  const pick = $("day");
  pick.min = d.min_day; pick.max = d.today; pick.value = d.day;
  $("next").disabled = d.day >= d.today; $("prev").disabled = d.day <= d.min_day; $("to-today").hidden = d.is_today;
  const sess = clock(t.avg_session_seconds), per = clock(t.avg_player_seconds);
  const peak = d.hours.reduce((a, b) => (b.players > (a?.players ?? -1) ? b : a), null);
  $("tiles").replaceChildren(
    tile(d.is_today ? "שיחקו היום" : "שיחקו ביום הזה", num(t.players), `${num(t.signed_in)} מחוברים לחשבון`, { accent: true, live: d.is_today }),
    tile("חדשים", num(t.new), `${pct(share(t.new, t.players))} מהשחקנים · התקינו באותו יום`, { meter: share(t.new, t.players) }),
    tile("חוזרים", num(t.returning), `${pct(share(t.returning, t.players))} מהשחקנים`, { meter: share(t.returning, t.players) }),
    tile("כניסות למשחק", num(t.sessions), t.players ? `${(t.sessions / t.players).toLocaleString("he-IL", { maximumFractionDigits: 1 })} לשחקן` : null),
    tile("כניסה ממוצעת", sess[0], `${sess[1]} · מפתיחה עד יציאה`),
    tile("זמן משחק לשחקן", per[0], `${per[1]} ביום, בממוצע`),
    tile("סך כל זמן המשחק", hours(t.total_play_seconds), `שעות · ${num(t.events)} פעולות נרשמו`),
    tile("שעת השיא", peak && peak.players ? `${String(peak.hour).padStart(2, "0")}:00` : "–", peak && peak.players ? `${num(peak.players)} שחקנים באותה שעה` : null));

  const nowHour = d.is_today ? new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })).getHours() : 24;
  const rows = d.hours.map(h => ({ ...h, back: h.players - h.new }));
  $("hours-sub").textContent = `שעון ישראל · ${num(t.players)} שחקנים ביום · שחקן שהיה בכמה שעות נספר בכל אחת`;
  legend($("legend"), HOURS);
  stacked($("hours"), rows, HOURS, {
    aria: "שחקנים בכל שעה", height: 230, every: 3, label: (r) => `${String(r.hour).padStart(2, "0")}:00`,
    ghost: (r) => r.hour > nowHour, mark: (r) => peak && r.hour === peak.hour && r.players > 0,
    tip: (r) => [`${String(r.hour).padStart(2, "0")}:00–${String(r.hour).padStart(2, "0")}:59`, `${num(r.players)} שחקנים`,
                 `${num(r.new)} חדשים · ${num(r.back)} חוזרים`, `${num(r.sessions)} כניסות למשחק`],
  });
  drawDayTables(d);
}

function drawDayTables(d) {
  // modes: started (mode_start) beside finished (circle_end / match_end / online_end), one row each
  const modes = new Map();
  const row = (k, label) => modes.get(k) || modes.set(k, { k, label, starts: 0, plays: 0, players: 0, avg: null, wins: null }).get(k);
  for (const m of d.mode_starts) { const r = row(`${m.mode}|${m.mode === "footvolley" ? m.venue : ""}`, L.mode(m.mode, m.venue)); r.starts += m.starts; r.players = Math.max(r.players, m.players); }
  for (const m of d.mode_ends) {
    const k = m.event === "circle_end" ? "circle|" : m.event === "match_end" ? `footvolley|${m.venue}` : `online|`;
    const r = row(k, L.ended(m.event, m.venue));
    r.plays += m.plays; r.players = Math.max(r.players, m.players); r.avg = m.avg_seconds; r.wins = m.event === "circle_end" ? null : m.wins;
  }
  const coins = d.coins || {};
  const econ = el("article", "card");
  econ.append(el("h2", null, "הכסף של המשחק"), el("p", "sub", "כסף שהרוויחו וכסף שהוציאו בחנויות, באותו יום"));
  const kv = el("div", "kv");
  for (const [k, v, cls] of [["הרוויחו", num(coins.earned), "kv__v--in"], ["הוציאו", num(coins.spent), "kv__v--out"], ["שחקנים קנו משהו", num(coins.spenders), ""]]) {
    const c = el("div", "kv__c"); c.append(el("div", `kv__v ${cls}`, v), el("div", "kv__k", k)); kv.append(c);
  }
  econ.append(kv);
  $("tables").replaceChildren(
    table("מה שיחקו", "התחילו מול סיימו · משך ממוצע של משחק שהסתיים", [
      { label: "מצב", get: r => r.label },
      { label: "התחילו", get: r => r.starts, num: true, bar: true },
      { label: "סיימו", get: r => r.plays, num: true },
      { label: "שחקנים", get: r => r.players, num: true, wideOnly: true },
      { label: "משך", get: r => r.avg, fmt: duration, num: true },
      { label: "ניצחונות", short: "ניצ׳", get: r => r.wins, num: true }], [...modes.values()].sort((a, b) => (b.starts + b.plays) - (a.starts + a.plays)), { wide: true }),
    table("מדינות", "לפי הגדרת האזור בטלפון", [
      { label: "מדינה", get: r => countryName(r.country) },
      { label: "שחקנים", get: r => r.players, num: true, bar: true },
      { label: "חדשים", get: r => r.new, num: true },
      { label: "מחוברים", get: r => share(r.signed_in, r.players), fmt: pct, num: true }], d.countries),
    table("סוג טלפון", null, [
      { label: "סוג", get: r => L.platform(r.value), raw: r => r.value },
      { label: "שחקנים", get: r => r.players, num: true, bar: true },
      { label: "חדשים", get: r => r.new, num: true }], d.platforms),
    table("גרסאות", null, [
      { label: "גרסה", get: r => version(r.app_version, r.build_number) },
      { label: "שחקנים", get: r => r.players, num: true, bar: true }], d.versions),
    table("מאיפה הורידו", "חנות, בדיקה (TestFlight) או פיתוח", [
      { label: "", get: r => L.env(r.value) },
      { label: "שחקנים", get: r => r.players, num: true, bar: true }], d.envs),
    table("מסכים", null, [
      { label: "מסך", get: r => L.screen(r.screen), raw: r => r.screen },
      { label: "כניסות", get: r => r.views, num: true, bar: true },
      { label: "שחקנים", get: r => r.players, num: true }], d.screens),
    table("חנויות", null, [
      { label: "חנות", get: r => L.shop(r.shop), raw: r => r.shop },
      { label: "כניסות", get: r => r.opens, num: true, bar: true },
      { label: "שחקנים", get: r => r.players, num: true }], d.shops),
    table("הישגים", null, [
      { label: "", get: r => L.progress(r.type), raw: r => r.type },
      { label: "פעמים", get: r => r.times, num: true, bar: true },
      { label: "שחקנים", get: r => r.players, num: true }], d.progress),
    econ,
    table("מה עשו במשחק", "הפעולות הנפוצות באותו יום", [
      { label: "פעולה", get: r => L.event(r.event), raw: r => r.event },
      { label: "פעמים", get: r => r.events, num: true, bar: true },
      { label: "שחקנים", get: r => r.players, num: true }], d.top_events, { wide: true }));
}

function goDay(target) {
  if (!target) return;
  if (dayInfo) target = target < dayInfo.min_day ? dayInfo.min_day : target > dayInfo.today ? dayInfo.today : target;
  history.replaceState(null, "", `${location.pathname}${location.search}${target === dayInfo?.today ? "" : `#day=${target}`}`);
  load("admin_played_day", { p_day: target }, drawDay);
}

// ================================================================================================================
// /admin/live
// ================================================================================================================

let live = null;
const MINUTES = [{ key: "players", label: "מחוברים", cls: "s-ios" }];

function drawLive(d) {
  live = d;
  const t = d.totals;
  const med = clock(t.median_session_seconds), avg = clock(t.avg_session_seconds);
  $("tiles").replaceChildren(
    tile("מחוברים עכשיו", num(t.connected), `שלחו משהו מהמשחק ב-${num(d.window_minutes)} הדקות האחרונות`, { accent: true, live: true }),
    tile("משחקים עכשיו", num(t.playing), "במסך המשחק ב-3 הדקות האחרונות", { meter: share(t.playing, t.connected) }),
    tile("באמצע משחק", num(t.in_game), `${num(t.online)} מהם באונליין · חוף, מעגלים, פוצ׳יוולי`, { meter: share(t.in_game, t.connected) }),
    tile("חדשים היום", num(t.new), `${pct(share(t.new, t.connected))} מהמחוברים · ${num(t.returning)} חוזרים`, { meter: share(t.new, t.connected) }),
    tile("מחוברים לחשבון", pct(share(t.signed_in, t.connected)), `${num(t.signed_in)} מתוך ${num(t.connected)}`, { meter: share(t.signed_in, t.connected) }),
    tile("כמה זמן בפנים", med[0], `${med[1]} · חציון הכניסה הנוכחית · ממוצע ${avg[0]} ${avg[1]}`,
         { hint: `מתחילת הכניסה הנוכחית למשחק (ידוע ל-${num(t.sessions_known)} מהמחוברים)` }));

  const rows = d.minutes.map(m => ({ ...m, label: m.minutes_ago === 0 ? "עכשיו" : `לפני ${m.minutes_ago}` }));
  stacked($("minutes"), rows, MINUTES, {
    aria: "מחוברים בכל דקה", height: 170, every: 1, label: (r) => r.minutes_ago === 0 ? "עכשיו" : `-${r.minutes_ago}`,
    mark: (r) => r.minutes_ago === 0,
    tip: (r) => [r.minutes_ago === 0 ? "הדקה הנוכחית" : `לפני ${r.minutes_ago} דקות`, `${num(r.players)} מחוברים`],
  });

  const os = L.groupBy(d.os, r => L.os(r.value), ["players"]).sort((a, b) => b.players - a.players);
  const rawOf = (r) => r.raws.length === 1 ? r.raws[0].value : `${r.raws.length} גרסאות: ${r.raws.slice(0, 3).map(x => x.value).join(", ")}${r.raws.length > 3 ? "…" : ""}`;
  const known = d.session_lengths.filter(b => b.bucket !== "unknown" || b.players > 0);
  $("tables").replaceChildren(
    table("מה עושים עכשיו", "לפי האירועים האחרונים של כל שחקן · משך = מתחילת הכניסה הנוכחית", [
      { label: "פעילות", get: r => L.activity(r.activity, r.detail), raw: r => r.detail || null },
      { label: "שחקנים", get: r => r.players, num: true, bar: true },
      { label: "במסך המשחק", short: "במשחק", get: r => r.playing, num: true, wideOnly: true },
      { label: "חדשים", get: r => r.new, num: true, wideOnly: true },
      { label: "בפנים", get: r => r.avg_session_seconds, fmt: duration, num: true }], d.activities, { wide: true, empty: "אף אחד לא מחובר עכשיו." }),
    table("כמה זמן בפנים", "מתחילת הכניסה הנוכחית למשחק", [
      { label: "", get: r => L.sessionBucket(r.bucket) },
      { label: "שחקנים", get: r => r.players, num: true, bar: true }], known, { empty: "אף אחד לא מחובר עכשיו." }),
    table("מדינות", "לפי הגדרת האזור בטלפון", [
      { label: "מדינה", get: r => countryName(r.country), raw: r => r.country === "?" ? null : r.country },
      { label: "מחוברים", get: r => r.players, num: true, bar: true },
      { label: "במשחק", get: r => r.playing, num: true, wideOnly: true },
      { label: "חדשים", get: r => r.new, num: true },
      { label: "חשבון", get: r => share(r.signed_in, r.players), fmt: pct, num: true }], d.countries, { empty: "אף אחד לא מחובר עכשיו." }),
    table("סוג טלפון", null, [
      { label: "סוג", get: r => L.platform(r.value), raw: r => r.value },
      { label: "מחוברים", get: r => r.players, num: true, bar: true },
      { label: "חדשים", get: r => r.new, num: true }], d.platforms, { empty: "אף אחד לא מחובר עכשיו." }),
    table("גרסת מערכת", null, [
      { label: "מערכת", get: r => r.label, raw: rawOf },
      { label: "מחוברים", get: r => r.players, num: true, bar: true }], os, { empty: "אף אחד לא מחובר עכשיו." }),
    table("מכשירים", null, [
      { label: "דגם", get: r => L.device(r.value), raw: r => r.value },
      { label: "מחוברים", get: r => r.players, num: true, bar: true }], d.devices, { empty: "אף אחד לא מחובר עכשיו." }),
    table("גרסאות", "גרסה ובילד, כפי שהמשחק דיווח עכשיו", [
      { label: "גרסה", get: r => version(r.app_version, r.build_number) },
      { label: "מחוברים", get: r => r.players, num: true, bar: true }], d.versions, { empty: "אף אחד לא מחובר עכשיו." }),
    table("מאיפה הורידו", "חנות, בדיקה (TestFlight) או פיתוח", [
      { label: "", get: r => L.env(r.value) },
      { label: "מחוברים", get: r => r.players, num: true, bar: true }], d.envs, { empty: "אף אחד לא מחובר עכשיו." }));
}

let resizeTimer;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (PAGE === "installs" && inst) drawDaily(); else if (PAGE === "live" && live) drawLive(live); else if (dayInfo) drawDay(dayInfo); }, 150);
});

// ---- start ------------------------------------------------------------------------------------------------------

(async () => {
  if (DEMO) $("back").search = "?demo";
  if (!DEMO && !stored()) { gate(""); return; }
  if (PAGE === "installs") {
    for (const b of document.querySelectorAll("[data-days]")) {
      b.addEventListener("click", () => {
        days = +b.dataset.days;
        for (const o of document.querySelectorAll("[data-days]")) o.setAttribute("aria-pressed", String(o === b));
        load("admin_installs", { p_days: days }, drawInstalls);
      });
    }
    await load("admin_installs", { p_days: days }, drawInstalls);
  } else if (PAGE === "live") {
    // every 30 seconds while the page is in front; at once when it comes back to the front
    const refresh = () => { if (document.visibilityState === "visible") load("admin_live_now", {}, drawLive, true); };
    setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    await load("admin_live_now", {}, drawLive);
  } else {
    $("prev").addEventListener("click", () => day && goDay(addDays(day, -1)));
    $("next").addEventListener("click", () => day && goDay(addDays(day, 1)));
    $("to-today").addEventListener("click", () => dayInfo && goDay(dayInfo.today));
    $("day").addEventListener("change", (e) => goDay(e.target.value));
    const m = /day=(\d{4}-\d{2}-\d{2})/.exec(location.hash);
    await load("admin_played_day", m ? { p_day: m[1] } : {}, drawDay);
  }
})();
