"use strict";
/**
 * Hospitality Demand Map Toronto — Analytics & Deep Scan Logic
 * Dynamically computes all KPIs, regional category bubble maps, Top 1–40 hotels,
 * demand deep-dives, and paginated event explorer from data/events.json.
 */

const CAT_LABELS = {
  conference: "Conferences & Workshops",
  music: "Music",
  exhibition: "Exhibitions & Trade Shows",
  performance: "Performing Arts & Competitions",
  festival: "Festivals & Community",
  fan_convention: "Anime, Comics & Pop Culture",
  gala: "Galas & Receptions",
  sports: "Sports",
  dining: "Food & Dining"
};

const CAT_SHORT = {
  conference: "Conference",
  music: "Music",
  exhibition: "Exhibition",
  performance: "Performing Arts",
  festival: "Festival",
  fan_convention: "Fan Convention",
  gala: "Gala",
  sports: "Sports",
  dining: "Dining"
};

const CAT_COLORS = {
  conference: "#2563eb",
  music: "#0f766e",
  exhibition: "#0891b2",
  performance: "#db2777",
  festival: "#ea580c",
  fan_convention: "#9333ea",
  gala: "#b45309",
  sports: "#16a34a",
  dining: "#dc2626"
};

const CAT_KEYS = [
  "conference",
  "exhibition",
  "gala",
  "music",
  "festival",
  "sports",
  "fan_convention",
  "performance",
  "dining"
];

/** Map duplicate venue spellings onto their canonical hotel name. */

const HOTEL_ALIAS_MAP = {
  "sheraton centre toronto, 123 queen street west": "Sheraton Centre Toronto Hotel",
  "sheraton centre toronto, provincial ballroom": "Sheraton Centre Toronto Hotel",
  "sheraton centre toronto": "Sheraton Centre Toronto Hotel",
  "the westin harbour castle": "The Westin Harbour Castle, Toronto",
  "sheraton parkway hotel and suites, richmond hill": "Sheraton Parkway Toronto North Hotel & Suites",
  "sheraton parkway toronto north hotel & suites, richmond hill": "Sheraton Parkway Toronto North Hotel & Suites",
  "omni king edward hotel": "The Omni King Edward Hotel",
  "delta hotels toronto": "Delta Hotels by Marriott Toronto",
  "toronto airport marriott, 901 dixon road": "Toronto Airport Marriott Hotel",
  "hilton mississauga meadowvale": "Hilton Mississauga/Meadowvale",
  "crowne plaza toronto - north york": "Crowne Plaza Toronto – North York",
  "pan pacific toronto": "Crowne Plaza Toronto – North York",
  "four seasons hotel toronto, yorkville": "Four Seasons Hotel Toronto",
  "four seasons hotel toronto, 60 yorkville avenue, toronto": "Four Seasons Hotel Toronto",
  "novotel toronto north york": "Novotel Toronto North York Hotel",
  "novotel toronto north york hotel, 3 park home avenue, toronto": "Novotel Toronto North York Hotel"
};

const VERTICAL_RULES = [
  { label: "Tech / AI / Cyber", re: /\b(tech|ai|artificial intelligence|cyber|software|cloud|data|digital|devops|saas|it|developer|blockchain|crypto|web3|fintech|startup|innovation|security|robotics|quantum|analytics|machine learning|computing|iot|erp|crm|collision|elevate)\b/i },
  { label: "Finance / Real Estate", re: /\b(finance|financial|bank|banking|invest|investment|capital|wealth|equity|fund|hedge|real estate|reit|property|mortgage|insurance|accounting|tax|audit|actuar|treasury|pension|credit|venture|private markets|realtor|urban land|uli|boma)\b/i },
  { label: "Healthcare / Medical", re: /\b(health|healthcare|medical|medicine|pharma|pharmaceutical|biotech|clinical|hospital|doctor|physician|nursing|nurse|dental|dentist|psychiatr|mental health|oncology|cardio|neuro|pediatric|surgery|radiolog|diagnost|patient|life sciences|medtech|therapy|wellness|ophthalm)\b/i },
  { label: "Fandom / Gaming", cat: "fan_convention", re: /\b(anime|comic|cosplay|fandom|gaming|esports|pok[eé]mon|magic: the gathering|yugioh|one piece|lorcana|board game|tabletop|card game|collectible|toy|sci-fi|horror|pop culture|comicon|fan expo|retro|nintendo|playstation)\b/i },
  { label: "Dance / Performing", cat: "performance", re: /\b(dance|dancer|ballet|choreograph|performing arts|theatre|theater|opera|symphony|choir|choral|comedy|magic show|circus|acrobat|cheer|pageant)\b/i },
  { label: "Legal / Gov / Labour", re: /\b(law|legal|lawyer|bar association|litigation|arbitration|compliance|regulator|government|municipal|public sector|policy|union|labour|labor|federation|council|parliament|court|justice|immigration|oba|cba)\b/i },
  { label: "Education / STEM", re: /\b(education|university|college|school|student|academic|stem|teacher|educator|curriculum|campus|scholarship|learning|pedagog|library|literacy|higher ed|k-12|researchers)\b/i },
  { label: "Mining / Energy", re: /\b(mining|mineral|pdac|gold|lithium|metals|prospectors|energy|power|electricity|nuclear|solar|wind|grid|renewable|hydrogen|utility|oil|gas|cleantech|battery|decarbon)\b/i }
];

let EVENTS = [];
let HOTEL_ROWS = [];
let FILTERED_EXPLORER = [];
let currentHotelTier = "ALL";
let hotelSort = { key: "total", dir: "desc" };
let explorerSort = { key: "start", dir: "asc" };
let activeBubbleCat = "ALL";
let selectedAreaKey = null;
let explorerPage = 1;
const PAGE_SIZE = 100;

let catMap = null;
let catLayer = null;
let catTilesLoaded = 0;
let catFallbackActive = false;
const charts = {};

