"""
LeetCode Progress Tracker (Standard Library Edition - Zero Dependencies)
Fetches live statistics and activity from LeetCode public GraphQL API,
records history, scans for locally categorized solutions, and regenerates
a sleek, modern portfolio-grade README.md and standalone Royal Blue SVG Heatmap.
"""

import os
import sys
import json
import ssl
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

LEETCODE_USERNAME = os.getenv("LEETCODE_USERNAME", "smkyuzarsif")
GITHUB_USERNAME = os.getenv("GITHUB_USERNAME", "konaineleo")
REPO_NAME = os.getenv("GITHUB_REPOSITORY", "konaineleo/leetcode-progress")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "progress.json")
SOLUTIONS_DIR = os.path.join(BASE_DIR, "solutions")
README_FILE = os.path.join(BASE_DIR, "README.md")
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
HEATMAP_SVG_FILE = os.path.join(ASSETS_DIR, "leetcode-heatmap.svg")

GRAPHQL_URL = "https://leetcode.com/graphql"

GRAPHQL_QUERY = """
query getUserStats($username: String!) {
  matchedUser(username: $username) {
    username
    profile {
      realName
      ranking
      reputation
    }
    submitStatsGlobal {
      acSubmissionNum {
        difficulty
        count
        submissions
      }
    }
    submissionCalendar
    badges {
      id
      displayName
      icon
      creationDate
    }
  }
  userContestRanking(username: $username) {
    attendedContestsCount
    rating
    globalRanking
    topPercentage
    badge {
      name
    }
  }
  recentAcSubmissionList(username: $username, limit: 15) {
    id
    title
    titleSlug
    timestamp
  }
}
"""


def fetch_leetcode_data(username: str) -> dict:
    headers = {
        "Content-Type": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": f"https://leetcode.com/{username}/",
    }
    payload = json.dumps({
        "query": GRAPHQL_QUERY,
        "variables": {"username": username},
    }).encode("utf-8")

    req = urllib.request.Request(GRAPHQL_URL, data=payload, headers=headers)
    ctx = ssl.create_default_context()

    try:
        with urllib.request.urlopen(req, context=ctx, timeout=15) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP Error {e.code}: {e.reason}")
    except Exception as e:
        raise RuntimeError(f"Network error querying LeetCode: {e}")

    if "errors" in result and not result.get("data"):
        raise RuntimeError(f"GraphQL Errors: {result['errors']}")

    data = result.get("data", {})
    matched_user = data.get("matchedUser")
    if not matched_user:
        raise ValueError(f"LeetCode user '{username}' not found or profile is private.")

    # Parse submission counts
    submit_stats = matched_user.get("submitStatsGlobal", {}).get("acSubmissionNum", [])
    counts = {"All": 0, "Easy": 0, "Medium": 0, "Hard": 0}
    for item in submit_stats:
        diff = item.get("difficulty")
        if diff in counts:
            counts[diff] = item.get("count", 0)

    # Parse contest details
    contest = data.get("userContestRanking") or {}
    contest_rating = contest.get("rating")
    contest_ranking = contest.get("globalRanking")
    contest_top_pct = contest.get("topPercentage")
    contests_attended = contest.get("attendedContestsCount", 0)

    # Parse submission calendar for streak calculation
    calendar_raw = matched_user.get("submissionCalendar") or "{}"
    if isinstance(calendar_raw, str):
        try:
            submission_calendar = json.loads(calendar_raw)
        except json.JSONDecodeError:
            submission_calendar = {}
    else:
        submission_calendar = calendar_raw

    # Badges
    badges = matched_user.get("badges") or []

    # Recent AC submissions
    recent_ac = data.get("recentAcSubmissionList") or []

    return {
        "username": username,
        "realName": matched_user.get("profile", {}).get("realName") or username,
        "ranking": matched_user.get("profile", {}).get("ranking"),
        "totalSolved": counts["All"],
        "easySolved": counts["Easy"],
        "mediumSolved": counts["Medium"],
        "hardSolved": counts["Hard"],
        "contestRating": round(contest_rating, 2) if contest_rating else None,
        "contestRanking": contest_ranking,
        "contestTopPercentage": contest_top_pct,
        "contestsAttended": contests_attended,
        "submissionCalendar": submission_calendar,
        "badges": badges,
        "recentAcSubmissions": recent_ac,
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
    }


