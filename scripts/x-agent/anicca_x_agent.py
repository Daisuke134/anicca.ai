"""
Anicca X Agent
Posts to X/Twitter using Commander Agent's daily output.

Flow:
1. Fetch pending xPosts from Commander decision (GET /api/admin/x/pending)
2. Review yesterday's X performance (GET /api/admin/x/recent-posts)
3. Use LLM to select/refine posts from candidates
4. Post via Blotato API (2 posts: immediate + scheduled evening)
5. Save records (POST /api/admin/x/posts)

Runs via GitHub Actions: .github/workflows/anicca-x-post.yml
"""
import json
import sys
from datetime import datetime, timezone, timedelta

import requests
from openai import OpenAI

from config import (
    OPENAI_API_KEY, BLOTATO_API_KEY, BLOTATO_BASE_URL,
    API_BASE_URL, API_AUTH_TOKEN, X_ACCOUNT_ID,
    MODEL, MAX_POSTS_PER_RUN, validate_env,
)

validate_env()

client = OpenAI(api_key=OPENAI_API_KEY)

JST = timezone(timedelta(hours=9))

# ── API helpers ──────────────────────────────────────────────────────────────

def api_get(path, params=None):
    url = f"{API_BASE_URL}/api/admin{path}"
    headers = {"Authorization": f"Bearer {API_AUTH_TOKEN}", "Content-Type": "application/json"}
    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def api_post(path, data):
    url = f"{API_BASE_URL}/api/admin{path}"
    headers = {"Authorization": f"Bearer {API_AUTH_TOKEN}", "Content-Type": "application/json"}
    resp = requests.post(url, headers=headers, json=data, timeout=30)
    resp.raise_for_status()
    return resp.json()


def blotato_post(text, scheduled_time=None):
    """Post to X via Blotato API."""
    url = f"{BLOTATO_BASE_URL}/post"
    headers = {"Authorization": f"Bearer {BLOTATO_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "accountId": int(X_ACCOUNT_ID),
        "text": text,
    }
    if scheduled_time:
        payload["scheduledTime"] = scheduled_time  # ISO 8601
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ── LLM selection ────────────────────────────────────────────────────────────

SELECTOR_PROMPT = """You are Anicca's X/Twitter content strategist.

## Context
Anicca is a mindfulness-based behavior change app targeting 25-35 year olds who have struggled
with habits for 6-7 years. Our voice: compassionate but direct, rooted in behavioral science.

## Yesterday's Performance
{yesterday_summary}

## Candidate Posts (from Commander Agent)
{candidates_json}

## Task
Select up to {max_posts} posts to publish today. You may:
- Pick candidates as-is
- Slightly refine wording for X engagement (keep under 280 chars)
- Add relevant hashtags (max 3, no spammy ones)

For each selected post, assign a posting time:
- Post 1: Immediate (morning 9:00 JST)
- Post 2: Evening (21:00 JST) — use Blotato scheduled posting

## Output Format (JSON only)
{{
  "posts": [
    {{
      "text": "final tweet text (≤280 chars)",
      "scheduled_time_jst": "HH:MM",
      "reasoning": "why this post and timing"
    }}
  ]
}}
"""


def select_posts(candidates, yesterday_posts):
    yesterday_summary = "No previous X posts." if not yesterday_posts else json.dumps(
        [{"text": p["text"][:100], "impressions": p["impression_count"], "likes": p["like_count"],
          "engagement_rate": p["engagement_rate"]} for p in yesterday_posts[:5]],
        ensure_ascii=False,
    )

    prompt = SELECTOR_PROMPT.format(
        yesterday_summary=yesterday_summary,
        candidates_json=json.dumps(candidates, ensure_ascii=False, indent=2),
        max_posts=MAX_POSTS_PER_RUN,
    )

    resp = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.7,
    )

    return json.loads(resp.choices[0].message.content)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=== Anicca X Agent ===")

    # Step 1: Fetch Commander-generated xPosts
    print("\n[1/4] Fetching pending X posts from Commander...")
    pending = api_get("/x/pending")
    candidates = pending.get("xPosts", [])

    if not candidates:
        print("No pending X posts from Commander. Exiting.")
        return

    print(f"  Found {len(candidates)} candidate(s)")

    # Step 2: Review yesterday's performance
    print("\n[2/4] Reviewing yesterday's X performance...")
    recent = api_get("/x/recent-posts", params={"days": 7})
    yesterday_posts = recent.get("posts", [])
    print(f"  Found {len(yesterday_posts)} recent post(s)")

    # Step 3: LLM selection & refinement
    print("\n[3/4] Selecting posts via LLM...")
    selection = select_posts(candidates, yesterday_posts)
    posts_to_publish = selection.get("posts", [])

    if not posts_to_publish:
        print("LLM returned no posts. Exiting.")
        return

    print(f"  Selected {len(posts_to_publish)} post(s)")

    # Step 4: Post via Blotato + save records
    print("\n[4/4] Posting via Blotato...")
    now_jst = datetime.now(JST)

    for i, post in enumerate(posts_to_publish[:MAX_POSTS_PER_RUN]):
        text = post["text"][:280]
        time_str = post.get("scheduled_time_jst", "09:00")

        # Parse scheduled time (with validation)
        try:
            hour, minute = map(int, time_str.split(":"))
            if not (0 <= hour <= 23 and 0 <= minute <= 59):
                raise ValueError(f"Invalid time: {time_str}")
        except (ValueError, AttributeError):
            print(f"  Warning: Invalid time format '{time_str}', defaulting to 09:00")
            hour, minute = 9, 0

        scheduled_dt = now_jst.replace(hour=hour, minute=minute, second=0, microsecond=0)

        # If scheduled time has passed, post immediately
        is_immediate = scheduled_dt <= now_jst
        scheduled_iso = None if is_immediate else scheduled_dt.isoformat()

        try:
            print(f"\n  Post {i+1}: {'immediate' if is_immediate else f'scheduled {time_str} JST'}")
            print(f"  Text: {text[:80]}...")

            result = blotato_post(text, scheduled_time=scheduled_iso)
            blotato_id = str(result.get("id", result.get("postId", "")))

            print(f"  Blotato ID: {blotato_id}")

            # Save to Railway DB
            api_post("/x/posts", {
                "text": text,
                "x_post_id": blotato_id if blotato_id else None,
                "agent_reasoning": post.get("reasoning", ""),
                "posted_at": now_jst.isoformat() if is_immediate else scheduled_dt.isoformat(),
            })
            print(f"  Record saved.")

        except requests.HTTPError as e:
            print(f"  ERROR posting: {e}")
            print(f"  Response: {e.response.text if e.response else 'N/A'}")
            continue
        except Exception as e:
            print(f"  ERROR: {e}")
            continue

    print("\n=== X Agent complete ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FATAL: {e}", file=sys.stderr)
        sys.exit(1)
