/**
 * LeetCode Dashboard Application Logic
 * Supports dual-theme switching (persisted), real-time GraphQL API proxy consumption,
 * interactive SVG contribution heatmap, SVG contest rating curve, and navigation.
 */

const USERNAME = "smkyuzarsif";
let profileData = null;

// Initialize Theme
function initTheme() {
  const savedTheme = localStorage.getItem("lc_theme") || "dark";
  setTheme(savedTheme);

  const toggleBtn = document.getElementById("themeToggleBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      setTheme(newTheme);
    });
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("lc_theme", theme);

  const icon = document.getElementById("themeIcon");
  const text = document.getElementById("themeText");
  if (icon && text) {
    if (theme === "dark") {
      icon.textContent = "☀️";
      text.textContent = "Light";
    } else {
      icon.textContent = "🌙";
      text.textContent = "Dark";
    }
  }

  // Redraw charts if data already exists
  if (profileData) {
    renderHeatmap(profileData.submissionCalendar);
    renderContestChart(profileData.contestHistory);
  }
}

// Avatar: if the remote image cannot load, swap in a local initial instead of a broken-image icon
function initAvatarFallback() {
  const avatar = document.getElementById("userAvatar");
  if (!avatar) return;
  const letter = (USERNAME[0] || "?").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="#1E3A8A"/><text x="48" y="62" font-size="44" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>`;
  const fallbackSrc = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  const apply = () => { if (avatar.src !== fallbackSrc) avatar.src = fallbackSrc; };
  avatar.addEventListener("error", apply);
  if (avatar.complete && avatar.naturalWidth === 0) apply(); // already failed before the listener attached
}

// Fetch Profile Data
async function loadDashboardData(forceRefresh = false) {
  const endpoint = forceRefresh ? "/api/refresh" : "/api/profile";
  const method = forceRefresh ? "POST" : "GET";
  const lastSyncedEl = document.getElementById("lastSyncedText");
  if (lastSyncedEl) lastSyncedEl.textContent = "Fetching live statistics...";

  try {
    const res = await fetch(endpoint, { method });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    profileData = data;
    renderDashboard(data);
  } catch (err) {
    console.warn("API server fetch failed, trying local fallback:", err);
    // Graceful fallback: attempt loading ../data/progress.json
    try {
      const fb = await fetch("/data/progress.json");
      if (fb.ok) {
        const local = await fb.json();
        const latest = local.latest || {};
        profileData = {
          username: latest.username || USERNAME,
          realName: latest.realName || "SMK",
          avatar: "https://assets.leetcode.com/users/29X1HZdSYm/avatar_1751726856.png",
          ranking: latest.ranking,
          totalSolved: latest.totalSolved || 391,
          easySolved: latest.easySolved || 212,
          mediumSolved: latest.mediumSolved || 161,
          hardSolved: latest.hardSolved || 18,
          contestRating: latest.contestRating || 1530.99,
          contestRanking: latest.contestRanking || 323721,
          contestsAttended: latest.contestsAttended || 22,
          contestHistory: [],
          submissionCalendar: latest.submissionCalendar || {},
          badges: latest.badges || [],
          languages: [{ languageName: "Java", problemsSolved: 385 }, { languageName: "MySQL", problemsSolved: 6 }],
          currentStreak: 1,
          maxStreak: 144,
          lastSynced: latest.lastUpdated ? new Date(latest.lastUpdated).toUTCString() : "Live Cached",
        };
        renderDashboard(profileData);
        return;
      }
    } catch (e2) {
      console.error("Local fallback also failed:", e2);
    }

    if (lastSyncedEl) lastSyncedEl.textContent = "Offline / API unavailable. Check proxy server.";
  }
}

// Render Dashboard Data
function renderDashboard(data) {
  // Profile banner
  const avatar = document.getElementById("userAvatar");
  if (avatar && data.avatar) avatar.src = data.avatar;

  const realName = document.getElementById("userRealName");
  if (realName) realName.textContent = data.realName || data.username;

  const usernameEl = document.getElementById("profileUsername");
  if (usernameEl) usernameEl.textContent = data.username;

  const ratingEl = document.getElementById("profileRating");
  if (ratingEl) ratingEl.textContent = data.contestRating || "Unrated";

  const lastSynced = document.getElementById("lastSyncedText");
  if (lastSynced) lastSynced.textContent = `Last synced: ${data.lastSynced}`;

  // Stat metrics
  const totalEl = document.getElementById("statTotalSolved");
  if (totalEl) totalEl.textContent = data.totalSolved;

  const contestRateEl = document.getElementById("statContestRating");
  if (contestRateEl) contestRateEl.textContent = data.contestRating || "N/A";

  const contestRankEl = document.getElementById("statContestRank");
  if (contestRankEl) contestRankEl.textContent = data.contestRanking ? `Rank #${data.contestRanking.toLocaleString()}` : "Unranked";

  const globalRankEl = document.getElementById("statGlobalRank");
  if (globalRankEl) globalRankEl.textContent = data.ranking ? `#${data.ranking.toLocaleString()}` : "N/A";

  const contestsCountEl = document.getElementById("statContestsAttended");
  if (contestsCountEl) contestsCountEl.textContent = data.contestsAttended || 0;

  // Donut and Progress Bars
  const donutTotal = document.getElementById("donutTotal");
  if (donutTotal) donutTotal.textContent = data.totalSolved;

  const easyPct = ((data.easySolved / data.totalSolved) * 100).toFixed(1);
  const medPct = ((data.mediumSolved / data.totalSolved) * 100).toFixed(1);
  const hardPct = ((data.hardSolved / data.totalSolved) * 100).toFixed(1);

  document.getElementById("progEasyCount").textContent = data.easySolved;
  document.getElementById("progEasyPct").textContent = `${easyPct}%`;
  document.getElementById("progEasyFill").style.width = `${easyPct}%`;

  document.getElementById("progMedCount").textContent = data.mediumSolved;
  document.getElementById("progMedPct").textContent = `${medPct}%`;
  document.getElementById("progMedFill").style.width = `${medPct}%`;

  document.getElementById("progHardCount").textContent = data.hardSolved;
  document.getElementById("progHardPct").textContent = `${hardPct}%`;
  document.getElementById("progHardFill").style.width = `${hardPct}%`;

  // Streaks
  document.getElementById("streakCurrent").innerHTML = `${data.currentStreak} <span style="font-size: 1rem;">days</span>`;
  document.getElementById("streakMax").innerHTML = `${data.maxStreak} <span style="font-size: 1rem;">days</span>`;

  // Badges
  renderBadges(data.badges || []);

  // Languages
  renderLanguages(data.languages || []);

  // Visual Heatmap
  renderHeatmap(data.submissionCalendar || {});

  // Contest Rating Chart
  renderContestChart(data.contestHistory || []);
}