def calculate_streak(submission_calendar: dict) -> tuple[int, int]:
    """Calculate current and max streak from LeetCode submissionCalendar timestamps."""
    if not submission_calendar:
        return 0, 0

    dates = set()
    for ts_str in submission_calendar.keys():
        try:
            ts = int(ts_str)
            dt = datetime.fromtimestamp(ts, tz=timezone.utc).date()
            dates.add(dt)
        except (ValueError, OSError):
            continue

    if not dates:
        return 0, 0

    sorted_dates = sorted(dates)

    max_streak = 0
    cur_streak = 0
    prev_date = None

    for d in sorted_dates:
        if prev_date is None:
            cur_streak = 1
        elif (d - prev_date).days == 1:
            cur_streak += 1
        elif (d - prev_date).days == 0:
            pass
        else:
            cur_streak = 1
        if cur_streak > max_streak:
            max_streak = cur_streak
        prev_date = d

    # Calculate active current streak relative to today
    today = datetime.now(timezone.utc).date()
    latest_date = sorted_dates[-1]

    if (today - latest_date).days <= 1:
        active_current_streak = 0
        target = latest_date
        while target in dates:
            active_current_streak += 1
            target -= timedelta(days=1)
    else:
        active_current_streak = 0

    return active_current_streak, max_streak


