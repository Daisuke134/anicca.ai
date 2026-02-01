"""
RSS Feed Parser

Fetches and parses RSS.app feeds to detect new TikTok posts.
"""
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from defusedxml import ElementTree as DefusedET

import requests


def fetch_new_posts(rss_url: str, since: datetime) -> list[dict]:
    """Fetch posts from RSS feed published after `since`.

    Args:
        rss_url: RSS.app feed URL
        since: Only return posts published after this datetime (UTC)

    Returns:
        List of post dicts with keys: id, title, link, pub_date, thumbnail
    """
    resp = requests.get(rss_url, timeout=30)
    resp.raise_for_status()

    root = DefusedET.fromstring(resp.text)
    channel = root.find("channel")
    if channel is None:
        return []

    posts = []
    for item in channel.findall("item"):
        pub_date_str = _get_text(item, "pubDate")
        if not pub_date_str:
            continue

        pub_date = parsedate_to_datetime(pub_date_str)
        if pub_date.tzinfo is None:
            pub_date = pub_date.replace(tzinfo=timezone.utc)

        if pub_date <= since:
            continue

        link = _get_text(item, "link") or ""
        thumbnail = _get_media_url(item)

        posts.append({
            "id": link,
            "title": _get_text(item, "title") or "",
            "link": link,
            "pub_date": pub_date.isoformat(),
            "thumbnail": thumbnail,
        })

    return posts


def _get_text(element: ET.Element, tag: str) -> str | None:
    """Get text content of a child element."""
    child = element.find(tag)
    return child.text if child is not None else None


def _get_media_url(item: ET.Element) -> str:
    """Extract media URL from RSS item (media:content tag)."""
    namespaces = {"media": "http://search.yahoo.com/mrss/"}
    media = item.find("media:content", namespaces)
    if media is not None:
        return media.get("url", "")
    return ""
