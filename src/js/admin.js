// FUTCHY's private dashboard (futchy.co/admin). Signs in with Google through Supabase (OAuth + PKCE, no
// library - the shared admin-auth.js), then asks the server for public.admin_dashboard - which answers only for the
// two owners' verified emails (analytics.admins). The key is the project's PUBLIC anon key: it lets nobody read anything.
// Everything from the server is written as text (textContent), never as HTML.
const { BACKEND, ANON, KEY, stored, token } = window.FutchyAuth;
const L = window.FutchyLabels;   // every raw id in the game's own Hebrew (admin-labels.js) - one map for all the admin pages

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat("he-IL");
const num = (v) => (v === null || v === undefined || Number.isNaN(+v)) ? "–" : nf.format(Math.round(+v));
const pct = (v) => (v === null || v === undefined) ? "–" : `${(+v).toLocaleString("he-IL", { maximumFractionDigits: 1 })}%`;

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
const hebrew = (t) => /[\u0590-\u05FF]/.test(t);

const STEPS = { first_launch: "התקנה ראשונה", sign_in_shown: "ראו את מסך ההתחברות", sign_in_success: "התחברו",
  username_created: "בחרו שם משתמש", mode_start: "התחילו לשחק", match_end: "סיימו משחק פוצ׳יוולי",
  coins_spent: "קנו בכסף של המשחק", iap_succeeded: "קנו בכסף אמיתי (כולל בדיקות)" };
const ADS = { ad_requested: "ביקשו פרסומת", ad_unavailable: "לא הייתה פרסומת", ad_completed: "צפו עד הסוף",
  ad_not_completed: "סגרו לפני הסוף", ad_failed: "הפרסומת נכשלה", double_coins_paid: "הכפילו את הכסף בפרסומת" };
// ₪ with agorot (4.90); a pack by its name in the game's store (com.Maagalim.MaagalimBeach.coins2500 -> 2,500 כסף).
const ils = (v) => (v === null || v === undefined || Number.isNaN(+v)) ? "–" : `₪${(+v).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pack = (p) => L.product(p).name;
const country = (c) => `${L.flag(c)} ${L.country(c)}`.trim();

// ---- Sign-in (shared: admin-auth.js) -------------------------------------------------------------------------

const signIn = () => window.FutchyAuth.signIn();

// Back from Google: a failure shows on the gate; a sign-in started on /admin/multiplayer goes back there.
async function finishSignIn() {
  const r = await window.FutchyAuth.finishSignIn();
  if (r.error) gate(`ההתחברות לא הצליחה: ${r.error}`);
  return r;
}

function signOut() {
  window.FutchyAuth.signOut();
  gate("");
}

function gate(note) {
  clearInterval(timer);
  $("board").hidden = true; $("tools").hidden = true; $("gate").hidden = false;
  $("gate-note").textContent = note || "";
  $("status").textContent = "";
}

// ---- Data ----------------------------------------------------------------------------------------------------

let days = 7, timer = 0, loading = false, retried = false;

async function load() {
  if (loading) return;
  loading = true;
  try {
    const t = await token();
    if (!t) { gate(""); return; }
    const r = await fetch(`${BACKEND}/rest/v1/rpc/admin_dashboard`, {
      method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_days: days }) });
    const j = await r.json().catch(() => null);
    if (r.status === 401 || r.status === 403 || (j && /forbidden/.test(j.message || ""))) {
      const who = stored()?.email || "";
      localStorage.removeItem(KEY);
      gate(`לחשבון ${who} אין גישה ללוח הזה.`);
      return;
    }
    if (!r.ok || !j) throw new Error(j?.message || `שגיאה ${r.status}`);
    $("gate").hidden = true; $("board").hidden = false; $("tools").hidden = false;
    render(j);
    $("status").textContent = "";
    $("stamp").textContent = `עודכן ${new Date(j.generated_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
    retried = false;
  } catch (e) {
    // A timeout from a cold server cache: the first try warms it, so a second one a few seconds later loads.
    if (!retried && /timeout/i.test(e.message || "")) {
      retried = true;
      $("status").textContent = "טוענים…";
      setTimeout(load, 3000);
    } else {
      retried = false;
      $("status").textContent = `לא הצלחנו לטעון: ${e.message}. מנסים שוב בעוד דקה.`;
    }
  } finally { loading = false; }
}

