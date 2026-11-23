// FUTCHY admin: every raw identifier the server sends, in the game's own Hebrew (Chen, 2026-11-23) - ONE place for all
// the admin pages (/admin, /admin/installs, /admin/today, /admin/multiplayer). The wording is the game's: the store's
// packs and boxes (Assets/Scripts/Purchasing/CoinPacks.cs, Localization/strings_99_store_box.txt - the game's money is
// "כסף", the friends-room currency is "מטבעות"), the moves (UI/HebrewStrings.cs), the shops' signs, the screens.
// Anything unknown comes back as itself, so a new id is never hidden - the pages show the raw id small beside a name.
window.FutchyLabels = (() => {
  const nf = new Intl.NumberFormat("he-IL");
  const n = (v) => nf.format(v);
  const ils = (agorot) => `₪${(agorot / 100).toFixed(2)}`;

  // ---- what is sold for real money (App Store / Google Play product ids) ------------------------------------------
  const P = "com.Maagalim.MaagalimBeach.";
  const PRODUCTS = {
    coins1200: [`${n(1200)} כסף`, 290], coins2500: [`${n(2500)} כסף`, 490], coins6000: [`${n(6000)} כסף`, 990],
    coins15000: [`${n(15000)} כסף`, 1990], coins35000: [`${n(35000)} כסף`, 3990], coins80000: [`${n(80000)} כסף`, 7990],
    mysterybox: ["קופסת הפתעה", 990], mysteryboxgold: ["קופסת זהב", 1990], mysteryboxlegend: ["קופסה אגדית", 3990],
    starterpack: [`חבילת פתיחה (${n(10000)} כסף + קופסת הפתעה)`, 1490],
    stars3: ["3 מטבעות (חדרים עם חברים)", 290], stars10: ["10 מטבעות (חדרים עם חברים)", 990],
    stars25: ["25 מטבעות (חדרים עם חברים)", 1990], stars60: ["60 מטבעות (חדרים עם חברים)", 3990],
    stars140: ["140 מטבעות (חדרים עם חברים)", 7990], stars320: ["320 מטבעות (חדרים עם חברים)", 14990],
  };
  /** A product id -> "2,500 כסף" (and its store price, "₪4.90"). */
  function product(id) {
    const key = String(id || "").replace(P, "").replace(/^com\.Maagalim\.MaagalimBeach-/, "");
    const p = PRODUCTS[key];
    if (p) return { name: p[0], price: ils(p[1]) };
    const m = /coins(\d+)$/.exec(key);
    return { name: m ? `${n(+m[1])} כסף` : (id || "–"), price: null };
  }

  // ---- where the game's money came from (coins_earned "source": a grant's name or a kind of earning) -----------------
  const COMPETITIONS = { stadium: "טורניר האצטדיון", worldcup: "המונדיאל", favela: "טורניר פאבלה" };
  function source(raw) {
    const s = String(raw || "");
    if (!s || s === "?") return "לא ידוע";
    if (/\.adx2$/.test(s)) return `הכפלה בפרסומת · ${s.startsWith("league") ? "ליגה" : s.startsWith("beach") ? "חוף" : "פרס"}`;
    if (s === "circle.session") return "סשן במעגלים";
    if (s.startsWith("circle.pro")) return "מעגל מקצוענים";
    if (s === "challenge.claim") return "אתגר מעגלים";
    if (s === "challenge.bonus") return "בונוס לוח האתגרים";
    if (s.startsWith("mission")) return "משימה";
    if (/^league\.s\d+\.champion/.test(s)) return "ליגה · אליפות";
    if (/^league\.s\d+\.place/.test(s)) return "ליגה · מקום בטבלה";
    if (s.startsWith("league")) return "ליגה · משחק";
    const c = /^(stadium|worldcup|favela)\.y\d+\.(.+)$/.exec(s);
    if (c) return `${COMPETITIONS[c[1]]} · ${/^r\d+\.win$/.test(c[2]) ? "ניצחון בסיבוב" : "בונוס"}`;
    if (s.startsWith("store.daily")) return "מתנה יומית בחנות";
    if (s.startsWith("store.ad")) return "סרטון בחנות";
    if (s.startsWith("iap.apple") || s.startsWith("iap.google") || s.startsWith("iap.")) return s.startsWith("iap.box") ? "כסף מקופסת הפתעה" : "קנייה בכסף אמיתי";
    if (s.startsWith("friend")) return "מתנה מחבר";
    if (s.startsWith("competition")) return "פרס תחרות";
    if (s.startsWith("online") || s.startsWith("stake")) return "אונליין";
    if (s.startsWith("box")) return "קופסת הפתעה";
    return s;
  }
  /** Groups many grant names (mission.x, league.s1.r2...) into one row per label. */
  function groupBy(rows, label, sums) {
    const out = new Map();
    for (const r of rows || []) {
      const k = label(r);
      const o = out.get(k) || { label: k, raws: [] };
      for (const f of sums) o[f] = (o[f] || 0) + (+r[f] || 0);
      o.raws.push(r);
      out.set(k, o);
    }
    return [...out.values()];
  }

  // ---- what was bought with the game's money (coins_spent "source": an inventory key or a move's milestone) ----------
  const BALLS = { Classic: "כדור קלאסי", YellowGreen: "כדור צהוב-ירוק", WhiteRed: "כדור לבן-אדום", BlueWhite: "כדור כחול-לבן",
    WhiteBlue: "כדור לבן-כחול", BlackWhite: "כדור שחור-לבן", SandyBazooka: "SandyCup Bazooka", SandyPurplePink: "SandyCup Purple Pink",
    SandyPearl: "SandyCup Pearl", SandyBrazil: "SandyCup Brazil", SandySpain: "SandyCup Spain", SandyAboveAll: "SandyCup Ball Above All",
    SandyIsrael: "SandyCup Israel Ball" };
  const MOVES = { bicycle: "מספרת", around_world: "מסביב לעולם", chest_stall: "עצירה בחזה", foot_stall: "עצירה ברגל",
    butt_bump: "מכת ישבן", hip_ginga: "ג׳ינגה אגן", eclipse: "אקליפס", two_touch_foot: "שתי נגיעות ברגל", heel_flick: "עקב אחורה",
    back_knee: "ברך אחורית", back_knee_jump: "ברך אחורית בקפיצה", shoulder_spin: "כתף מסתובבת", kneel_thigh: "ירך על הברך",
    two_touch_thigh: "שתי נגיעות בירך", blind_scorpion: "עקרב עיוור בקפיצה", knee_cut: "אקדחים", scissor: "שארק", rabona: "רבונה",
    scorpion: "סקורפיון" };
  const WORLDCUP = { TORSO_MG88: "סט המונדיאל", HAT_MG88: "כובע המונדיאל", WRISTBAND_MG88: "צמיד המונדיאל",
    TORSO_MG62: "נבחרת ישראל", TORSO_MG60: "נבחרת ברזיל", TORSO_MG64: "נבחרת ארגנטינה", TORSO_MG65: "נבחרת צרפת",
    TORSO_MG67: "נבחרת פורטוגל", TORSO_MG63: "נבחרת ספרד" };
  const PARTS = { TORSO: "בגד (חולצה / סט)", LEGS: "מכנסיים", FEET: "נעליים", HAIR: "תסרוקת", HAT: "כובע", SUNGLASSES: "משקפי שמש",
    NECKLACE: "שרשרת", BRACELET: "צמיד", WRISTBAND: "צמיד יד", SWEATBAND: "סרט זיעה", KNEE: "מגן ברך", ANKLE: "צמיד רגל",
    TATTOO: "קעקוע", BEARD: "זקן" };
  function item(raw) {
    const s = String(raw || "");
    if (!s || s === "?") return "לא ידוע";
    if (WORLDCUP[s]) return WORLDCUP[s];
    if (s.startsWith("BALL_")) return BALLS[s.slice(5)] || `כדור ${s.slice(5)}`;
    if (s.startsWith("skill_")) return `תרגיל מעגלים · ${MOVES[s.slice(6)] || s.slice(6)}`;
    if (MOVES[s]) return `תרגיל מעגלים · ${MOVES[s]}`;
    const m = /^(?:MESH_[MF]_)?([A-Z]+)(?:_[A-Z]+)?_?(MG\d+)?/.exec(s);
    if (m && PARTS[m[1]]) return m[2] ? `${PARTS[m[1]]} ${m[2]}` : PARTS[m[1]];
    return s;
  }

  // ---- the game's own words for its events, screens, shops, modes, progress -------------------------------------------
  const EVENTS = {
    first_launch: "התקנה ראשונה", app_ready: "המשחק עלה", session_start: "פתיחת המשחק", session_resume: "חזרה למשחק",
    session_end: "יציאה מהמשחק", heartbeat: "במשחק (סימן כל 2 דקות)", screen_view: "מעבר מסך", mode_start: "התחלת משחק",
    circle_end: "סיום סשן מעגלים", match_end: "סיום משחק פוצ׳יוולי", online_end: "סיום משחק אונליין", progress: "התקדמות",
    level_up: "עלייה ברמה", coins_earned: "קיבלו כסף", coins_spent: "קנו בכסף", shop_open: "כניסה לחנות",
    onboarding_started: "התחילו היכרות", onboarding_completed: "סיימו היכרות", onboarding_left: "עזבו את ההיכרות",
    sign_in_shown: "ראו את מסך ההתחברות", sign_in_skipped: "דילגו על ההתחברות", sign_in_result: "ניסיון התחברות",
    sign_in_success: "התחברו", sign_in_failed: "ההתחברות נכשלה", signed_out: "התנתקו", account_shown: "מסך החשבון",
    username_shown: "ראו את בחירת השם", username_created: "בחרו שם משתמש", username_refused: "השם נדחה",
    ad_offer: "הוצעה פרסומת", ad_requested: "ביקשו פרסומת", ad_unavailable: "לא הייתה פרסומת", ad_completed: "צפו בפרסומת עד הסוף",
    ad_not_completed: "סגרו פרסומת לפני הסוף", ad_failed: "פרסומת נכשלה", double_coins_paid: "הכפלת כסף בפרסומת",
    iap_started: "התחילו קנייה בכסף אמיתי", iap_succeeded: "קנייה בכסף אמיתי הצליחה", iap_cancelled: "ביטלו קנייה",
    iap_failed: "קנייה נכשלה", iap_refused: "קנייה נדחתה", iap_pending: "קנייה ממתינה", iap_deferred: "קנייה ממתינה לאישור הורה",
    error: "שגיאה במשחק", unclean_exit: "יציאה לא תקינה (קריסה או סגירה בכוח)", low_memory: "אזהרת זיכרון",
    friend_gift_sent: "שלחו מתנה לחבר", friend_gift_claimed: "קיבלו מתנה מחבר", avatar_uploaded: "העלו תמונת פרופיל",
    instagram_visit: "נכנסו לאינסטגרם", competition_gift: "פרס תחרות", wallet_adopted: "הכסף סונכרן מהשרת",
    wallet_refused: "סנכרון כסף נדחה", venue_load_timeout: "טעינת מגרש איטית", court_facing_unstuck: "תיקון כיוון במגרש",
    mm_search_problem: "אונליין · בעיה בחיפוש יריב", mm_host_absent: "אונליין · המארח לא הגיע",
    circle_reclaim: "מעגלים אונליין · חזרה לשליטה", circle_host_migration: "מעגלים אונליין · החלפת מארח",
  };
  const ONLINE = { online_stage: "שלב בהתחברות", online_link: "חיבור בין הטלפונים", online_quickchat: "הודעה מהירה",
    online_afk: "שחקן לא זז", online_rejoin_offer: "הצעה לחזור למשחק", online_rejoin_back: "חזרו למשחק",
    online_closed_early: "נסגר מוקדם", online_host_migration: "החלפת מארח", online_takeover: "המחשב החליף שחקן" };
  function event(raw) {
    const s = String(raw || "");
    if (EVENTS[s]) return EVENTS[s];
    if (ONLINE[s]) return `אונליין · ${ONLINE[s]}`;
    if (s.startsWith("online_")) return `אונליין · ${s.slice(7).replace(/_/g, " ")}`;
    return s;
  }
  const SCREENS = { MainMenu: "תפריט ראשי", CircleSelect: "בחירת מעגל", Playing: "במשחק (חוף / מעגל / מגרש)", Paused: "עצירה",
    Settings: "הגדרות", Profile: "פרופיל", CharacterEditor: "עריכת דמות", Onboarding: "היכרות ראשונה", BeachSelect: "בחירת חוף",
    ComingSoon: "בקרוב" };
  const SHOPS = { Clothing: "AREIA · בגדים", Clothes: "AREIA · בגדים", Optics: "DIZENGOFF 94 · משקפיים", Jewelry: "Eyes talk · תכשיטים",
    Tattoo: "סטודיו לקעקועים", Balls: "PRO BALL · כדורים", Sandy: "SANDY CUP", WorldCup: "חנות המונדיאל",
    Shoes: "נעליים", Accessories: "אביזרים" };
  const PROGRESS = { TrainingMatchWon: "ניצחו משחק אימון", PracticeMatchWon: "ניצחו משחק תרגול", CompetitiveMatchWon: "ניצחו משחק תחרותי",
    CoachTestPassed: "עברו מבחן של המאמן", LeagueChampionship: "זכו באליפות הליגה", CircleChallengeCompleted: "השלימו אתגר מעגלים",
    CourtMatchPlayed: "שיחקו משחק במגרש", CourtMatchWon: "ניצחו משחק במגרש", ItemBought: "קנו פריט" };
  const VENUES = { Competitive: "תחרותי", Training: "אימון" };
  /** A mode (+ the court's role) -> "פוצ׳יוולי · אימון". */
  function mode(m, venue) {
    if (m === "circle" || m === "circles") return "מעגלים";
    if (m === "footvolley") return venue && VENUES[venue] ? `פוצ׳יוולי · ${VENUES[venue]}` : "פוצ׳יוולי";
    if (m === "online") return "אונליין";
    return m || "לא ידוע";
  }
  /** A finished game (circle_end / match_end / online_end + its venue). */
  function ended(ev, venue) {
    if (ev === "circle_end") return "מעגלים";
    if (ev === "match_end") return mode("footvolley", venue);
    if (ev === "online_end") return venue && venue !== "online" ? `אונליין · ${mode(venue)}` : "אונליין";
    return event(ev);
  }
  const PLATFORMS = { iOS: "אייפון", "iOS-dev": "אייפון · גרסת פיתוח", Android: "אנדרואיד", "Android-dev": "אנדרואיד · גרסת פיתוח",
    IPhonePlayer: "אייפון", OSXEditor: "מחשב (עורך)", "OSXEditor-dev": "מחשב (עורך)", "?": "לא ידוע" };
  const platform = (p) => PLATFORMS[p] || p || "לא ידוע";
  const ENVS = { production: "חנות", testflight: "בדיקה (TestFlight)", dev: "פיתוח (הצוות)",
    "?": "לא ידוע (גרסה ישנה)" };
  const env = (e) => ENVS[e] || e || ENVS["?"];
  /** The store (Apple's storefront, 3 letters) -> the country's name. */
  const STOREFRONTS = { ISR: "IL", USA: "US", BRA: "BR", PRT: "PT", FRA: "FR", ESP: "ES", ARG: "AR", DEU: "DE", GBR: "GB", ITA: "IT",
    MEX: "MX", CAN: "CA", AUS: "AU", NLD: "NL", RUS: "RU", UKR: "UA" };

  let regions;
  try { regions = new Intl.DisplayNames(["he"], { type: "region" }); } catch { regions = null; }
  function country(c) {
    if (!c || c === "?") return "לא ידוע";
    c = STOREFRONTS[c] || c;
    try { return regions?.of(c) || c; } catch { return c; }
  }
  /** The flag of a 2-letter country (regional indicator letters); "" when unknown. */
  const flag = (c) => /^[A-Z]{2}$/.test(c || "") ? String.fromCodePoint(...[...c].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : "";

  // ---- devices: Apple's model ids -> the names on the box -------------------------------------------------------------
  const IPHONES = { "10,1": "8", "10,4": "8", "10,2": "8 Plus", "10,5": "8 Plus", "10,3": "X", "10,6": "X", "11,2": "XS",
    "11,4": "XS Max", "11,6": "XS Max", "11,8": "XR", "12,1": "11", "12,3": "11 Pro", "12,5": "11 Pro Max", "12,8": "SE (2020)",
    "13,1": "12 mini", "13,2": "12", "13,3": "12 Pro", "13,4": "12 Pro Max", "14,4": "13 mini", "14,5": "13", "14,2": "13 Pro",
    "14,3": "13 Pro Max", "14,6": "SE (2022)", "14,7": "14", "14,8": "14 Plus", "15,2": "14 Pro", "15,3": "14 Pro Max",
    "15,4": "15", "15,5": "15 Plus", "16,1": "15 Pro", "16,2": "15 Pro Max", "17,1": "16 Pro", "17,2": "16 Pro Max",
    "17,3": "16", "17,4": "16 Plus", "17,5": "16e", "18,1": "17 Pro", "18,2": "17 Pro Max", "18,3": "17", "18,4": "Air" };
  const ANDROIDS = { "SM-A055F": "Galaxy A05", "SM-A156B": "Galaxy A15 5G", "SM-S921B": "Galaxy S24", "SM-G991B": "Galaxy S21",
    "SM-A546B": "Galaxy A54", "SM-A356B": "Galaxy A35", "SM-S911B": "Galaxy S23", "SM-A256B": "Galaxy A25" };
  function device(raw) {
    const s = String(raw || "");
    const m = /^iPhone(\d+,\d+)$/.exec(s);
    if (m) return IPHONES[m[1]] ? `iPhone ${IPHONES[m[1]]}` : `iPhone (${m[1]})`;
    if (/^iPad/.test(s)) return "iPad";
    const a = ANDROIDS[s.replace(/^samsung\s+/i, "")];
    if (a) return `Samsung ${a}`;
    return s && s !== "?" ? s.replace(/^samsung\s+/i, "Samsung ") : "לא ידוע";
  }
  /** "iOS 26.0.1" -> "iOS 26.0", "Android OS 14 / API-34" -> "Android 14" (by major.minor / major). */
  function os(raw) {
    const s = String(raw || "");
    let m = /^(?:iOS|iPhone OS|iPadOS)\s*(\d+)(?:\.(\d+))?/i.exec(s);
    if (m) return `iOS ${m[1]}${m[2] !== undefined ? "." + m[2] : ""}`;
    m = /Android(?: OS)?\s*(\d+)/i.exec(s);
    if (m) return `Android ${m[1]}`;
    return s && s !== "?" ? s : "לא ידוע";
  }

  return { product, source, item, groupBy, event, screen: (s) => SCREENS[s] || s || "לא ידוע", shop: (s) => SHOPS[s] || s || "לא ידוע",
           progress: (t) => PROGRESS[t] || t || "לא ידוע", mode, ended, platform, env, country, flag, device, os, venue: (v) => VENUES[v] || v };
})();