def generate_heatmap_svg(calendar_dict: dict) -> str:
    """Generates a high-contrast monochromatic Royal Blue submission heatmap SVG for GitHub READMEs."""
    count_map = {}
    for ts_str, count in calendar_dict.items():
        try:
            dt = datetime.fromtimestamp(int(ts_str), tz=timezone.utc).date()
            count_map[dt.isoformat()] = count
        except (ValueError, OSError):
            continue

    today = datetime.now(timezone.utc).date()
    days = [today - timedelta(days=i) for i in range(363, -1, -1)]

    cell_size = 12
    cell_gap = 3
    left_pad = 34
    top_pad = 28
    num_weeks = 53
    width = left_pad + num_weeks * (cell_size + cell_gap) + 14
    height = top_pad + 7 * (cell_size + cell_gap) + 40

    def get_color(count: int) -> str:
        if not count or count == 0:
            return "#111827"  # Zero submissions: near-black navy
        elif count <= 2:
            return "#1E3A8A"  # Low activity: deep royal blue
        elif count <= 5:
            return "#1D4ED8"  # Moderate activity: royal blue
        elif count <= 10:
            return "#2563EB"  # High activity: vivid blue
        else:
            return "#60A5FA"  # Very high activity: light electric blue

    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="100%" style="background-color: #0B0033; border: 1px solid #832232; border-radius: 14px; font-family: -apple-system, BlinkMacSystemFont, \'Lucida Sans\', \'Lucida Grande\', Segoe UI, sans-serif;">',
        "  <style>",
        "    .month-label { fill: #C8B9CC; font-size: 10px; font-weight: 600; }",
        "    .day-label { fill: #8E7A94; font-size: 9px; font-weight: 500; }",
        "    .legend-text { fill: #C8B9CC; font-size: 10px; font-weight: 500; }",
        "    .cell { rx: 2.5px; ry: 2.5px; stroke: rgba(30, 58, 138, 0.45); stroke-width: 0.75px; }",
        "  </style>",
    ]

    # Weekday labels
    for wd, row_idx in [("Mon", 1), ("Wed", 3), ("Fri", 5)]:
        y = top_pad + row_idx * (cell_size + cell_gap) + 9
        lines.append(f'  <text x="6" y="{y}" class="day-label">{wd}</text>')

    # Month labels calculation
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    last_month = -1
    month_labels = []

    current_week = 0
    for day in days:
        day_of_week = (day.weekday() + 1) % 7  # 0 is Sunday, 1 is Monday ...
        date_str = day.isoformat()
        count = count_map.get(date_str, 0)
        month = day.month - 1

        if day.day <= 7 and month != last_month and day_of_week == 1:
            month_labels.append((month_names[month], current_week))
            last_month = month

        x = left_pad + current_week * (cell_size + cell_gap)
        y = top_pad + day_of_week * (cell_size + cell_gap)
        fill = get_color(count)
        tip = f"{count} submission{'s' if count != 1 else ''} on {date_str}" if count > 0 else f"No submissions on {date_str}"
        lines.append(f'  <rect x="{x}" y="{y}" width="{cell_size}" height="{cell_size}" fill="{fill}" class="cell"><title>{tip}</title></rect>')

        if day_of_week == 6:
            current_week += 1

    # Render month labels along top
    for m_name, w_idx in month_labels:
        mx = left_pad + w_idx * (cell_size + cell_gap)
        lines.append(f'  <text x="{mx}" y="18" class="month-label">{m_name}</text>')

    # Legend at bottom right
    leg_y = top_pad + 7 * (cell_size + cell_gap) + 16
    lines.append(f'  <g transform="translate({width - 340}, {leg_y})">')
    lines.append('    <text x="0" y="10" class="legend-text" font-weight="bold">Activity:</text>')
    swatches = [
        ("No activity", "#111827", True),
        ("Low", "#1E3A8A", False),
        ("Moderate", "#1D4ED8", False),
        ("High", "#2563EB", False),
        ("Very high", "#60A5FA", False),
    ]
    cur_x = 55
    for label, col, has_border in swatches:
        border_attr = ' stroke="rgba(30, 58, 138, 0.6)" stroke-width="1"' if has_border else ""
        lines.append(f'    <rect x="{cur_x}" y="0" width="11" height="11" rx="2" fill="{col}"{border_attr}/>')
        lines.append(f'    <text x="{cur_x + 15}" y="9" class="legend-text">{label}</text>')
        cur_x += len(label) * 6 + 26
    lines.append("  </g>")

    lines.append("</svg>")
    return "\n".join(lines)


def load_previous_progress() -> dict:
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: Failed to load existing progress.json: {e}")
    return {
        "snapshots": [],
        "problems": {},
        "metadata": {
            "leetcode_username": LEETCODE_USERNAME,
            "github_username": GITHUB_USERNAME,
        },
    }


def scan_solutions(solutions_dir: str) -> list[dict]:
    """Scans solutions/ directory for any manually added or exported code files."""
    solutions = []
    if not os.path.exists(solutions_dir):
        return solutions

    valid_extensions = {".py", ".cpp", ".java", ".js", ".ts", ".go", ".rs", ".c", ".sql"}

    for root, _, files in os.walk(solutions_dir):
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext in valid_extensions:
                rel_path = os.path.relpath(os.path.join(root, f), BASE_DIR).replace("\\", "/")
                rel_dir = os.path.relpath(root, solutions_dir).replace("\\", "/")
                parts = [p for p in rel_dir.split("/") if p and p != "."]
                topic = parts[0] if parts else "General"
                diff = parts[1] if len(parts) > 1 else (parts[0] if parts[0] in ["Easy", "Medium", "Hard"] else "Unspecified")

                clean_title = os.path.splitext(f)[0].replace("-", " ").replace("_", " ").title()
                solutions.append({
                    "title": clean_title,
                    "filename": f,
                    "topic": topic,
                    "difficulty": diff,
                    "path": rel_path,
                })

    solutions.sort(key=lambda s: s["title"])
    return solutions


