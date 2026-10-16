import os
import sys
import json
import ssl
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
import mimetypes

LEETCODE_USERNAME = os.getenv("LEETCODE_USERNAME", "smkyuzarsif")
GRAPHQL_URL = "https://leetcode.com/graphql"

GRAPHQL_QUERY = """
query getFullProfile($username: String!) {
  matchedUser(username: $username) {
    username
    githubUrl
    twitterUrl
    linkedinUrl
    profile {
      realName
      websites
      countryName
      skillTags
      company
      school
      starRating
      aboutMe
      userAvatar
      reputation
      ranking
    }
    submitStatsGlobal {
      acSubmissionNum {
        difficulty
        count
        submissions
      }
    }
    languageProblemCount {
      languageName
      problemsSolved
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
    totalParticipants
    topPercentage
    badge {
      name
    }
  }
  userContestRankingHistory(username: $username) {
    attended
    trendDirection
    problemsSolved
    totalProblems
    finishTimeInSeconds
    rating
    ranking
    contest {
      title
      startTime
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

_cache = {
    "data": None,
    "timestamp": 0
}


def fetch_leetcode_data(username: str) -> dict:
    global _cache
    now = datetime.now(timezone.utc).timestamp()
    if _cache["data"] and (now - _cache["timestamp"] < 300):
        return _cache["data"]

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
        raise RuntimeError(f"LeetCode HTTP Error {e.code}: {e.reason}")
    except Exception as e:
        raise RuntimeError(f"Network error: {e}")

    if "errors" in result and not result.get("data"):
        raise RuntimeError(f"GraphQL Errors: {result['errors']}")

    data = result.get("data", {})
    matched_user = data.get("matchedUser")
    if not matched_user:
        raise ValueError(f"User '{username}' not found on LeetCode.")

    # Parse counts
    submit_stats = matched_user.get("submitStatsGlobal", {}).get("acSubmissionNum", [])
    counts = {"All": 0, "Easy": 0, "Medium": 0, "Hard": 0}
    for item in submit_stats:
        diff = item.get("difficulty")
        if diff in counts:
            counts[diff] = item.get("count", 0)

    # Contest info
    contest = data.get("userContestRanking") or {}
    contest_history = data.get("userContestRankingHistory") or []
    attended_contests = [
        {
            "title": c.get("contest", {}).get("title"),
            "startTime": c.get("contest", {}).get("startTime"),
            "rating": round(c.get("rating", 0), 2) if c.get("rating") else None,
            "ranking": c.get("ranking"),
            "problemsSolved": c.get("problemsSolved"),
            "totalProblems": c.get("totalProblems"),
        }
        for c in contest_history if c.get("attended") and c.get("rating")
    ]

    # Parse submission calendar
    calendar_raw = matched_user.get("submissionCalendar") or "{}"
    if isinstance(calendar_raw, str):
        try:
            calendar = json.loads(calendar_raw)
        except json.JSONDecodeError:
            calendar = {}
    else:
        calendar = calendar_raw

    # Badges
    badges = matched_user.get("badges") or []
    for b in badges:
        icon = b.get("icon", "")
        if icon and not icon.startswith("http"):
            b["icon"] = f"https://leetcode.com{icon}"

    profile = matched_user.get("profile") or {}
    languages = matched_user.get("languageProblemCount") or []

    # Calculate streaks
    dates = set()
    for ts_str in calendar.keys():
        try:
            ts = int(ts_str)
            dates.add(datetime.fromtimestamp(ts, tz=timezone.utc).date())
        except (ValueError, OSError):
            continue

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

    today = datetime.now(timezone.utc).date()
    active_streak = 0
    if sorted_dates and (today - sorted_dates[-1]).days <= 1:
        target = sorted_dates[-1]
        while target in dates:
            active_streak += 1
            target -= timedelta(days=1)

    formatted = {
        "username": username,
        "realName": profile.get("realName") or username,
        "avatar": profile.get("userAvatar"),
        "ranking": profile.get("ranking"),
        "reputation": profile.get("reputation", 0),
        "totalSolved": counts["All"],
        "easySolved": counts["Easy"],
        "mediumSolved": counts["Medium"],
        "hardSolved": counts["Hard"],
        "contestRating": round(contest.get("rating", 0), 2) if contest.get("rating") else None,
        "contestRanking": contest.get("globalRanking"),
        "contestTopPercentage": contest.get("topPercentage"),
        "contestsAttended": contest.get("attendedContestsCount", 0),
        "contestHistory": attended_contests,
        "submissionCalendar": calendar,
        "badges": badges,
        "languages": languages,
        "recentSubmissions": data.get("recentAcSubmissionList") or [],
        "currentStreak": active_streak,
        "maxStreak": max_streak,
        "lastSynced": datetime.now(timezone.utc).strftime("%b %d, %Y - %H:%M UTC"),
    }

    _cache["data"] = formatted
    _cache["timestamp"] = now
    return formatted


class DashboardHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        # API endpoint
        if self.path.startswith("/api/profile"):
            try:
                data = fetch_leetcode_data(LEETCODE_USERNAME)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps(data).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        # Static files serving
        dashboard_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dashboard")
        req_path = self.path.split("?")[0].lstrip("/")
        if not req_path:
            req_path = "index.html"

        file_path = os.path.join(dashboard_dir, req_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            self.send_response(200)
            mime_type, _ = mimetypes.guess_type(file_path)
            self.send_header("Content-Type", mime_type or "text/plain")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            self.end_headers()
            with open(file_path, "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")

    def do_POST(self):
        if self.path.startswith("/api/refresh"):
            global _cache
            _cache["data"] = None
            _cache["timestamp"] = 0
            try:
                data = fetch_leetcode_data(LEETCODE_USERNAME)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps(data).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return
        self.send_response(404)
        self.end_headers()


def run_server(port=3000):
    server_address = ("", port)
    httpd = HTTPServer(server_address, DashboardHandler)
    print(f"=======================================================")
    print(f"[*] LeetCode Dashboard Server running at http://localhost:{port}")
    print(f"Tracking profile: @{LEETCODE_USERNAME}")
    print(f"Press Ctrl+C to stop.")
    print(f"=======================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    run_server(port)