function renderBadges(badges) {
  const container = document.getElementById("badgesContainer");
  if (!container) return;
  container.innerHTML = "";

  if (!badges || badges.length === 0) {
    const p = document.createElement("p");
    p.style.cssText = "font-size:0.85rem;color:var(--text-muted);";
    p.textContent = "No verified public badges.";
    container.appendChild(p);
    return;
  }

  badges.forEach((b) => {
    let icon = b.icon || "";
    if (icon && !icon.startsWith("http")) icon = `https://leetcode.com${icon}`;

    const div = document.createElement("div");
    div.className = "badge-item";

    const mark = document.createElement("div");
    mark.className = "badge-mark";
    const fallback = () => {
      // Neutral text mark: never a broken-image icon, never a fake LeetCode badge.
      mark.className = "badge-mark badge-mark-text";
      mark.textContent = "★";
    };
    if (icon) {
      const img = document.createElement("img");
      img.alt = b.displayName || "Badge";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => { img.remove(); fallback(); });
      img.src = icon;
      mark.appendChild(img);
    } else {
      fallback();
    }

    const name = document.createElement("div");
    name.className = "badge-name";
    name.textContent = b.displayName || "Badge";
    const date = document.createElement("div");
    date.className = "badge-date";
    date.textContent = b.creationDate || "Earned";

    div.append(mark, name, date);
    container.appendChild(div);
  });
}