// ---- Drawing ------------------------------------------------------------------------------------------------

function tile(label, value, sub, opts = {}) {
  const t = el(opts.href ? "a" : "div", "tile" + (opts.live ? " tile--live" : "") + (opts.warn ? " tile--warn" : "") + (opts.href ? " tile--link" : ""));
  if (opts.href) { t.href = opts.href + (demoMode ? "?demo" : ""); t.append(el("span", "tile__go", "לפירוט ←")); }
  const head = el("div", "tile__label");
  if (opts.live) head.append(el("span", "pulse"));
  head.append(document.createTextNode(label));
  const v = el("div", "tile__value", value);
  if (hebrew(String(value))) v.dir = "rtl";
  t.append(head, v);
  if (sub) t.append(el("div", "tile__sub", sub));
  if (opts.hint) t.title = opts.hint;
  return t;
}

// One tile, three small numbers side by side (DAU / WAU / MAU).
function trio(label, parts) {
  const t = el("div", "tile tile--trio");
  t.append(el("div", "tile__label", label));
  const row = el("div", "trio");
  for (const [name, v] of parts) {
    const c = el("div", "trio__cell");
    c.append(el("div", "trio__v", num(v)), el("div", "trio__k", name));
    row.append(c);
  }
  t.append(row);
  return t;
}

function renderTiles(d) {
  const o = d.overview || {}, u = d.unfinished || {}, iap = d.iap || {};
  const real = iap.real, all = iap.real_all_time || {};
  const cut = u.sessions ? 100 * u.unfinished / u.sessions : null;
  const box = $("tiles");
  box.replaceChildren(
    tile("משחקים עכשיו", num(d.playing_now), `${num(o.live_5m)} פעילים ב-5 הדקות האחרונות`, { live: true }),
    tile("התקנות", num(o.installs_total), `${num(o.new_today)} חדשות היום`, { href: "/admin/installs" }),
    tile("פעילים היום", num(o.today), `${num(o.sessions_today)} סשנים היום`, { href: "/admin/today" }),
    trio("שחקנים פעילים", [["יום", o.dau], ["שבוע", o.wau], ["חודש", o.mau]]),
    tile("סשן ממוצע", duration(d.avg_session_seconds), "מפתיחה עד יציאה לרקע"),
    tile("זמן משחק ביום", duration(d.avg_daily_seconds_per_player), "ממוצע לשחקן ביום שבו שיחק"),
    tile("חשבונות", num(d.accounts), `${num(d.usernames)} עם שם משתמש · ${num(o.signed_in_mau)} פעילים החודש`),
    tile("סשנים שנקטעו", cut === null ? "–" : pct(cut), `${num(u.unfinished)} מתוך ${num(u.sessions)} · ${num(u.installs_affected)} מכשירים`,
         { warn: cut !== null && cut > 5, hint: "סשנים בלי סיום רגיל: קריסה, או שהמערכת סגרה את המשחק. אין דוח קריסות מלא." }),
    tile("שגיאות", num(d.errors_total), "שגיאות שהמשחק רשם בתקופה"),
    real
      ? tile("קניות בכסף אמיתי", num(real.count), `${ils(real.ils)} בתקופה · ${num(all.count)} מאז ההשקה (${ils(all.ils)})`,
             { hint: "קניות אמיתיות מהחנות שהשרת שלנו בדק: בלי קניות בדיקה, בלי כסף שהוחזר, כל קנייה פעם אחת." })
      : tile("קניות בכסף אמיתי", "–", "ממתין לעדכון השרת")
  );
}

const SVGNS = "http://www.w3.org/2000/svg";
function svg(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }

function renderDaily(rows) {
  const box = $("daily");
  box.replaceChildren();
  if (!rows?.length) { box.append(el("p", "empty", "אין עדיין נתונים.")); return; }
  const W = 720, H = 220, top = 16, bottom = 26, left = 8, right = 36;
  const max = Math.max(1, ...rows.map(r => +r.actives || 0)) * 1.08;   // a little headroom over the tallest
  const step = (W - left - right) / rows.length, bw = Math.max(2, step - 2);
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "פעילים בכל יום, 30 הימים האחרונים" });
  const y = (v) => top + (H - top - bottom) * (1 - v / max);
  for (const f of [0, 0.5, 1]) {
    s.append(svg("line", { x1: left, x2: W - right, y1: y(max * f), y2: y(max * f), class: "gridline" }));
    const lab = svg("text", { x: W - right + 6, y: y(max * f) + 4, class: "axis", "text-anchor": "start" });
    lab.textContent = num(max * f);
    s.append(lab);
  }
  const tip = el("div", "tip"); tip.hidden = true;
  rows.forEach((r, i) => {
    const v = +r.actives || 0, x = left + i * step + 1;
    const h = Math.max(v ? 3 : 0, (H - top - bottom) * v / max);
    const bar = svg("rect", { x, y: H - bottom - h, width: bw, height: h, rx: Math.min(4, bw / 2), class: i === rows.length - 1 ? "bar bar--today" : "bar" });
    const hit = svg("rect", { x: left + i * step, y: top, width: step, height: H - top - bottom, class: "hit" });
    const date = new Date(r.day + "T00:00:00");
    const show = () => {
      tip.replaceChildren(
        el("strong", null, date.toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "numeric" })),
        el("span", null, `${num(v)} פעילים`), el("span", null, `${num(r.new_installs)} התקנות חדשות`),
        el("span", null, `${num(r.sessions)} סשנים · ממוצע ${duration(r.avg_session_seconds)}`));
      tip.hidden = false;
      const bx = box.getBoundingClientRect(), hx = hit.getBoundingClientRect();
      tip.style.left = `${Math.min(bx.width - 180, Math.max(0, hx.left - bx.left + hx.width / 2 - 90))}px`;
      bar.classList.add("bar--on");
    };
    const hide = () => { tip.hidden = true; bar.classList.remove("bar--on"); };
    hit.addEventListener("pointerenter", show); hit.addEventListener("pointerleave", hide);
    hit.addEventListener("pointerdown", show);
    s.append(bar, hit);
    if (i % 5 === 0 || i === rows.length - 1) {
      const t = svg("text", { x: x + bw / 2, y: H - 8, class: "axis", "text-anchor": "middle" });
      t.textContent = date.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
      s.append(t);
    }
  });
  box.append(s, tip);
}