/** Generic null-safe ascending/descending comparator for numbers and strings. */
function compareSortValues(aVal, bVal, dir, isNum) {
  const aEmpty = aVal == null || aVal === "";
  const bEmpty = bVal == null || bVal === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  const cmp = isNum
    ? Number(aVal) - Number(bVal)
    : String(aVal).localeCompare(String(bVal), undefined, { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

/** Update sort indicator glyphs and active class across sortable table headers. */
function syncSortHeaderUI(selector, dataAttr, sortState) {
  document.querySelectorAll(selector).forEach(th => {
    const key = th.getAttribute(dataAttr);
    const active = key === sortState.key;
    th.classList.toggle("sort-active", active);
    const ind = th.querySelector(".sort-ind");
    if (ind) ind.textContent = active ? (sortState.dir === "asc" ? "▲" : "▼") : "↕";
  });
}

/** Bind click + Enter/Space keyboard handlers to sortable table headers. */
function bindSortableHeaders(selector, dataAttr, numericKeys, sortState, onSortChange) {
  document.querySelectorAll(selector).forEach(th => {
    const trigger = () => {
      const key = th.getAttribute(dataAttr);
      if (sortState.key === key) {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      } else {
        sortState.key = key;
        sortState.dir = numericKeys.has(key) ? "desc" : "asc";
      }
      onSortChange();
    };
    th.addEventListener("click", trigger);
    th.addEventListener("keydown", ev => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        trigger();
      }
    });
  });
}

/** Escape HTML special characters before inserting into templates. */
function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n) {
  return Number(n).toLocaleString("en-US");
}

function normalizeHotelName(ev) {
  const raw = (ev.hn || ev.venue || "").trim();
  return HOTEL_ALIAS_MAP[raw.toLowerCase()] || raw;
}

/** Collapse Airport / West sub-labels into clean GTA corridors when corridor mode is active. */
function normalizeArea(areaRaw, mode) {
  const raw = (areaRaw || "Toronto / GTA").trim();
  if (mode === "raw") return raw;
  const low = raw.toLowerCase();
  if (low.includes("airport")) return "Airport Corridor";
  if (low === "etobicoke") return "West Toronto";
  return raw;
}

function getEventDays(ev) {
  const s = new Date(ev.start + "T00:00:00");
  const e = new Date(ev.end + "T00:00:00");
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

function getAttendeeDisplay(ev) {
  if (ev.att != null) return fmt(ev.att);
  if (ev.exp != null) return fmt(ev.exp) + " (est)";
  if (ev.act != null) return fmt(ev.act) + " (act)";
  return "—";
}

function tryFetchJson(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("html")) throw new Error("HTML returned instead of JSON for " + url);
    return r.json();
  });
}

(function boot() {
  tryFetchJson("data/events.json")
    .catch(() => tryFetchJson("events.json"))
    .catch(() => tryFetchJson("data%5Cevents.json"))
    .then(data => {
      EVENTS = data;
      initDashboard();
    })
    .catch(err => {
      const badge = document.getElementById("analyticsStatus");
      badge.textContent = "Data load failed: " + err.message;
      badge.style.color = "#dc2626";
      console.error("Analytics boot failed:", err);
    });
})();

function initDashboard() {
  const badge = document.getElementById("analyticsStatus");
  badge.textContent = `${fmt(EVENTS.length)} verified events live`;

  computeHotelRows();
  populateKpis();
  populateExplorerFilters();
  initCategoryBubbleMap();
  renderBubbleControls();
  renderCategoryBubbleView();
  bindSortableHeaders("#hotelsTable th[data-hotel-sort]", "data-hotel-sort", new Set(["total", "y2027", "y2026", "y2025"]), hotelSort, () => {
    syncHotelDropdownFromSort();
    renderHotelsTable();
  });
  bindSortableHeaders("#explorerTable th[data-exp-sort]", "data-exp-sort", new Set(["att"]), explorerSort, () => {
    explorerPage = 1;
    renderExplorer();
  });
  renderHotelsTable();
  renderDeepAnalytics();
  renderExplorer();

  document.getElementById("bYear").addEventListener("change", renderCategoryBubbleView);
  document.getElementById("bHotel").addEventListener("change", renderCategoryBubbleView);
  document.getElementById("bGroup").addEventListener("change", () => {
    selectedAreaKey = null;
    renderCategoryBubbleView();
  });
  document.getElementById("bMode").addEventListener("change", renderCategoryBubbleView);

  if (window.location.hash) {
    const target = window.location.hash.replace("#", "");
    if (["bubbles", "hotels", "analytics", "explorer"].includes(target)) {
      switchAnalyticsTab(target);
    }
  }
}

/** Build canonical Top 40 + Extended hotel aggregations directly from EVENTS. */
function computeHotelRows() {
  const byName = new Map();
  EVENTS.forEach(ev => {
    if (!ev.hotel) return;
    const canon = normalizeHotelName(ev);
    if (!canon) return;
    let rec = byName.get(canon);
    if (!rec) {
      rec = { name: canon, area: ev.area || "Toronto / GTA", y2025: 0, y2026: 0, y2027: 0, total: 0, cats: {} };
      byName.set(canon, rec);
    }
    const y = (ev.start || "").slice(0, 4);
    if (y === "2025") rec.y2025++;
    else if (y === "2026") rec.y2026++;
    else if (y === "2027") rec.y2027++;
    rec.total++;
    rec.cats[ev.cat] = (rec.cats[ev.cat] || 0) + 1;
  });

  HOTEL_ROWS = Array.from(byName.values())
    .sort((a, b) => b.total - a.total || b.y2027 - a.y2027 || a.name.localeCompare(b.name))
    .map((rec, idx) => {
      const rank = idx + 1;
      const tier = rank <= 10 ? "Top 10" : (rank <= 20 ? "Top 11-20" : "");
      return finalizeHotelRow(rank, tier, rec);
    });
}

function finalizeHotelRow(rank, tier, rec) {
  let topCat = "conference";
  let topCnt = -1;
  Object.entries(rec.cats).forEach(([c, n]) => {
    if (n > topCnt) {
      topCnt = n;
      topCat = c;
    }
  });
  return { ...rec, rank, tier, topCat };
}