function renderLanguages(languages) {
  const container = document.getElementById("languagesList");
  if (!container) return;
  container.innerHTML = "";

  if (!languages || languages.length === 0) {
    container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted);">Language statistics private.</p>`;
    return;
  }

  const total = languages.reduce((acc, l) => acc + l.problemsSolved, 0);

  languages.forEach((lang) => {
    const pct = total ? ((lang.problemsSolved / total) * 100).toFixed(1) : 0;
    const row = document.createElement("div");
    row.style.marginBottom = "14px";
    row.innerHTML = `
      <div class="lang-row">
        <span><strong>${lang.languageName}</strong></span>
        <span>${lang.problemsSolved} solved (${pct}%)</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${pct}%; background: var(--accent-warm);"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Heatmap (Last 52 Weeks): royal-blue scale, real month labels, UTC-correct dates
// ---------------------------------------------------------------------------
// Single source of truth for intensity. Thresholds are monotonic, so a higher
// submission count can never map to a darker shade.
const HEAT_LEVELS = [
  { level: 0, min: 0,  label: "No activity", cls: "heat-l0" }, // #111827
  { level: 1, min: 1,  label: "Low",         cls: "heat-l1" }, // #1E3A8A  1-2
  { level: 2, min: 3,  label: "Moderate",    cls: "heat-l2" }, // #1D4ED8  3-5
  { level: 3, min: 6,  label: "High",        cls: "heat-l3" }, // #2563EB  6-10
  { level: 4, min: 11, label: "Very high",   cls: "heat-l4" }, // #60A5FA  11+
];

function heatLevel(count) {
  let lvl = 0;
  for (const l of HEAT_LEVELS) if (count >= l.min) lvl = l.level;
  return lvl;
}

const HEAT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HEAT_MIN_LABEL_GAP = 3; // columns between month labels (3 * 15 = 45 units for a ~20 unit label)

function utcKey(d) {
  return d.toISOString().slice(0, 10);
}

function fmtHeatDate(d) {
  return `${HEAT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function renderHeatmapLegend() {
  const legend = document.getElementById("heatmapLegend");
  if (!legend) return;
  legend.innerHTML = "";
  const mk = (cls, label) => {
    const item = document.createElement("div");
    item.style.cssText = "display:flex;align-items:center;gap:4px;";
    const sw = document.createElement("div");
    sw.className = `legend-swatch ${cls}`;
    const t = document.createElement("span");
    t.textContent = label;
    item.append(sw, t);
    return item;
  };
  const title = document.createElement("span");
  title.style.fontWeight = "600";
  title.textContent = "Activity:";
  legend.appendChild(title);
  HEAT_LEVELS.forEach((l) => legend.appendChild(mk(l.cls, l.label)));
  legend.appendChild(mk("heat-missing", "No data"));
}

function renderHeatmap(submissionCalendar) {
  const wrapper = document.getElementById("heatmapWrapper");
  if (!wrapper) return;
  wrapper.innerHTML = "";
  renderHeatmapLegend();

  // LeetCode keys are UTC-midnight unix timestamps. Everything below uses UTC
  // so a viewer in any timezone sees the same date -> count pairing.
  const countMap = {};
  const hasData = !!submissionCalendar && Object.keys(submissionCalendar).length > 0;
  if (hasData) {
    for (const [ts, count] of Object.entries(submissionCalendar)) {
      countMap[utcKey(new Date(parseInt(ts, 10) * 1000))] = Number(count) || 0;
    }
  }

  // 364 days ending today (UTC), laid out in Sunday-start week columns.
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = [];
  for (let i = 363; i >= 0; i--) days.push(new Date(todayUtc - i * 86400000));

  const rangeEl = document.getElementById("heatmapRange");
  if (rangeEl) rangeEl.textContent = `${fmtHeatDate(days[0])} – ${fmtHeatDate(days[days.length - 1])}`;

  const cellSize = 12;
  const cellGap = 3;
  const step = cellSize + cellGap;
  const leftPad = 28; // weekday labels
  const topPad = 22;  // month labels
  const numWeeks = 53;
  const width = leftPad + numWeeks * step + 10;
  const height = topPad + 7 * step + 10;

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", height);
  // Never shrink below natural size: the container scrolls instead, so month
  // labels cannot collide on narrow screens.
  svg.style.minWidth = `${width}px`;
  svg.classList.add("heatmap-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Submission heatmap for the last 52 weeks");

  const tooltip = document.getElementById("custom-tooltip");

  [["Mon", 1], ["Wed", 3], ["Fri", 5]].forEach(([label, row]) => {
    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", 4);
    text.setAttribute("y", topPad + row * step + 9);
    text.setAttribute("class", "heat-day-label");
    text.textContent = label;
    svg.appendChild(text);
  });

  // Month labels come from the same column index the cells use.
  const candidates = [];
  let col = 0;
  days.forEach((day, i) => {
    const dow = day.getUTCDay(); // 0 = Sunday
    const key = utcKey(day);
    const count = hasData ? (countMap[key] || 0) : null;

    if (day.getUTCDate() === 1) {
      candidates.push({ col, month: day.getUTCMonth(), year: day.getUTCFullYear() });
    } else if (i === 0) {
      // Partial first month: label it only if the next month start leaves room
      candidates.push({ col, month: day.getUTCMonth(), year: day.getUTCFullYear(), partial: true });
    }

    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", leftPad + col * step);
    rect.setAttribute("y", topPad + dow * step);
    rect.setAttribute("width", cellSize);
    rect.setAttribute("height", cellSize);
    rect.setAttribute("class", `heat-cell ${count === null ? "heat-missing" : HEAT_LEVELS[heatLevel(count)].cls}`);
    rect.setAttribute("tabindex", "0");
    rect.setAttribute("data-date", key);
    rect.setAttribute("data-count", count === null ? "" : count);
    rect.setAttribute("data-level", count === null ? "unavailable" : heatLevel(count));

    const countLabel = count === null
      ? "Data unavailable"
      : count === 0 ? "No submissions" : `${count} submission${count > 1 ? "s" : ""}`;
    rect.setAttribute("aria-label", `${countLabel} on ${key}`);

    const show = (e) => {
      if (!tooltip) return;
      tooltip.style.display = "block";
      tooltip.innerHTML = `<strong>${countLabel}</strong> on ${key}`;
      tooltip.style.left = `${e.clientX + 10}px`;
      tooltip.style.top = `${e.clientY - 30}px`;
    };
    rect.addEventListener("mouseenter", show);
    rect.addEventListener("mousemove", show);
    rect.addEventListener("mouseleave", () => { if (tooltip) tooltip.style.display = "none"; });
    svg.appendChild(rect);

    if (dow === 6) col++;
  });

  // Drop labels that would overlap the previous kept one; a partial first
  // month yields to the real month start that follows it.
  const kept = [];
  candidates.forEach((c, idx) => {
    const next = candidates[idx + 1];
    if (c.partial && next && next.col - c.col < HEAT_MIN_LABEL_GAP) return;
    const prev = kept[kept.length - 1];
    if (prev && c.col - prev.col < HEAT_MIN_LABEL_GAP) return;
    kept.push(c);
  });

  kept.forEach((c) => {
    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", leftPad + c.col * step);
    text.setAttribute("y", 13);
    text.setAttribute("class", "heat-month-label");
    text.setAttribute("data-month", `${c.year}-${String(c.month + 1).padStart(2, "0")}`);
    text.textContent = HEAT_MONTHS[c.month];
    svg.appendChild(text);
  });

  wrapper.appendChild(svg);
}

// Contest Rating Chart generator
function renderContestChart(contestHistory) {
  const svg = document.getElementById("contestChartSvg");
  if (!svg) return;
  svg.innerHTML = "";

  if (!contestHistory || contestHistory.length === 0) {
    svg.innerHTML = `
      <text x="50%" y="50%" text-anchor="middle" fill="var(--text-muted)" font-size="13">
        Contest history is currently private or unrated.
      </text>
    `;
    return;
  }

  const validEntries = contestHistory.filter((c) => c.rating);
  if (validEntries.length < 2) {
    svg.innerHTML = `
      <text x="50%" y="50%" text-anchor="middle" fill="var(--text-muted)" font-size="13">
        Not enough contest rounds to display trend.
      </text>
    `;
    return;
  }

  const ratings = validEntries.map((c) => c.rating);
  const minRating = Math.floor(Math.min(...ratings) - 20);
  const maxRating = Math.ceil(Math.max(...ratings) + 20);

  const rect = svg.getBoundingClientRect();
  const width = rect.width || 600;
  const height = 200;
  const padding = { top: 20, right: 30, bottom: 30, left: 45 };

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Scales
  const getX = (idx) => padding.left + (idx / (validEntries.length - 1)) * chartW;
  const getY = (rating) => padding.top + chartH - ((rating - minRating) / (maxRating - minRating)) * chartH;

  const tooltip = document.getElementById("custom-tooltip");
  const computedStyle = getComputedStyle(document.documentElement);
  const strokeColor = computedStyle.getPropertyValue("--accent-lime").trim() || "#EAF27C";
  const gridColor = computedStyle.getPropertyValue("--border-subtle").trim() || "rgba(255,255,255,0.1)";

  // Draw Grid lines
  for (let step = minRating; step <= maxRating; step += 40) {
    const yPos = getY(step);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", padding.left);
    line.setAttribute("x2", width - padding.right);
    line.setAttribute("y1", yPos);
    line.setAttribute("y2", yPos);
    line.setAttribute("stroke", gridColor);
    line.setAttribute("stroke-dasharray", "3 3");
    svg.appendChild(line);

    const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", padding.left - 8);
    txt.setAttribute("y", yPos + 4);
    txt.setAttribute("text-anchor", "end");
    txt.setAttribute("fill", "var(--text-muted)");
    txt.setAttribute("font-size", "10");
    txt.textContent = Math.round(step);
    svg.appendChild(txt);
  }

  // Generate Path
  let pathD = `M ${getX(0)} ${getY(validEntries[0].rating)}`;
  for (let i = 1; i < validEntries.length; i++) {
    pathD += ` L ${getX(i)} ${getY(validEntries[i].rating)}`;
  }

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", strokeColor);
  path.setAttribute("stroke-width", "2.5");
  path.setAttribute("stroke-linecap", "round");
  svg.appendChild(path);

  // Dots with Tooltips
  validEntries.forEach((c, i) => {
    const cx = getX(i);
    const cy = getY(c.rating);

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", 4);
    circle.setAttribute("fill", strokeColor);
    circle.setAttribute("stroke", "var(--bg-primary)");
    circle.setAttribute("stroke-width", "1.5");
    circle.style.cursor = "pointer";

    circle.addEventListener("mouseenter", (e) => {
      tooltip.style.display = "block";
      tooltip.innerHTML = `
        <strong>${c.title}</strong><br/>
        Rating: <strong>${c.rating}</strong><br/>
        Rank: #${c.ranking ? c.ranking.toLocaleString() : "N/A"}<br/>
        Solved: ${c.problemsSolved}/${c.totalProblems}
      `;
      tooltip.style.left = `${e.clientX + 10}px`;
      tooltip.style.top = `${e.clientY - 40}px`;
    });

    circle.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });

    svg.appendChild(circle);
  });
}

// Navigation Handler
function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const mainDash = document.getElementById("mainDashboardView");
  const placeholderView = document.getElementById("placeholderView");
  const placeholderTitle = document.getElementById("placeholderTitle");

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");

      const page = item.getAttribute("data-page");
      if (page === "dashboard") {
        mainDash.style.display = "grid";
        placeholderView.style.display = "none";
      } else {
        mainDash.style.display = "none";
        placeholderView.style.display = "grid";
        placeholderTitle.textContent = item.textContent.trim();
      }
    });
  });
}

window.showDashboard = function () {
  document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("active"));
  document.querySelector('.nav-item[data-page="dashboard"]').classList.add("active");
  document.getElementById("mainDashboardView").style.display = "grid";
  document.getElementById("placeholderView").style.display = "none";
};

// Search handling
function initSearch() {
  const search = document.getElementById("searchInput");
  if (search) {
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && search.value.trim()) {
        const query = encodeURIComponent(search.value.trim());
        window.open(`https://leetcode.com/problemset/all/?search=${query}`, "_blank");
      }
    });
  }
}

// Refresh button
function initRefresh() {
  const btn = document.getElementById("refreshBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      loadDashboardData(true);
    });
  }
}

// On Page Load
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initAvatarFallback();
  initNavigation();
  initSearch();
  initRefresh();
  loadDashboardData();
});
