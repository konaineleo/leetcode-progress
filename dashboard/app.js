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
    container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted);">No verified public badges.</p>`;
    return;
  }

  badges.forEach((b) => {
    let icon = b.icon || "";
    if (icon && !icon.startsWith("http")) icon = `https://leetcode.com${icon}`;

    const div = document.createElement("div");
    div.className = "badge-item";
    div.innerHTML = `
      <img src="${icon}" alt="${b.displayName}">
      <div class="badge-name">${b.displayName}</div>
      <div class="badge-date">${b.creationDate || "Earned"}</div>
    `;
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

// Heatmap generator (52 weeks x 7 days)
function renderHeatmap(submissionCalendar) {
  const wrapper = document.getElementById("heatmapWrapper");
  if (!wrapper) return;
  wrapper.innerHTML = "";

  // Parse submission count mapping by ISO YYYY-MM-DD
  const countMap = {};
  for (const [ts, count] of Object.entries(submissionCalendar)) {
    const d = new Date(parseInt(ts, 10) * 1000);
    const key = d.toISOString().split("T")[0];
    countMap[key] = count;
  }

  // Calculate past 52 weeks (364 days) up to today
  const today = new Date();
  const days = [];
  for (let i = 363; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  const cellSize = 11;
  const cellGap = 3;
  const numWeeks = 53;
  const width = numWeeks * (cellSize + cellGap) + 30;
  const height = 7 * (cellSize + cellGap) + 20;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", height);
  svg.classList.add("heatmap-svg");

  const tooltip = document.getElementById("custom-tooltip");

  // Get color scale from CSS variables
  const computedStyle = getComputedStyle(document.documentElement);
  const emptyColor = computedStyle.getPropertyValue("--heat-empty").trim() || "rgba(55,0,49,0.5)";
  const lvl1Color = computedStyle.getPropertyValue("--heat-lvl1").trim() || "#5A0E38";
  const lvl2Color = computedStyle.getPropertyValue("--heat-lvl2").trim() || "#832232";
  const lvl3Color = computedStyle.getPropertyValue("--heat-lvl3").trim() || "#CE8964";
  const lvl4Color = computedStyle.getPropertyValue("--heat-lvl4").trim() || "#EAF27C";

  function getLevelColor(count) {
    if (!count || count === 0) return emptyColor;
    if (count <= 2) return lvl1Color;
    if (count <= 5) return lvl2Color;
    if (count <= 10) return lvl3Color;
    return lvl4Color;
  }

  // Render cells column by column (weeks)
  let currentWeek = 0;
  days.forEach((day) => {
    const dayOfWeek = day.getDay(); // 0 is Sunday
    const dateKey = day.toISOString().split("T")[0];
    const count = countMap[dateKey] || 0;

    const x = currentWeek * (cellSize + cellGap) + 20;
    const y = dayOfWeek * (cellSize + cellGap);

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", cellSize);
    rect.setAttribute("height", cellSize);
    rect.setAttribute("fill", getLevelColor(count));
    rect.classList.add("heat-cell");
    rect.setAttribute("tabindex", "0");

    rect.addEventListener("mouseenter", (e) => {
      tooltip.style.display = "block";
      tooltip.innerHTML = `<strong>${count} submissions</strong> on ${dateKey}`;
      tooltip.style.left = `${e.clientX + 10}px`;
      tooltip.style.top = `${e.clientY - 30}px`;
    });

    rect.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });

    svg.appendChild(rect);

    if (dayOfWeek === 6) {
      currentWeek++;
    }
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
  initNavigation();
  initSearch();
  initRefresh();
  loadDashboardData();
});