function populateKpis() {
  const total = EVENTS.length;
  const hotelEvents = EVENTS.filter(e => e.hotel);
  const nonHotelEvents = EVENTS.filter(e => !e.hotel);
  const top40Sum = HOTEL_ROWS.filter(h => h.rank <= 40).reduce((s, h) => s + h.total, 0);
  let multiDay = 0, multiHotel = 0, multiNon = 0;
  const venues = new Set();
  const domains = new Set();
  let urlCount = 0;

  EVENTS.forEach(e => {
    venues.add(e.venue);
    const days = getEventDays(e);
    if (days >= 2) {
      multiDay++;
      if (e.hotel) multiHotel++;
      else multiNon++;
    }
    const list = Array.isArray(e.urls) && e.urls.length ? e.urls : (e.url ? [e.url] : []);
    list.forEach(u => {
      urlCount++;
      try { domains.add(new URL(u).hostname.replace(/^www\./, "")); } catch (_) {}
    });
  });

  const pct = n => total ? ((n / total) * 100).toFixed(1) : "0";
  const pct40 = hotelEvents.length ? ((top40Sum / hotelEvents.length) * 100).toFixed(1) : "0";

  document.getElementById("kpiTotal").textContent = fmt(total);
  document.getElementById("kpiTotalSub").textContent = `${fmt(venues.size)} venues · 2025–2027`;
  document.getElementById("kpiHotel").innerHTML = `${fmt(hotelEvents.length)} <small>(${pct(hotelEvents.length)}%)</small>`;
  document.getElementById("kpiHotelSub").textContent = `Top 40 capture ${fmt(top40Sum)} (${pct40}%)`;
  document.getElementById("kpiNonHotel").innerHTML = `${fmt(nonHotelEvents.length)} <small>(${pct(nonHotelEvents.length)}%)</small>`;
  document.getElementById("kpiNonHotelSub").textContent = `Citywide & public major venues`;
  document.getElementById("kpiMultiDay").innerHTML = `${fmt(multiDay)} <small>(${pct(multiDay)}%)</small>`;
  document.getElementById("kpiMultiDaySub").textContent = `${fmt(multiHotel)} in-hotel · ${fmt(multiNon)} citywide`;
  document.getElementById("kpiCoverage").textContent = `${fmt(urlCount)} URLs`;
  document.getElementById("kpiCoverageSub").textContent = `${fmt(domains.size)} source domains`;

  document.getElementById("tabBtn-explorer").textContent = `4. Event Explorer (${fmt(total)})`;
  const extBtn = document.getElementById("hTier-EXT");
  if (extBtn) extBtn.textContent = `All Hotels (${HOTEL_ROWS.length})`;
}

/** Switch sub-tabs cleanly and resize charts/map when their container becomes visible. */
window.switchAnalyticsTab = function (tab) {
  ["bubbles", "hotels", "analytics", "explorer"].forEach(t => {
    const panel = document.getElementById("view-" + t);
    const btn = document.getElementById("tabBtn-" + t);
    const active = t === tab;
    panel.classList.toggle("active", active);
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (tab === "bubbles") {
    if (catMap) setTimeout(() => catMap.invalidateSize(), 60);
    if (charts.areaCatBubble) charts.areaCatBubble.resize();
  }
  if (tab === "analytics") {
    ["seasonality", "category", "dow", "vertical"].forEach(k => charts[k] && charts[k].resize());
  }
};

/* ============================================================================
 * TAB 1: CATEGORY REGIONAL BUBBLE MAP + AREA × CATEGORY MATRIX
 * ============================================================================ */

function initCategoryBubbleMap() {
  if (typeof L === "undefined") {
    activateCatFallback();
    return;
  }
  catMap = L.map("catMap", { center: [43.70, -79.42], zoom: 11, preferCanvas: true });
  catLayer = L.layerGroup().addTo(catMap);

  const esri = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri", maxZoom: 18 }
  ).addTo(catMap);

  esri.on("tileload", () => { catTilesLoaded++; });
  esri.on("tileerror", () => {
    if (catTilesLoaded === 0) activateCatFallback();
  });
  setTimeout(() => {
    if (catTilesLoaded === 0) activateCatFallback();
  }, 5500);
}

function activateCatFallback() {
  if (catFallbackActive) return;
  catFallbackActive = true;
  document.getElementById("catMap").style.display = "none";
  document.getElementById("catFallbackSvg").classList.add("active");
  renderCategoryBubbleView();
}

function renderBubbleControls() {
  const wrap = document.getElementById("bCatChips");
  const counts = {};
  EVENTS.forEach(e => { counts[e.cat] = (counts[e.cat] || 0) + 1; });

  const allBtn = `<button type="button" class="chip ${activeBubbleCat === "ALL" ? "active" : ""}" data-bcat="ALL" onclick="selectBubbleCat('ALL')">
    All Categories <span class="cnt">${fmt(EVENTS.length)}</span>
  </button>`;

  const catBtns = CAT_KEYS.map(c => `<button type="button" class="chip ${activeBubbleCat === c ? "active" : ""}" data-bcat="${c}" onclick="selectBubbleCat('${c}')">
    <span class="dot" style="background:${CAT_COLORS[c]}"></span>
    ${esc(CAT_SHORT[c])}
    <span class="cnt">${fmt(counts[c] || 0)}</span>
  </button>`).join("");

  wrap.innerHTML = allBtn + catBtns;
}

window.selectBubbleCat = function (cat) {
  activeBubbleCat = cat;
  document.querySelectorAll("#bCatChips .chip").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.bcat === cat);
  });
  renderCategoryBubbleView();
};

function getBubbleScopeEvents() {
  const yr = document.getElementById("bYear").value;
  const hFlag = document.getElementById("bHotel").value;
  return EVENTS.filter(e => {
    if (yr !== "ALL" && !(e.start || "").startsWith(yr)) return false;
    if (hFlag !== "ALL" && (e.hotel ? "1" : "0") !== hFlag) return false;
    return true;
  });
}

function renderCategoryBubbleView() {
  const scoped = getBubbleScopeEvents();
  const groupMode = document.getElementById("bGroup").value;
  const dispMode = document.getElementById("bMode").value;

  const catTotals = {};
  scoped.forEach(e => { catTotals[e.cat] = (catTotals[e.cat] || 0) + 1; });
  document.querySelectorAll("#bCatChips .chip").forEach(btn => {
    const c = btn.dataset.bcat;
    const cntEl = btn.querySelector(".cnt");
    if (cntEl) cntEl.textContent = fmt(c === "ALL" ? scoped.length : (catTotals[c] || 0));
  });

  const areaMap = new Map();
  scoped.forEach(e => {
    const areaName = normalizeArea(e.area, groupMode);
    let rec = areaMap.get(areaName);
    if (!rec) {
      rec = { area: areaName, latSum: 0, lngSum: 0, total: 0, cats: {}, venues: {} };
      areaMap.set(areaName, rec);
    }
    rec.latSum += e.lat;
    rec.lngSum += e.lng;
    rec.total++;
    rec.cats[e.cat] = (rec.cats[e.cat] || 0) + 1;
    rec.venues[e.venue] = (rec.venues[e.venue] || 0) + 1;
  });

  const areas = Array.from(areaMap.values()).map(r => {
    const lat = r.latSum / r.total;
    const lng = r.lngSum / r.total;
    let domCat = "conference", domCnt = -1;
    Object.entries(r.cats).forEach(([c, n]) => {
      if (n > domCnt) { domCnt = n; domCat = c; }
    });
    const activeCount = activeBubbleCat === "ALL" ? r.total : (r.cats[activeBubbleCat] || 0);
    return { ...r, lat, lng, domCat, domCnt, activeCount };
  }).sort((a, b) => b.activeCount - a.activeCount || b.total - a.total);

  const totalDisplayed = areas.reduce((s, a) => s + a.activeCount, 0);
  document.getElementById("bActiveCount").textContent = `${fmt(totalDisplayed)} events · ${areas.filter(a => a.activeCount > 0).length} areas`;

  const catLabel = activeBubbleCat === "ALL" ? "All 9 Categories" : CAT_LABELS[activeBubbleCat];
  document.getElementById("bMapTitle").textContent = `Regional Bubble Map: ${catLabel}`;

  if (!selectedAreaKey || !areaMap.has(selectedAreaKey)) {
    selectedAreaKey = areas.length ? areas[0].area : null;
  }

  if (catFallbackActive) {
    renderCatFallbackSvg(areas, dispMode);
  } else {
    renderCatLeafletBubbles(areas, dispMode);
  }

  renderAreaInspector(areas.find(a => a.area === selectedAreaKey) || areas[0]);
  renderAreaCategoryBubbleMatrix(areas);
  renderCategoryLeaderCards(areas, scoped.length);
}

