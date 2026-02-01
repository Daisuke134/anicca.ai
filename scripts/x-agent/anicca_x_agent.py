"""
Anicca X Agent — Slot-based posting
Posts to X/Twitter using Commander Agent's daily output.

Flow:
1. Read POST_SLOT env (morning/evening) from GHA
2. Fetch pending xPosts for that slot (GET /api/admin/x/pending?slot=...)
3. Post via Blotato API (immediate — scheduling is handled by GHA cron)
4. Save records (POST /api/admin/x/posts)

Runs via GitHub Actions: .github/workflows/anicca-x-post.yml
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta

import requests

from config import (
    BLOTATO_API_KEY, BLOTATO_BASE_URL,
    API_BASE_URL, API_AUTH_TOKEN, X_ACCOUNT_ID,
    MAX_POSTS_PER_RUN, validate_env,
)

validate_env()

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


def blotato_post(text):
    """Post to X via Blotato API (immediate)."""
    url = f"{BLOTATO_BASE_URL}/post"
    headers = {"Authorization": f"Bearer {BLOTATO_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "accountId": int(X_ACCOUNT_ID),
        "text": text,
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    slot = os.environ.get("POST_SLOT", "morning")
    print(f"=== Anicca X Agent ({slot} slot) ===")

    # Step 1: Fetch Commander-generated xPosts for this slot
    print(f"\n[1/2] Fetching pending X posts for slot={slot}...")
    pending = api_get("/x/pending", params={"slot": slot})
    candidates = pending.get("xPosts", [])

    if not candidates:
        print(f"No pending X posts for {slot} slot. Exiting.")
        return

    print(f"  Found {len(candidates)} candidate(s)")

    # Step 2: Post via Blotato + save records
    print("\n[2/2] Posting via Blotato...")
    now_jst = datetime.now(JST)

    for i, candidate in enumerate(candidates[:MAX_POSTS_PER_RUN]):
        text = candidate["text"][:280]

        try:
            print(f"\n  Post {i+1}: immediate ({slot})")
            print(f"  Text: {text[:80]}...")

            result = blotato_post(text)
            blotato_id = str(result.get("id", result.get("postId", "")))

            print(f"  Blotato ID: {blotato_id}")

            # Save to Railway DB (blotato_post_id ≠ x_post_id; real tweet ID resolved later by fetch_x_metrics)
            api_post("/x/posts", {
                "text": text,
                "blotato_post_id": blotato_id if blotato_id else None,
                "agent_reasoning": candidate.get("reasoning", ""),
                "posted_at": now_jst.isoformat(),
                "slot": slot,
            })
            print("  Record saved.")

        except requests.HTTPError as e:
            print(f"  ERROR posting: {e}")
            print(f"  Response: {e.response.text if e.response else 'N/A'}")
            continue
        except Exception as e:
            print(f"  ERROR: {e}")
            continue

    print(f"\n=== X Agent ({slot}) complete ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FATAL: {e}", file=sys.stderr)
        sys.exit(1)