// A table: columns {label, get, fmt, bar}. The "bar" column draws a thin share of the largest value behind it.
function table(title, sub, cols, rows, empty = "אין עדיין נתונים.") {
  const card = el("article", "card");
  card.append(el("h2", null, title));
  if (sub) card.append(el("p", "sub", sub));
  if (!rows?.length) { card.append(el("p", "empty", empty)); return card; }
  const t = el("table");
  const head = el("tr");
  for (const c of cols) { const th = el("th", c.num ? "n" : null, c.label); if (c.short) th.dataset.short = c.short; head.append(th); }
  const thead = el("thead"); thead.append(head); t.append(thead);
  const body = el("tbody");
  const maxes = cols.map(c => c.bar ? Math.max(1, ...rows.map(r => +c.get(r) || 0)) : 0);
  for (const r of rows) {
    const tr = el("tr");
    cols.forEach((c, i) => {
      const v = c.get(r);
      const td = el("td", c.num ? "n" : null);
      if (c.bar) {
        if (+v > 0) {
          const meter = el("span", "meter");
          meter.style.setProperty("--w", `${Math.round(100 * (+v || 0) / maxes[i])}%`);
          td.append(meter);
        }
        td.append(el("span", "meter__v", (c.fmt || num)(v)));
        td.classList.add("has-meter");
      } else td.textContent = (c.fmt || (c.num ? num : ((x) => x ?? "–")))(v);
      // the raw id, small, under its name (and in the tooltip) - only where it says something the name does not
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

// Real money: one row per App Store transaction the server verified (public.iap_transactions, Production, not
// refunded) - never the apps' own reports, which repeat after a reinstall and include TestFlight. Test purchases
// (TestFlight / Sandbox) do not appear at all (Chen); refunds are a separate line.
function purchases(iap, per) {
  if (!iap.real) {   // a server before 20261113100000_purchase_alerts: the apps' reports mix in tests - nothing shown
    const c = table("קניות בכסף אמיתי", per, [], [], "ממתין לעדכון השרת.");
    c.id = "purchases";
    return c;
  }
  const r = iap.real, f = iap.refunded || {}, all = iap.real_all_time || {};
  const card = table("קניות בכסף אמיתי", `${per} · קניות אמיתיות מהחנות, בלי קניות בדיקה`, [
    { label: "מה קנו", get: x => pack(x.product), raw: x => x.product },
    { label: "קניות", get: x => x.count, num: true, bar: true },
    { label: "שולם", get: x => x.ils, fmt: ils, num: true }], r.by_product, "אין קניות בכסף אמיתי בתקופה.");
  card.id = "purchases";
  card.classList.add("purchases", "wide");
  const sum = el("div", "buy-sum");
  sum.append(el("span", "buy-sum__v", ils(r.ils)),
             el("span", null, `${num(r.count)} קניות · ${num(r.buyers)} קונים`),
             el("span", "buy-sum__all", `מאז ההשקה: ${num(all.count)} קניות, ${ils(all.ils)}`));
  card.querySelector(".sub").after(sum);
  if (r.ils_unknown > 0) card.append(el("p", "buy-note", `${num(r.ils_unknown)} קניות בלי סכום ידוע (החנות לא שלחה מחיר) - לא נכללו בסכום.`));
  if (r.recent?.length) {
    card.append(el("h3", null, "אחרונות"));
    const ul = el("ul", "buys");
    for (const x of r.recent) {
      const li = el("li");
      const paid = x.currency && x.currency !== "ILS" && x.price !== null ? `\u2066${(+x.price).toFixed(2)} ${x.currency}\u2069` : ils(x.ils);
      li.title = x.product || "";
      li.append(el("span", "buys__who", x.username || "(אין שם משתמש)"),
                el("span", "buys__what", `${pack(x.product)} · ${paid}${x.storefront && x.storefront !== "ISR" ? ` · ${L.country(x.storefront)}` : ""}`),
                el("span", "buys__at", new Date(x.at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })));
      ul.append(li);
    }
    card.append(ul);
  }
  if (f.count > 0) card.append(el("p", "buy-note buy-note--warn", `כסף שהוחזר לקונים בתקופה: ${num(f.count)} קניות (${ils(f.ils)}) - לא נספרו למעלה.`));
  return card;
}

function renderTables(d) {
  const per = days === 1 ? "היום האחרון" : `${days} הימים האחרונים`;
  const modes = (d.modes || []).filter(m => m.event !== "mode_start");
  const started = Object.fromEntries((d.modes || []).filter(m => m.event === "mode_start").map(m => [m.mode, m.plays]));
  const ads = Object.entries(d.ads || {}).map(([k, n]) => ({ k, n }));
  const ret = (d.retention || []).filter(r => r.installs > 0).slice(0, 14);
  const econ = L.groupBy((d.economy || []).filter(e => e.direction === "in"), r => L.source(r.source), ["coins", "events"])
    .sort((a, b) => b.coins - a.coins);
  const items = L.groupBy(d.items, r => L.item(r.item), ["purchases", "coins"]).sort((a, b) => b.purchases - a.purchases);
  const rawOf = (r, k) => r.raws.length === 1 ? r.raws[0][k] : `${r.raws.length} מזהים: ${r.raws.slice(0, 3).map(x => x[k]).join(", ")}${r.raws.length > 3 ? "…" : ""}`;
  const os = L.groupBy(d.os, r => L.os(r.value), ["installs"]).sort((a, b) => b.installs - a.installs);
  $("tables").replaceChildren(
    table("מצבי משחק", per, [
      { label: "מצב", get: r => L.mode(r.mode) },
      { label: "התחילו", short: "התחילו", get: r => started[r.mode], num: true },
      { label: "סיימו", get: r => r.plays, num: true, bar: true },
      { label: "שחקנים", short: "שחקנים", get: r => r.installs, num: true },
      { label: "משך ממוצע", short: "משך", get: r => r.avg_seconds, fmt: duration, num: true },
      { label: "ניצחונות", short: "ניצ׳", get: r => r.mode === "footvolley" ? r.wins : null, num: true }], modes),
    table("משפך", `מהתקנות של ${per}: כמה הגיעו לכל שלב`, [
      { label: "שלב", get: r => STEPS[r.event] || L.event(r.event), raw: r => r.event },
      { label: "התקנות", get: r => r.installs, num: true, bar: true }], d.funnel),
    table("שימור", "מכל יום התקנה: כמה חזרו אחרי יום, שבוע וחודש", [
      { label: "יום התקנה", get: r => new Date(r.cohort + "T00:00:00").toLocaleDateString("he-IL", { day: "numeric", month: "numeric" }) },
      { label: "התקנות", get: r => r.installs, num: true },
      { label: "יום 1", get: r => r.d1, fmt: pct, num: true },
      { label: "יום 7", get: r => r.d7, fmt: pct, num: true },
      { label: "יום 30", get: r => r.d30, fmt: pct, num: true }], ret),
    table("מאיפה מגיע הכסף במשחק", per, [
      { label: "מקור", get: r => r.label, raw: r => rawOf(r, "source") },
      { label: "כסף", get: r => r.coins, num: true, bar: true },
      { label: "פעמים", get: r => r.events, num: true }], econ),
    table("מה קונים בכסף של המשחק", per, [
      { label: "פריט", get: r => r.label, raw: r => rawOf(r, "item") },
      { label: "קניות", get: r => r.purchases, num: true, bar: true },
      { label: "כסף", get: r => r.coins, num: true }], items),
    purchases(d.iap || {}, per),
    table("פרסומות", per, [
      { label: "", get: r => ADS[r.k] || L.event(r.k), raw: r => r.k },
      { label: "פעמים", get: r => r.n, num: true, bar: true }], ads),
    table("מדינות", "לפי הגדרת האזור במכשיר", [
      { label: "מדינה", get: r => country(r.value) },
      { label: "התקנות", get: r => r.installs, num: true, bar: true }], d.countries),
    table("מכשירים", null, [
      { label: "דגם", get: r => L.device(r.value), raw: r => r.value },
      { label: "התקנות", get: r => r.installs, num: true, bar: true }], d.devices),
    table("גרסת מערכת", null, [
      { label: "מערכת", get: r => r.label, raw: r => rawOf(r, "value") },
      { label: "התקנות", get: r => r.installs, num: true, bar: true }], os),
    table("גרסאות המשחק", null, [
      { label: "גרסה", get: r => r.value === "?" ? "לא ידוע" : r.value },
      { label: "התקנות", get: r => r.installs, num: true, bar: true }], d.versions),
    table("מסכים", per, [
      { label: "מסך", get: r => L.screen(r.screen), raw: r => r.screen },
      { label: "צפיות", get: r => r.views, num: true, bar: true },
      { label: "שחקנים", get: r => r.installs, num: true }], d.screens),
    table("חנויות", per, [
      { label: "חנות", get: r => L.shop(r.shop), raw: r => r.shop },
      { label: "כניסות", get: r => r.opens, num: true, bar: true },
      { label: "שחקנים", get: r => r.installs, num: true }], d.shops),
    table("שגיאות נפוצות", per, [
      { label: "הודעה", get: r => r.message },
      { label: "פעמים", get: r => r.events, num: true, bar: true },
      { label: "מכשירים", get: r => r.installs, num: true }], d.errors, "אין שגיאות. 🎉"),
    table("סוג התקנה", "שחקנים, מול הטלפונים של הצוות (גרסת פיתוח)", [
      { label: "סוג", get: r => L.platform(r.value), raw: r => r.value },
      { label: "התקנות", get: r => r.installs, num: true, bar: true }], d.platforms)
  );
  // The wide cards: many columns, or long words.
  for (const c of $("tables").children) if (c.querySelectorAll("th").length > 4 || /שגיאות נפוצות/.test(c.textContent)) c.classList.add("wide");
  // long free text (error messages) may wrap; every other name column stays on one line (styles: .wraps)
  for (const c of $("tables").children) if (/שגיאות נפוצות/.test(c.querySelector("h2")?.textContent || "")) c.classList.add("wraps");
}

let jumped = false;
function render(d) {
  renderTiles(d);
  renderDaily(d.daily);
  renderTables(d);
  // the purchase emails link to /admin#purchases: scroll there once
  if (!jumped && location.hash === "#purchases") { jumped = true; setTimeout(() => $("purchases")?.scrollIntoView({ block: "start" }), 60); }
}

// ---- Start ---------------------------------------------------------------------------------------------------

$("signin").addEventListener("click", () => signIn().catch(e => gate(e.message)));
$("signout").addEventListener("click", signOut);
for (const b of document.querySelectorAll("[data-days]")) {
  b.addEventListener("click", () => {
    days = +b.dataset.days;
    for (const o of document.querySelectorAll("[data-days]")) o.setAttribute("aria-pressed", String(o === b));
    load();
  });
}

const demoMode = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has("demo");

// Made-up numbers to see the page full, on the local preview only (localhost/admin?demo) - never on futchy.co.
function demo() {
  const r = (a, b) => Math.round(a + Math.random() * (b - a));
  const today = new Date();
  const daily = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - 29 + i);
    const a = Math.round(120 + i * 9 + Math.sin(i / 2) * 25 + (d.getDay() >= 5 ? 40 : 0));
    return { day: d.toISOString().slice(0, 10), actives: a, new_installs: r(15, 60), sessions: a * 2, avg_session_seconds: r(380, 640) };
  });
  return {
    generated_at: new Date().toISOString(), days,
    overview: { live_5m: 43, today: 388, new_today: 52, dau: 401, wau: 1290, mau: 2841, signed_in_mau: 1630, sessions_today: 812, installs_total: 3904 },
    playing_now: 27, avg_session_seconds: 512, avg_daily_seconds_per_player: 1460, accounts: 2210, usernames: 1984,
    unfinished: { sessions: 5120, unfinished: 61, installs_affected: 44 }, errors_total: 37,
    daily,
    retention: Array.from({ length: 10 }, (_, i) => ({ cohort: daily[28 - i].day, installs: r(30, 70), d1: r(32, 48), d7: i > 6 ? r(12, 20) : 0, d30: 0 })),
    modes: [{ event: "mode_start", mode: "circle", plays: 2400 }, { event: "mode_start", mode: "footvolley", plays: 1300 },
            { event: "circle_end", mode: "circle", plays: 2210, installs: 980, avg_seconds: 214, wins: 0 },
            { event: "match_end", mode: "footvolley", plays: 1102, installs: 640, avg_seconds: 377, wins: 590 }],
    funnel: [["first_launch", 520], ["sign_in_shown", 515], ["sign_in_success", 330], ["username_created", 301],
             ["mode_start", 470], ["match_end", 260], ["coins_spent", 190], ["iap_succeeded", 21]].map(([event, installs], i) => ({ step: i + 1, event, installs })),
    economy: [{ direction: "in", source: "league.s1.r3", events: 700, coins: 96000 }, { direction: "in", source: "league.s1.r4", events: 500, coins: 64000 },
              { direction: "in", source: "circle.session", events: 2100, coins: 98000 },
              { direction: "in", source: "challenge.claim", events: 640, coins: 71000 }, { direction: "in", source: "mission.daily_circles", events: 210, coins: 52000 },
              { direction: "in", source: "iap.apple.2000000812345678", events: 18, coins: 41000 }, { direction: "in", source: "store.daily.20261123", events: 330, coins: 33000 },
              { direction: "in", source: "league.o412-3fa9c1d2.adx2", events: 190, coins: 21000 }, { direction: "in", source: "worldcup.y1.r2.win", events: 60, coins: 18000 }],
    items: [{ item: "BALL_SandyIsrael", purchases: 88, coins: 264000 }, { item: "TORSO_MG22", purchases: 71, coins: 17750 },
            { item: "skill_hip_ginga", purchases: 40, coins: 200000 }, { item: "BALL_WhiteRed", purchases: 33, coins: 19800 }],
    iap: { started: 64, failed: 9, buyers: 21, actives: 1290, succeeded: { "com.Maagalim.MaagalimBeach.coins2500": 13, "com.Maagalim.MaagalimBeach.coins6000": 7, "com.Maagalim.MaagalimBeach.coins15000": 3 },
           real: { count: 18, buyers: 15, coins: 112500, ils: 189.2, ils_unknown: 0, last_at: new Date().toISOString(),
                   by_product: [{ product: "com.Maagalim.MaagalimBeach.coins2500", count: 11, coins: 27500, ils: 53.9 },
                                { product: "com.Maagalim.MaagalimBeach.coins6000", count: 5, coins: 30000, ils: 49.5 },
                                { product: "com.Maagalim.MaagalimBeach.coins15000", count: 2, coins: 30000, ils: 39.8 }],
                   recent: [{ at: new Date(Date.now() - 36e5).toISOString(), product: "com.Maagalim.MaagalimBeach.coins2500", ils: 4.9, price: 4.9, currency: "ILS", storefront: "ISR", username: "sandy_king" },
                            { at: new Date(Date.now() - 9e6).toISOString(), product: "com.Maagalim.MaagalimBeach.coins6000", ils: 9.9, price: 2.99, currency: "USD", storefront: "USA", username: "rio_volley" },
                            { at: new Date(Date.now() - 2e7).toISOString(), product: "com.Maagalim.MaagalimBeach.coins2500", ils: 4.9, price: 4.9, currency: "ILS", storefront: "ISR", username: null }] },
           refunded: { count: 1, ils: 4.9 }, real_all_time: { count: 41, ils: 402.6, buyers: 30 } },
    ads: { ad_requested: 930, ad_unavailable: 40, ad_completed: 801, ad_not_completed: 66, ad_failed: 23, double_coins_paid: 790 },
    countries: [{ value: "IL", installs: 2900 }, { value: "BR", installs: 410 }, { value: "US", installs: 260 }, { value: "FR", installs: 90 }],
    devices: [{ value: "iPhone16,2", installs: 900 }, { value: "iPhone15,3", installs: 700 }, { value: "iPhone14,5", installs: 520 }],
    os: [{ value: "iOS 18.1", installs: 2100 }, { value: "iOS 17.6", installs: 1200 }, { value: "iOS 16.7", installs: 300 }],
    versions: [{ value: "1.0.1", installs: 3100 }, { value: "1.0", installs: 800 }],
    platforms: [{ value: "iOS", installs: 3880 }, { value: "iOS-dev", installs: 4 }],
    screens: [{ screen: "Playing", views: 9100, installs: 1200 }, { screen: "MainMenu", views: 6400, installs: 1280 }, { screen: "Profile", views: 2100, installs: 800 }],
    shops: [{ shop: "Clothes", opens: 1900, installs: 700 }, { shop: "Sandy", opens: 1100, installs: 560 }, { shop: "Balls", opens: 640, installs: 410 }],
    errors: [{ message: "NullReferenceException: Object reference not set to an instance of an object", kind: "Exception", events: 21, installs: 14 },
             { message: "Futchy backend: the account could not be read", kind: "Error", events: 9, installs: 7 }],
  };
}

(async () => {
  if (demoMode) {
    $("gate").hidden = true; $("board").hidden = false; $("tools").hidden = false;
    $("stamp").textContent = "נתוני דוגמה";
    document.querySelector(".navlink").search = "?demo";   // the multiplayer page's own demo
    render(demo());
    return;
  }
  if ((await finishSignIn()).redirect) return;
  if (!stored()) { if ($("gate").hidden) gate(""); return; }
  $("status").textContent = "טוען...";
  await load();
  timer = setInterval(load, 60000);   // "now" keeps itself current
})();