function bubblePixelSize(count, maxCount, minPx, maxPx) {
  if (count <= 0) return 0;
  return Math.round(minPx + (maxPx - minPx) * Math.sqrt(count / Math.max(1, maxCount)));
}

function renderCatLeafletBubbles(areas, dispMode) {
  if (!catMap || !catLayer) return;
  catLayer.clearLayers();

  const nonZero = areas.filter(a => a.activeCount > 0);
  const maxVal = Math.max(1, ...nonZero.map(a => a.activeCount));

  if (activeBubbleCat === "ALL" && dispMode === "cluster") {
    let maxCat = 1;
    nonZero.forEach(a => Object.values(a.cats).forEach(v => { if (v > maxCat) maxCat = v; }));
    nonZero.forEach(a => {
      const entries = Object.entries(a.cats).sort((x, y) => y[1] - x[1]);
      L.marker([a.lat, a.lng], {
        icon: L.divIcon({
          className: "area-bubble-icon",
          html: `<div class="area-bubble-lbl" style="position:static;transform:translate(-50%,-50%);font-size:11px;">${esc(a.area)} (${fmt(a.total)})</div>`,
          iconSize: [0, 0]
        }),
        interactive: true
      }).on("click", () => {
        selectedAreaKey = a.area;
        renderAreaInspector(a);
      }).addTo(catLayer);

      entries.forEach(([cat, cnt], idx) => {
        const angle = (idx / Math.max(1, entries.length)) * Math.PI * 2 + 0.4;
        const ring = 0.011 + 0.005 * Math.floor(idx / 6);
        const latOff = a.lat + Math.sin(angle) * ring * 0.72;
        const lngOff = a.lng + Math.cos(angle) * ring * 1.1;
        const size = bubblePixelSize(cnt, maxCat, 20, 56);
        const marker = L.marker([latOff, lngOff], {
          icon: L.divIcon({
            className: "area-bubble-icon",
            html: `<div class="area-bubble-wrap" style="width:${size}px;height:${size}px;background:${CAT_COLORS[cat]};font-size:${size < 28 ? 10 : 12}px;opacity:0.92;">${fmt(cnt)}</div>`,
            iconSize: [0, 0]
          })
        });
        marker.bindTooltip(`<b>${esc(a.area)}</b><br>${esc(CAT_LABELS[cat])}: <b>${fmt(cnt)}</b> (${((cnt / a.total) * 100).toFixed(1)}%)`);
        marker.on("click", () => {
          selectedAreaKey = a.area;
          renderAreaInspector(a);
        });
        marker.addTo(catLayer);
      });
    });
    return;
  }

  nonZero.slice().reverse().forEach(a => {
    const color = activeBubbleCat === "ALL" ? CAT_COLORS[a.domCat] : CAT_COLORS[activeBubbleCat];
    const size = bubblePixelSize(a.activeCount, maxVal, 26, 74);
    const isSel = a.area === selectedAreaKey;
    const share = activeBubbleCat === "ALL"
      ? `${CAT_SHORT[a.domCat]} ${Math.round((a.domCnt / a.total) * 100)}%`
      : `${Math.round((a.activeCount / Math.max(1, a.total)) * 100)}% of region`;

    const marker = L.marker([a.lat, a.lng], {
      icon: L.divIcon({
        className: "area-bubble-icon",
        html: `<div class="area-bubble-wrap ${isSel ? "selected" : ""}" style="width:${size}px;height:${size}px;background:${color};font-size:${size < 34 ? 11 : 13}px;">
          ${fmt(a.activeCount)}
          <span class="area-bubble-lbl">${esc(a.area)}</span>
        </div>`,
        iconSize: [0, 0]
      }),
      zIndexOffset: isSel ? 1000 : (1000 - size)
    });

    marker.bindTooltip(
      `<b>${esc(a.area)}</b><br>` +
      `${activeBubbleCat === "ALL" ? "Total" : esc(CAT_SHORT[activeBubbleCat])}: <b>${fmt(a.activeCount)}</b> events (${esc(share)})` +
      `<br><small>Click to inspect category mix</small>`,
      { direction: "top", offset: [0, -10] }
    );
    marker.on("click", () => {
      selectedAreaKey = a.area;
      renderCatLeafletBubbles(areas, dispMode);
      renderAreaInspector(a);
    });
    marker.addTo(catLayer);
  });
}

