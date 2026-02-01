"""
TikTok Slideshow Scraper

Uses Apify clockworks~tiktok-scraper to extract slideshow images from TikTok profiles.
Scrapes the profile once, then filters by target URLs from RSS.
"""
import time

import requests

from config import APIFY_API_TOKEN, APIFY_ACTOR_ID, APIFY_RESULTS_PER_PAGE


def scrape_profile_slideshows(
    tiktok_username: str,
    target_urls: list[str],
) -> dict[str, list[str]]:
    """Scrape a TikTok profile and extract slideshow images for target URLs.

    Args:
        tiktok_username: TikTok username without @
        target_urls: List of TikTok video URLs to look for (from RSS)

    Returns:
        Dict mapping tiktok_url -> list of image URLs.
        Video posts (non-slideshow) are excluded.
    """
    scraped = _run_apify_scraper(tiktok_username)
    target_set = set(target_urls)
    result = {}

    for post in scraped:
        post_url = post.get("webVideoUrl") or post.get("url") or ""
        if post_url not in target_set:
            continue

        if not post.get("isSlideshow"):
            continue

        images = _extract_slideshow_images(post)
        if images:
            result[post_url] = images

    return result


def _run_apify_scraper(username: str) -> list[dict]:
    """Run Apify TikTok scraper on a profile and return results."""
    run_url = f"https://api.apify.com/v2/acts/{APIFY_ACTOR_ID}/runs"
    headers = {"Authorization": f"Bearer {APIFY_API_TOKEN}"}

    run_input = {
        "profiles": [username],
        "resultsPerPage": APIFY_RESULTS_PER_PAGE,
        "shouldDownloadSlideshowImages": True,
    }

    print(f"  Scraping TikTok @{username} via Apify...")
    resp = requests.post(
        run_url,
        json=run_input,
        headers=headers,
        params={"waitForFinish": 300},
        timeout=360,
    )
    resp.raise_for_status()
    run_data = resp.json().get("data", {})
    dataset_id = run_data.get("defaultDatasetId")

    if not dataset_id:
        print(f"  WARNING: No dataset returned for @{username}")
        return []

    return _fetch_dataset(dataset_id, headers)


def _fetch_dataset(dataset_id: str, headers: dict) -> list[dict]:
    """Fetch results from an Apify dataset."""
    dataset_url = f"https://api.apify.com/v2/datasets/{dataset_id}/items"
    resp = requests.get(dataset_url, headers=headers, timeout=60)
    resp.raise_for_status()
    return resp.json()


def _extract_slideshow_images(post: dict) -> list[str]:
    """Extract all slideshow image URLs from a scraped post.

    Prefers downloadLink (persistent) over tiktokLink (CDN, expires).
    """
    images = []
    for img in post.get("slideshowImageLinks", []):
        url = img.get("downloadLink") or img.get("tiktokLink")
        if url:
            images.append(url)
    return images