def update_progress_records(prev_data: dict, current_stats: dict) -> tuple[dict, bool]:
    """Updates snapshot history and checks if meaningful changes occurred."""
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    snapshots = prev_data.get("snapshots", [])
    today_snapshot_idx = -1
    for idx, snap in enumerate(snapshots):
        if snap.get("date") == today_str:
            today_snapshot_idx = idx
            break

    # Determine delta from yesterday
    prev_total = snapshots[-1]["totalSolved"] if snapshots else current_stats["totalSolved"]
    if today_snapshot_idx >= 0 and len(snapshots) > 1:
        prev_total = snapshots[-2]["totalSolved"]

    delta_solved = max(current_stats["totalSolved"] - prev_total, 0)

    current_snapshot = {
        "date": today_str,
        "totalSolved": current_stats["totalSolved"],
        "easySolved": current_stats["easySolved"],
        "mediumSolved": current_stats["mediumSolved"],
        "hardSolved": current_stats["hardSolved"],
        "ranking": current_stats["ranking"],
        "contestRating": current_stats["contestRating"],
        "deltaSolved": delta_solved,
    }

    has_changed = False
    if today_snapshot_idx >= 0:
        if snapshots[today_snapshot_idx] != current_snapshot:
            snapshots[today_snapshot_idx] = current_snapshot
            has_changed = True
    else:
        snapshots.append(current_snapshot)
        has_changed = True

    # Keep snapshots ordered and trimmed to last 60 records
    snapshots.sort(key=lambda s: s["date"])
    if len(snapshots) > 60:
        snapshots = snapshots[-60:]

    # Track any newly surfaced recent problems
    recorded_problems = prev_data.get("problems", {})
    for ac in current_stats.get("recentAcSubmissions", []):
        slug = ac.get("titleSlug")
        if slug and slug not in recorded_problems:
            recorded_problems[slug] = {
                "title": ac.get("title"),
                "solvedAt": datetime.fromtimestamp(int(ac.get("timestamp")), tz=timezone.utc).isoformat(),
            }
            has_changed = True

    prev_data["snapshots"] = snapshots
    prev_data["problems"] = recorded_problems
    prev_data["latest"] = current_stats

    return prev_data, has_changed