function renderCatFallbackSvg(areas, dispMode) {
  const svg = document.getElementById("catFallbackSvg");
  const W = 860, H = 560, lngMin = -79.88, lngMax = -78.78, latMin = 43.30, latMax = 44.08;
  const x = lng => ((lng - lngMin) / (lngMax - lngMin)) * W;
  const y = lat => ((latMax - lat) / (latMax - latMin)) * H;

  const nonZero = areas.filter(a => a.activeCount > 0);
  const maxVal = Math.max(1, ...nonZero.map(a => a.activeCount));

  const out = [
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#eef1ea"/>`,
    `<path d="M220,420 C410,400 620,415 ${W},395 L${W},${H} L220,${H} Z" fill="#c7dde8"/>`,
    `<text x="${W / 2}" y="${H - 18}" text-anchor="middle" font-size="12" letter-spacing="2" fill="#5b7a8a">LAKE ONTARIO</text>`
  ];

  nonZero.slice().reverse().forEach(a => {
    const cx = x(a.lng).toFixed(1), cy = y(a.lat).toFixed(1);
    const r = (bubblePixelSize(a.activeCount, maxVal, 22, 68) / 2).toFixed(1);
    const color = activeBubbleCat === "ALL" ? CAT_COLORS[a.domCat] : CAT_COLORS[activeBubbleCat];
    const stroke = a.area === selectedAreaKey ? "#111827" : "#ffffff";
    out.push(`<g style="cursor:pointer" onclick="window.__selectFallbackArea('${esc(a.area).replace(/'/g, "\\'")}')">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" fill-opacity="0.86" stroke="${stroke}" stroke-width="2.5"/>
      <text x="${cx}" y="${Number(cy) + 4}" text-anchor="middle" fill="#fff" font-size="11" font-weight="800">${fmt(a.activeCount)}</text>
      <text x="${cx}" y="${Number(cy) + Number(r) + 13}" text-anchor="middle" fill="#1c2420" font-size="10.5" font-weight="700">${esc(a.area)}</text>
    </g>`);
  });

  svg.innerHTML = out.join("");
  window.__selectFallbackArea = areaName => {
    selectedAreaKey = areaName;
    renderCatFallbackSvg(areas, dispMode);
    renderAreaInspector(areas.find(x => x.area === areaName));
  };
}

function renderAreaInspector(areaObj) {
  const titleEl = document.getElementById("inspAreaTitle");
  const subEl = document.getElementById("inspAreaSub");
  const barsEl = document.getElementById("inspBars");
  const venuesEl = document.getElementById("inspVenues");
  const btnWrap = document.getElementById("inspMapBtnWrap");

  if (!areaObj) {
    titleEl.textContent = "No events match current filters";
    subEl.textContent = "Adjust year or category filter";
    barsEl.innerHTML = "";
    venuesEl.innerHTML = "";
    btnWrap.innerHTML = "";
    return;
  }

  titleEl.textContent = `${areaObj.area} (${fmt(areaObj.total)} events)`;
  subEl.textContent = `Primary category: ${CAT_LABELS[areaObj.domCat]} (${Math.round((areaObj.domCnt / areaObj.total) * 100)}%)`;

  const catEntries = Object.entries(areaObj.cats).sort((a, b) => b[1] - a[1]);
  barsEl.innerHTML = catEntries.map(([c, cnt]) => {
    const pct = ((cnt / areaObj.total) * 100).toFixed(1);
    const hl = activeBubbleCat === c ? "font-weight:800;text-decoration:underline;" : "";
    return `<div class="bar-row">
      <div class="bar-row-head">
        <span style="display:inline-flex;align-items:center;gap:6px;${hl}">
          <span class="dot" style="width:9px;height:9px;border-radius:50%;background:${CAT_COLORS[c]};display:inline-block;"></span>
          ${esc(CAT_LABELS[c])}
        </span>
        <span style="font-weight:700;">${fmt(cnt)} <small style="color:var(--muted);font-weight:500;">(${pct}%)</small></span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${CAT_COLORS[c]}"></div></div>
    </div>`;
  }).join("");

  const topVenues = Object.entries(areaObj.venues).sort((a, b) => b[1] - a[1]).slice(0, 5);
  venuesEl.innerHTML = topVenues.map(([v, cnt]) =>
    `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px dashed var(--line);">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(v)}">${esc(v)}</span>
      <span style="font-weight:700;white-space:nowrap;">${fmt(cnt)}</span>
    </div>`
  ).join("");

  const searchQ = encodeURIComponent(areaObj.area === "Airport Corridor" ? "Airport" : areaObj.area);
  btnWrap.innerHTML = `<a class="btn-mini" style="width:100%;text-align:center;padding:8px 12px;" href="index.html?q=${searchQ}&all=1">📍 View this region on Demand Map ↗</a>`;
}

function renderAreaCategoryBubbleMatrix(areas) {
  const topAreas = areas.filter(a => a.total > 0).slice(0, 12);
  const yLabels = topAreas.map(a => a.area);
  const xLabels = CAT_KEYS.map(c => CAT_SHORT[c]);

  let maxCell = 1;
  topAreas.forEach(a => CAT_KEYS.forEach(c => {
    const n = a.cats[c] || 0;
    if (n > maxCell) maxCell = n;
  }));

  const datasets = CAT_KEYS.map((c, xi) => {
    const pts = [];
    topAreas.forEach((a, yi) => {
      const cnt = a.cats[c] || 0;
      if (cnt > 0) {
        const r = Math.max(4, Math.min(26, 4 + 22 * Math.sqrt(cnt / maxCell)));
        pts.push({ x: xi, y: yi, r, count: cnt, areaTotal: a.total, areaName: a.area, catName: CAT_LABELS[c] });
      }
    });
    return {
      label: CAT_SHORT[c],
      data: pts,
      backgroundColor: CAT_COLORS[c] + "cc",
      borderColor: CAT_COLORS[c],
      borderWidth: 1.5
    };
  });

  if (charts.areaCatBubble) charts.areaCatBubble.destroy();
  const textCol = getChartTextColor();
  const gridCol = getChartGridColor();

  charts.areaCatBubble = new Chart(document.getElementById("areaCategoryBubbleChart"), {
    type: "bubble",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const raw = ctx.raw;
              const pctArea = ((raw.count / raw.areaTotal) * 100).toFixed(1);
              return `${raw.areaName} · ${raw.catName}: ${fmt(raw.count)} events (${pctArea}% of region)`;
            }
          }
        }
      },
      scales: {
        x: {
          type: "linear",
          min: -0.6,
          max: xLabels.length - 0.4,
          afterBuildTicks(axis) {
            axis.ticks = xLabels.map((_, i) => ({ value: i }));
          },
          ticks: {
            color: textCol,
            callback: v => xLabels[v] || ""
          },
          grid: { color: gridCol }
        },
        y: {
          type: "linear",
          reverse: true,
          min: -0.6,
          max: Math.max(0.4, yLabels.length - 0.4),
          afterBuildTicks(axis) {
            axis.ticks = yLabels.map((_, i) => ({ value: i }));
          },
          ticks: {
            color: textCol,
            callback: v => yLabels[v] || ""
          },
          grid: { color: gridCol }
        }
      }
    }
  });
}

function renderCategoryLeaderCards(areas, scopeTotal) {
  const grid = document.getElementById("catLeadersGrid");
  grid.innerHTML = CAT_KEYS.map(c => {
    const catTotal = areas.reduce((s, a) => s + (a.cats[c] || 0), 0);
    const ranked = areas
      .filter(a => (a.cats[c] || 0) > 0)
      .sort((a, b) => (b.cats[c] || 0) - (a.cats[c] || 0))
      .slice(0, 3);

    const topLines = ranked.length
      ? ranked.map((a, i) => {
          const n = a.cats[c];
          const pct = Math.round((n / Math.max(1, catTotal)) * 100);
          return `<div style="display:flex;justify-content:space-between;font-size:12px;">
            <span>${i + 1}. <b>${esc(a.area)}</b></span>
            <span>${fmt(n)} (${pct}%)</span>
          </div>`;
        }).join("")
      : `<div style="font-size:12px;color:var(--muted);">No events match current filter</div>`;

    const shareAll = scopeTotal ? ((catTotal / scopeTotal) * 100).toFixed(1) : "0";
    return `<div class="leader-item" style="cursor:pointer;" onclick="selectBubbleCat('${c}')">
      <div class="leader-item-head">
        <span style="width:10px;height:10px;border-radius:50%;background:${CAT_COLORS[c]};display:inline-block;"></span>
        <span>${esc(CAT_LABELS[c])}</span>
        <span style="margin-left:auto;color:var(--muted);font-size:12px;">${fmt(catTotal)} (${shareAll}%)</span>
      </div>
      ${topLines}
    </div>`;
  }).join("");
}

/* ============================================================================
 * TAB 2: TOP 1-40 HOTELS
 * ============================================================================ */

window.filterHotels = function (tier) {
  currentHotelTier = tier;
  const map = { ALL: "hTier-ALL", "Top 10": "hTier-Top10", "Top 11-20": "hTier-Top11", EXT: "hTier-EXT" };
  Object.entries(map).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", k === tier);
  });
  renderHotelsTable();
};

window.onHotelSortSelectChange = function () {
  const mode = document.getElementById("hotelSortSel").value;
  hotelSort.key = mode;
  hotelSort.dir = mode === "rank" ? "asc" : "desc";
  renderHotelsTable();
};

function syncHotelDropdownFromSort() {
  const sel = document.getElementById("hotelSortSel");
  if (!sel) return;
  const preset = ["total", "y2027", "y2026", "y2025", "rank"];
  if (preset.includes(hotelSort.key)) sel.value = hotelSort.key;
}

window.renderHotelsTable = function () {
  const q = (document.getElementById("hotelSearchInput").value || "").trim().toLowerCase();
  const isNum = new Set(["rank", "tier", "y2025", "y2026", "y2027", "total"]).has(hotelSort.key);
  syncSortHeaderUI("#hotelsTable th[data-hotel-sort]", "data-hotel-sort", hotelSort);

  const filtered = HOTEL_ROWS.filter(h => {
    if (currentHotelTier === "ALL" && h.rank > 40) return false;
    if ((currentHotelTier === "Top 10" || currentHotelTier === "Top 11-20") && h.tier !== currentHotelTier) return false;
    if (q && !h.name.toLowerCase().includes(q) && !h.area.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    const getVal = h => {
      if (hotelSort.key === "tier") return h.tier === "Top 10" ? 1 : (h.tier === "Top 11-20" ? 2 : null);
      if (hotelSort.key === "topCat") return CAT_SHORT[h.topCat] || h.topCat;
      return h[hotelSort.key];
    };
    return compareSortValues(getVal(a), getVal(b), hotelSort.dir, isNum) || (b.total - a.total) || (a.rank - b.rank);
  });

  const showLiveRank = new Set(["total", "y2027", "y2026", "y2025"]).has(hotelSort.key);
  const maxTot = Math.max(1, ...HOTEL_ROWS.map(h => h.total));
  const tbody = document.getElementById("hotelsTableBody");
  tbody.innerHTML = filtered.map((h, idx) => {
    const pct = Math.round((h.total / maxTot) * 100);
    const tierHtml = h.tier
      ? `<span class="tier-badge ${h.tier === "Top 10" ? "tier-1" : "tier-2"}">${esc(h.tier)}</span>`
      : "";
    const shortQ = encodeURIComponent(h.name.split(",")[0]);
    const displayNum = showLiveRank ? (idx + 1) : h.rank;
    return `<tr>
      <td style="font-family:ui-monospace,monospace;color:var(--muted);">${displayNum}</td>
      <td style="font-weight:650;">${esc(h.name)}</td>
      <td>${tierHtml}</td>
      <td style="color:var(--muted);">${esc(h.area)}</td>
      <td><span class="cat-pill" style="background:${CAT_COLORS[h.topCat] || "#2563eb"}">${esc(CAT_SHORT[h.topCat] || h.topCat)}</span></td>
      <td class="num">${fmt(h.y2025)}</td>
      <td class="num">${fmt(h.y2026)}</td>
      <td class="num" style="color:var(--accent);font-weight:700;">${fmt(h.y2027)}</td>
      <td class="num" style="font-weight:800;">${fmt(h.total)}</td>
      <td>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--blue)"></div></div>
      </td>
      <td class="center"><a class="btn-mini" href="index.html?q=${shortQ}&all=1">📍 Map</a></td>
    </tr>`;
  }).join("");
};

/* ============================================================================
 * TAB 3: DEEP DEMAND ANALYTICS
 * ============================================================================ */

function getChartTextColor() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "#cbd5e1" : "#334155";
}

function getChartGridColor() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "#334155" : "#e2dfd3";
}