def generate_readme(data: dict, solutions: list[dict]) -> str:
    latest = data.get("latest", {})
    snapshots = data.get("snapshots", [])

    total_solved = latest.get("totalSolved", 0)
    easy_solved = latest.get("easySolved", 0)
    medium_solved = latest.get("mediumSolved", 0)
    hard_solved = latest.get("hardSolved", 0)
    global_ranking = latest.get("ranking", "N/A")
    contest_rating = latest.get("contestRating", "N/A")
    contest_ranking = latest.get("contestRanking", "N/A")
    contests_attended = latest.get("contestsAttended", 0)
    contest_top_pct = latest.get("contestTopPercentage")

    calendar = latest.get("submissionCalendar", {})
    current_streak, max_streak = calculate_streak(calendar)

    ranking_str = f"#{global_ranking:,}" if isinstance(global_ranking, int) else "N/A"
    contest_ranking_str = f"#{contest_ranking:,}" if isinstance(contest_ranking, int) else "N/A"
    top_pct_str = f"{contest_top_pct:.2f}%" if isinstance(contest_top_pct, (int, float)) else "N/A"
    updated_at = datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC")

    badges_list = latest.get("badges", [])

    lines = []
    # Decorative Header Wave
    lines.append("<div align=\"center\">\n")
    lines.append("  <img src=\"https://capsule-render.vercel.app/api?type=waving&color=0:0d001a,50:2d0057,100:5b21b6&height=120&section=header&text=LeetCode%20Journey&fontSize=38&fontColor=ffffff&fontAlignY=38\" width=\"100%\"/>\n")

    # Profile & Social Badges
    lines.append("  <br/>\n")
    lines.append(f"  <a href=\"https://leetcode.com/{LEETCODE_USERNAME}/\"><img src=\"https://img.shields.io/badge/LeetCode-{LEETCODE_USERNAME}-c084fc?style=for-the-badge&logo=leetcode&logoColor=0d001a&labelColor=5b21b6\" alt=\"LeetCode\"/></a>")
    lines.append(f"  <a href=\"https://github.com/{GITHUB_USERNAME}\"><img src=\"https://img.shields.io/badge/GitHub-{GITHUB_USERNAME}-c084fc?style=for-the-badge&logo=github&logoColor=0d001a&labelColor=5b21b6\" alt=\"GitHub\"/></a>")
    lines.append(f"  <img src=\"https://img.shields.io/badge/Global_Rank-{ranking_str}-a855f7?style=for-the-badge&labelColor=0d001a\" alt=\"Rank\"/>\n")
    lines.append("</div>\n")

    lines.append("---\n")

    # High-Contrast Stat Badges Row
    lines.append("## ⚡ LeetCode Progress\n")
    lines.append("<div align=\"center\">\n")
    lines.append(f"  <img src=\"https://img.shields.io/badge/Solved-{total_solved}-c084fc?style=for-the-badge&labelColor=0d001a\" alt=\"Solved\"/>")
    lines.append(f"  <img src=\"https://img.shields.io/badge/Easy-{easy_solved}-00b8a3?style=for-the-badge&labelColor=0d001a\" alt=\"Easy\"/>")
    lines.append(f"  <img src=\"https://img.shields.io/badge/Medium-{medium_solved}-ffc01e?style=for-the-badge&labelColor=0d001a\" alt=\"Medium\"/>")
    lines.append(f"  <img src=\"https://img.shields.io/badge/Hard-{hard_solved}-ef4743?style=for-the-badge&labelColor=0d001a\" alt=\"Hard\"/>")
    lines.append(f"  <img src=\"https://img.shields.io/badge/Rating-{contest_rating}-a855f7?style=for-the-badge&labelColor=0d001a\" alt=\"Rating\"/>\n")
    lines.append("  <br/><br/>\n")

    # Embedded High-Contrast Monochromatic Royal Blue Heatmap (Directly rendered in GitHub)
    lines.append("  <!-- Monochromatic Royal Blue Heatmap Generated Deterministically -->")
    lines.append(f"  <a href=\"https://leetcode.com/{LEETCODE_USERNAME}/\">")
    lines.append("    <img src=\"assets/leetcode-heatmap.svg\" alt=\"LeetCode Submission Heatmap (Royal Blue Scale)\" width=\"100%\"/>")
    lines.append("  </a>\n")
    lines.append("  <br/><br/>\n")

    # Contest Rating Dashboard Card
    lines.append("  <table border=\"0\" cellspacing=\"8\" cellpadding=\"0\">")
    lines.append("    <tr>")
    lines.append("      <td align=\"center\">")
    lines.append(f"        <a href=\"https://leetcode.com/{LEETCODE_USERNAME}/\">")
    lines.append(f"          <img src=\"https://leetcard.jacoblin.cool/{LEETCODE_USERNAME}?theme=dark&font=JetBrains+Mono&ext=contest&border=0&radius=12\" alt=\"Contest Rating Dashboard\"/>")
    lines.append("        </a>")
    lines.append("      </td>")
    lines.append("    </tr>")
    lines.append("  </table>\n")
    lines.append("</div>\n")

    lines.append("---\n")

    # GitHub Activity Grid
    lines.append("## 🐙 GitHub Contribution Grid\n")
    lines.append("<div align=\"center\">\n")
    lines.append("  <table border=\"0\" cellspacing=\"0\" cellpadding=\"16\" style=\"background-color: #05000a; border-radius: 12px;\">")
    lines.append("    <tr>")
    lines.append("      <td align=\"center\">")
    lines.append(f"        <a href=\"https://github.com/{GITHUB_USERNAME}\">")
    lines.append(f"          <img src=\"https://ghchart.rshah.org/a855f7/{GITHUB_USERNAME}\" alt=\"{GITHUB_USERNAME}'s GitHub Contribution Grid\"/>")
    lines.append("        </a>")
    lines.append("      </td>")
    lines.append("    </tr>")
    lines.append("  </table>\n")
    lines.append("</div>\n")

    lines.append("---\n")

    # Summary Metrics Table
    lines.append("## 📊 Comprehensive Profile Metrics\n")
    lines.append("| Metric | Value | Detail |")
    lines.append("| :--- | :--- | :--- |")
    lines.append(f"| **LeetCode Profile** | [`@{LEETCODE_USERNAME}`](https://leetcode.com/{LEETCODE_USERNAME}/) | Public Profile |")
    lines.append(f"| **Global Ranking** | **{ranking_str}** | Across active global participants |")
    lines.append(f"| **Total Solved** | **{total_solved}** | Verified AC problems |")
    lines.append(f"| **Contest Rating** | **{contest_rating}** | {contest_ranking_str} ranking (Top {top_pct_str}) |")
    lines.append(f"| **Contests Attended** | **{contests_attended}** | Live weekly & biweekly contests |")
    lines.append(f"| **Streak Tracking** | **{current_streak} days** (Current) | **{max_streak} days** (Longest active) |")
    lines.append(f"| **Earned Badges** | **{len(badges_list)}** | Special challenge medals |")
    lines.append(f"| **Last Synced** | `{updated_at}` | Automated via GitHub Actions |\n")

    # Difficulty Breakdown Table
    lines.append("## 🎯 Difficulty Breakdown\n")
    easy_pct = (easy_solved / total_solved * 100) if total_solved else 0
    med_pct = (medium_solved / total_solved * 100) if total_solved else 0
    hard_pct = (hard_solved / total_solved * 100) if total_solved else 0

    lines.append("| Difficulty | Solved | Ratio | Visual Badge |")
    lines.append("| :--- | :---: | :---: | :---: |")
    lines.append(f"| 🟢 **Easy** | **{easy_solved}** | `{easy_pct:.1f}%` | ![Easy](https://img.shields.io/badge/-Easy-00b8a3?style=flat-square) |")
    lines.append(f"| 🟡 **Medium** | **{medium_solved}** | `{med_pct:.1f}%` | ![Medium](https://img.shields.io/badge/-Medium-ffc01e?style=flat-square) |")
    lines.append(f"| 🔴 **Hard** | **{hard_solved}** | `{hard_pct:.1f}%` | ![Hard](https://img.shields.io/badge/-Hard-ef4743?style=flat-square) |")
    lines.append(f"| 🏆 **Total** | **{total_solved}** | `100.0%` | ![Total](https://img.shields.io/badge/-Solved-c084fc?style=flat-square) |\n")

    # Earned Badges
    if badges_list:
        lines.append("## 🏅 Earned Badges\n")
        lines.append("<p align=\"left\">")
        for b in badges_list:
            b_name = b.get("displayName")
            b_icon = b.get("icon", "")
            if b_icon and not b_icon.startswith("http"):
                b_icon = f"https://leetcode.com{b_icon}"
            if b_icon:
                lines.append(f"  <img src=\"{b_icon}\" alt=\"{b_name}\" title=\"{b_name}\" width=\"75\" height=\"75\" style=\"margin-right: 12px;\" />")
        lines.append("</p>\n")

    # Solutions Catalog
    lines.append("## 📁 Solutions Catalog\n")
    if solutions:
        lines.append(f"Catalog contains **{len(solutions)}** documented solution(s) organized in [`solutions/`](solutions/):\n")
        lines.append("| # | Problem | Topic | Difficulty | Solution |")
        lines.append("| :---: | :--- | :--- | :---: | :---: |")
        for idx, sol in enumerate(solutions, start=1):
            diff_badge = f"`{sol['difficulty']}`"
            if sol['difficulty'] == "Easy":
                diff_badge = "🟢 Easy"
            elif sol['difficulty'] == "Medium":
                diff_badge = "🟡 Medium"
            elif sol['difficulty'] == "Hard":
                diff_badge = "🔴 Hard"
            lines.append(
                f"| {idx} | **{sol['title']}** | {sol['topic']} | {diff_badge} | [View Code]({sol['path']}) |"
            )
        lines.append("")
    else:
        lines.append(
            "> [!NOTE]\n"
            "> Solutions placed into `solutions/<Topic>/<Difficulty>/<problem-name>.py` "
            "are scanned and automatically indexed in this table.\n"
        )

    # Progress History Table
    lines.append("## 📈 Progress History\n")
    if snapshots:
        recent_snaps = snapshots[-10:]
        recent_snaps.reverse()
        lines.append("| Date | Total Solved | Easy | Medium | Hard | Global Rank | Daily Change |")
        lines.append("| :---: | :---: | :---: | :---: | :---: | :---: | :---: |")
        for s in recent_snaps:
            delta = s.get("deltaSolved", 0)
            delta_str = f"+{delta}" if delta > 0 else "-"
            rank_val = f"#{s.get('ranking'):,}" if isinstance(s.get("ranking"), int) else "N/A"
            lines.append(
                f"| `{s.get('date')}` | **{s.get('totalSolved')}** | {s.get('easySolved')} | {s.get('mediumSolved')} | {s.get('hardSolved')} | {rank_val} | `{delta_str}` |"
            )
        lines.append("")

    # Footer
    lines.append("---\n")
    lines.append("### ⚙️ Automation & Architecture\n")
    lines.append(
        "- **Data Pipeline**: Automated live queries via official LeetCode GraphQL API\n"
        "- **Royal Blue Heatmap**: High-contrast monochromatic SVG rendered directly in repository\n"
        "- **Automated Workflow**: Scheduled GitHub Actions cron runner with idempotent commit handling\n"
        f"- **Repository Owner**: [@{GITHUB_USERNAME}](https://github.com/{GITHUB_USERNAME})\n"
    )

    return "\n".join(lines)