function renderDeepAnalytics() {
  const textCol = getChartTextColor();
  const gridCol = getChartGridColor();

  const m25 = new Array(12).fill(0);
  const m26 = new Array(12).fill(0);
  const m27 = new Array(12).fill(0);
  const catCounts = {};
  const dowHotel = new Array(7).fill(0); // Mon=0 .. Sun=6
  const dowNon = new Array(7).fill(0);
  const vertCounts = VERTICAL_RULES.map(() => 0);

  EVENTS.forEach(ev => {
    const [yr, mo] = (ev.start || "").split("-").map(Number);
    if (yr === 2025 && mo >= 1 && mo <= 12) m25[mo - 1]++;
    else if (yr === 2026 && mo >= 1 && mo <= 12) m26[mo - 1]++;
    else if (yr === 2027 && mo >= 1 && mo <= 12) m27[mo - 1]++;

    catCounts[ev.cat] = (catCounts[ev.cat] || 0) + 1;

    const d = new Date(ev.start + "T00:00:00");
    if (!isNaN(d.getTime())) {
      const idx = (d.getDay() + 6) % 7;
      if (ev.hotel) dowHotel[idx]++;
      else dowNon[idx]++;
    }

    const txt = `${ev.name || ""} ${ev.note || ""}`;
    VERTICAL_RULES.forEach((rule, i) => {
      if ((rule.cat && ev.cat === rule.cat) || rule.re.test(txt)) vertCounts[i]++;
    });
  });

  if (charts.seasonality) charts.seasonality.destroy();
  charts.seasonality = new Chart(document.getElementById("seasonalityChart"), {
    type: "bar",
    data: {
      labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      datasets: [
        { label: "2025", data: m25, backgroundColor: "#64748b" },
        { label: "2026", data: m26, backgroundColor: "#2563eb" },
        { label: "2027", data: m27, backgroundColor: "#0f766e" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textCol } } },
      scales: {
        x: { stacked: true, ticks: { color: textCol }, grid: { color: gridCol } },
        y: { stacked: true, ticks: { color: textCol }, grid: { color: gridCol } }
      }
    }
  });

  document.getElementById("catChartSub").textContent = `Total n = ${fmt(EVENTS.length)} events`;
  if (charts.category) charts.category.destroy();
  charts.category = new Chart(document.getElementById("categoryChart"), {
    type: "doughnut",
    data: {
      labels: CAT_KEYS.map(c => `${CAT_SHORT[c]} (${fmt(catCounts[c] || 0)})`),
      datasets: [{
        data: CAT_KEYS.map(c => catCounts[c] || 0),
        backgroundColor: CAT_KEYS.map(c => CAT_COLORS[c]),
        borderWidth: 1,
        borderColor: "transparent"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "right", labels: { color: textCol, boxWidth: 11, font: { size: 11 } } } }
    }
  });

  const tueToFri = dowHotel[1] + dowHotel[2] + dowHotel[3] + dowHotel[4];
  const hotelTot = dowHotel.reduce((a, b) => a + b, 0);
  const peakDowIdx = dowHotel.indexOf(Math.max(...dowHotel));
  const dowLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  document.getElementById("dowInsight").textContent =
    `${((tueToFri / Math.max(1, hotelTot)) * 100).toFixed(1)}% of hotel events start Tue–Fri (peak ${dowLabels[peakDowIdx]}: ${fmt(dowHotel[peakDowIdx])}); citywide skews Fri–Sun.`;

  if (charts.dow) charts.dow.destroy();
  charts.dow = new Chart(document.getElementById("dowChart"), {
    type: "bar",
    data: {
      labels: dowLabels,
      datasets: [
        { label: "In-Hotel (MICE)", data: dowHotel, backgroundColor: "#2563eb" },
        { label: "Non-Hotel (Citywide)", data: dowNon, backgroundColor: "#f59e0b" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textCol } } },
      scales: {
        x: { ticks: { color: textCol }, grid: { color: gridCol } },
        y: { ticks: { color: textCol }, grid: { color: gridCol } }
      }
    }
  });

  const pairedVerts = VERTICAL_RULES.map((r, i) => ({ label: r.label, count: vertCounts[i] }))
    .sort((a, b) => b.count - a.count);

  if (charts.vertical) charts.vertical.destroy();
  charts.vertical = new Chart(document.getElementById("verticalChart"), {
    type: "bar",
    data: {
      labels: pairedVerts.map(v => v.label),
      datasets: [{
        label: "Events",
        data: pairedVerts.map(v => v.count),
        backgroundColor: "#8b5cf6"
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textCol }, grid: { color: gridCol } },
        y: { ticks: { color: textCol, font: { size: 11 } }, grid: { color: gridCol } }
      }
    }
  });

  renderPeakDays();
  renderDurationBreakdown();
}