def main():
    print(f"Fetching LeetCode statistics for @{LEETCODE_USERNAME}...")
    try:
        current_stats = fetch_leetcode_data(LEETCODE_USERNAME)
    except Exception as e:
        print(f"Error fetching data: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Successfully retrieved stats: {current_stats['totalSolved']} solved.")

    prev_data = load_previous_progress()
    updated_data, stats_changed = update_progress_records(prev_data, current_stats)

    # Scan solutions
    solutions = scan_solutions(SOLUTIONS_DIR)

    # Write updated data/progress.json
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(updated_data, f, indent=2, ensure_ascii=False)
    print(f"Updated {DATA_FILE}")

    # Generate standalone SVG Heatmap in exact Royal Blue scale
    os.makedirs(ASSETS_DIR, exist_ok=True)
    heatmap_svg = generate_heatmap_svg(current_stats.get("submissionCalendar", {}))
    with open(HEATMAP_SVG_FILE, "w", encoding="utf-8") as f:
        f.write(heatmap_svg)
    print(f"Generated {HEATMAP_SVG_FILE}")

    # Generate README
    readme_content = generate_readme(updated_data, solutions)
    with open(README_FILE, "w", encoding="utf-8") as f:
        f.write(readme_content)
    print(f"Updated {README_FILE}")

    # Output status
    if stats_changed:
        print("Progress changes detected.")
    else:
        print("No changes in statistics since last run.")


if __name__ == "__main__":
    main()