window.renderPeakDays = function () {
  const scope = document.getElementById("peakScope").value;
  const activeByDay = new Map();

  EVENTS.forEach(ev => {
    if (scope === "downtown" && !String(ev.area || "").includes("Downtown")) return;
    let cur = new Date(ev.start + "T00:00:00");
    const end = new Date(ev.end + "T00:00:00");
    let guard = 0;
    while (cur <= end && guard < 120) {
      const iso = cur.toISOString().slice(0, 10);
      let bucket = activeByDay.get(iso);
      if (!bucket) {
        bucket = [];
        activeByDay.set(iso, bucket);
      }
      bucket.push(ev);
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
  });

  const sorted = Array.from(activeByDay.entries())
    .map(([day, list]) => ({ day, list: list.sort((a, b) => (b.att || 0) - (a.att || 0)) }))
    .sort((a, b) => b.list.length - a.list.length || b.day.localeCompare(a.day));

  const ge6 = sorted.filter(x => x.list.length >= 6).length;
  const ge10 = sorted.filter(x => x.list.length >= 10).length;
  document.getElementById("peakSummary").textContent =
    `${fmt(ge6)} days with ≥6 concurrent events · ${fmt(ge10)} days reaching ≥10 events`;

  document.getElementById("peakDaysList").innerHTML = sorted.slice(0, 6).map((item, idx) => {
    const names = item.list.slice(0, 3).map(e => esc(e.name)).join(" · ");
    const extra = item.list.length > 3 ? ` (+${item.list.length - 3})` : "";
    const color = idx === 0 ? "#dc2626" : (idx === 1 ? "#d97706" : "var(--blue)");
    return `<div class="peak-item">
      <div><b style="color:${color};">${item.day}</b> — ${names}${extra}</div>
      <span class="peak-count">${item.list.length} events</span>
    </div>`;
  }).join("");
};

function renderDurationBreakdown() {
  const buckets = [
    { key: "2-3", label: "2–3 days (Core MICE conferences, tournaments, competitions)", count: 0, color: "#2563eb" },
    { key: "1", label: "1 day (Single-day workshops, galas, arena concerts)", count: 0, color: "#64748b" },
    { key: "4-7", label: "4–7 days (International congresses, major trade shows)", count: 0, color: "#9333ea" },
    { key: "8+", label: "8+ days (Citywide festivals: TIFF, CNE, AutoShow)", count: 0, color: "#0f766e" }
  ];
  let multiH = 0, multiNH = 0;

  EVENTS.forEach(ev => {
    const days = getEventDays(ev);
    if (days === 1) buckets[1].count++;
    else if (days <= 3) buckets[0].count++;
    else if (days <= 7) buckets[2].count++;
    else buckets[3].count++;

    if (days >= 2) {
      if (ev.hotel) multiH++;
      else multiNH++;
    }
  });

  const tot = Math.max(1, EVENTS.length);
  const multiTot = multiH + multiNH;
  document.getElementById("durationSummary").textContent =
    `${((multiTot / tot) * 100).toFixed(1)}% span ≥2 days (${fmt(multiH)} in-hotel, ${fmt(multiNH)} citywide)`;

  document.getElementById("durationBars").innerHTML = buckets.map(b => {
    const pct = ((b.count / tot) * 100).toFixed(1);
    return `<div class="bar-row">
      <div class="bar-row-head">
        <span>${esc(b.label)}</span>
        <span style="font-weight:700;color:${b.color};">${fmt(b.count)} events (${pct}%)</span>
      </div>
      <div class="bar-track" style="height:10px;"><div class="bar-fill" style="width:${pct}%;background:${b.color}"></div></div>
    </div>`;
  }).join("");
}

/* ============================================================================
 * TAB 4: EVENT EXPLORER (FULL SEARCH & PAGINATED TABLE)
 * ============================================================================ */

function populateExplorerFilters() {
  const yearCounts = {};
  const catCounts = {};
  const areaCounts = {};

  EVENTS.forEach(ev => {
    const y = (ev.start || "").slice(0, 4);
    if (y) yearCounts[y] = (yearCounts[y] || 0) + 1;
    catCounts[ev.cat] = (catCounts[ev.cat] || 0) + 1;
    areaCounts[ev.area || "Toronto / GTA"] = (areaCounts[ev.area || "Toronto / GTA"] || 0) + 1;
  });

  const yrSel = document.getElementById("expYear");
  yrSel.innerHTML = `<option value="ALL">All Years (${fmt(EVENTS.length)})</option>` +
    Object.keys(yearCounts).sort().map(y => `<option value="${y}">${y} (${fmt(yearCounts[y])})</option>`).join("");

  const hEvents = EVENTS.filter(e => e.hotel).length;
  document.getElementById("expHotel").innerHTML =
    `<option value="ALL">All Venues (${fmt(EVENTS.length)})</option>` +
    `<option value="1">Hotel Venues (${fmt(hEvents)})</option>` +
    `<option value="0">Non-Hotel Venues (${fmt(EVENTS.length - hEvents)})</option>`;

  document.getElementById("expCat").innerHTML =
    `<option value="ALL">All Categories (${CAT_KEYS.length})</option>` +
    CAT_KEYS.map(c => `<option value="${c}">${esc(CAT_SHORT[c])} (${fmt(catCounts[c] || 0)})</option>`).join("");

  document.getElementById("expArea").innerHTML =
    `<option value="ALL">All Areas (${Object.keys(areaCounts).length})</option>` +
    Object.entries(areaCounts).sort((a, b) => b[1] - a[1]).map(([a, n]) =>
      `<option value="${esc(a)}">${esc(a)} (${fmt(n)})</option>`
    ).join("");
}

window.resetExplorerPageAndRender = function () {
  explorerPage = 1;
  renderExplorer();
};

window.changeExplorerPage = function (delta) {
  const maxPage = Math.max(1, Math.ceil(FILTERED_EXPLORER.length / PAGE_SIZE));
  explorerPage = Math.min(maxPage, Math.max(1, explorerPage + delta));
  renderExplorerPageOnly();
};

window.renderExplorer = function () {
  const q = (document.getElementById("expSearch").value || "").trim().toLowerCase();
  const yr = document.getElementById("expYear").value;
  const hFlag = document.getElementById("expHotel").value;
  const cat = document.getElementById("expCat").value;
  const area = document.getElementById("expArea").value;

  syncSortHeaderUI("#explorerTable th[data-exp-sort]", "data-exp-sort", explorerSort);
  const isNum = explorerSort.key === "att";

  FILTERED_EXPLORER = EVENTS.filter(ev => {
    if (yr !== "ALL" && !(ev.start || "").startsWith(yr)) return false;
    if (hFlag !== "ALL" && (ev.hotel ? "1" : "0") !== hFlag) return false;
    if (cat !== "ALL" && ev.cat !== cat) return false;
    if (area !== "ALL" && (ev.area || "Toronto / GTA") !== area) return false;
    if (q) {
      const hay = `${ev.name} ${ev.venue} ${ev.hn || ""} ${ev.area} ${ev.note || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const getVal = e => {
      if (explorerSort.key === "att") return e.att ?? e.exp ?? e.act ?? null;
      if (explorerSort.key === "cat") return CAT_SHORT[e.cat] || e.cat;
      return e[explorerSort.key];
    };
    return compareSortValues(getVal(a), getVal(b), explorerSort.dir, isNum) || (a.start || "").localeCompare(b.start || "");
  });

  renderExplorerPageOnly();
};

function renderExplorerPageOnly() {
  const total = FILTERED_EXPLORER.length;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (explorerPage > maxPage) explorerPage = maxPage;

  const start = (explorerPage - 1) * PAGE_SIZE;
  const slice = FILTERED_EXPLORER.slice(start, start + PAGE_SIZE);

  document.getElementById("expCountLabel").textContent =
    total === 0
      ? "No matching events found"
      : `Found ${fmt(total)} events (showing ${fmt(start + 1)}–${fmt(start + slice.length)})`;
  document.getElementById("expPageLabel").textContent = `Page ${explorerPage} / ${maxPage}`;
  document.getElementById("expPrevBtn").disabled = explorerPage <= 1;
  document.getElementById("expNextBtn").disabled = explorerPage >= maxPage;

  document.getElementById("explorerTableBody").innerHTML = slice.map(ev => {
    const dateStr = ev.start === ev.end ? ev.start : `${ev.start} → ${ev.end.slice(5)}`;
    const hBadge = ev.hotel ? `<span class="tag-hotel">Hotel</span>` : "";
    const histBadge = ev.hist ? `<span class="tag-hist">Past</span>` : "";
    const srcUrl = ev.url || (Array.isArray(ev.urls) && ev.urls[0]) || "";
    const linkHtml = srcUrl ? `<a class="mini-link" href="${esc(srcUrl)}" target="_blank" rel="noopener">Open ↗</a>` : "—";
    const qMap = encodeURIComponent(ev.name);
    return `<tr>
      <td style="font-family:ui-monospace,monospace;white-space:nowrap;">${esc(dateStr)}</td>
      <td style="font-weight:600;">${hBadge}${esc(ev.name)}${histBadge}</td>
      <td>${esc(ev.venue)}</td>
      <td style="color:var(--muted);white-space:nowrap;">${esc(ev.area)}</td>
      <td><span class="cat-pill" style="background:${CAT_COLORS[ev.cat] || "#475569"}">${esc(CAT_SHORT[ev.cat] || ev.cat)}</span></td>
      <td class="num" style="font-family:ui-monospace,monospace;">${esc(getAttendeeDisplay(ev))}</td>
      <td class="center">${linkHtml}</td>
      <td class="center"><a class="btn-mini" href="index.html?q=${qMap}&all=1">📍 Map</a></td>
    </tr>`;
  }).join("");
}
