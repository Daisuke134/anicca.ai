"""App Store Connect API client for fetching download and conversion metrics."""

import gzip
import os
import sys
import time
from datetime import date, timedelta

import httpx
import jwt

from models import AppStoreMetrics

ASC_BASE_URL = "https://api.appstoreconnect.apple.com/v1"
TOKEN_EXPIRY_SECONDS = 1200  # 20 minutes

# Token cache (W-1 fix)
_cached_token: str | None = None
_token_expires_at: int = 0


def _generate_token() -> str:
    """Generate JWT token for App Store Connect API. Cached for 20 min."""
    global _cached_token, _token_expires_at
    now = int(time.time())
    if _cached_token and now < _token_expires_at - 60:
        return _cached_token

    key_id = os.environ["ASC_KEY_ID"]
    issuer_id = os.environ["ASC_ISSUER_ID"]
    private_key = os.environ["ASC_PRIVATE_KEY"]

    payload = {
        "iss": issuer_id,
        "iat": now,
        "exp": now + TOKEN_EXPIRY_SECONDS,
        "aud": "appstoreconnect-v1",
    }
    headers = {"kid": key_id, "typ": "JWT"}
    token = jwt.encode(payload, private_key, algorithm="ES256", headers=headers)
    _cached_token = token
    _token_expires_at = now + TOKEN_EXPIRY_SECONDS
    return token


def _get_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_generate_token()}",
        "Content-Type": "application/json",
    }


async def fetch_app_store_metrics() -> AppStoreMetrics:
    """Fetch downloads, impressions, page views, and CVR from App Store Connect."""
    end_date = date.today() - timedelta(days=1)
    start_date = end_date - timedelta(days=6)  # 7-day window

    headers = _get_headers()
    total_downloads = 0
    downloads_by_country: dict[str, int] = {}
    impressions = 0
    page_views = 0

    # C-2: Vendor number is required for sales reports
    vendor_number = os.environ.get("ASC_VENDOR_NUMBER", "")
    if not vendor_number:
        print("WARNING: ASC_VENDOR_NUMBER not set. Sales reports may return empty.", file=sys.stderr)

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Fetch sales reports (daily, summary)
        for day_offset in range(7):
            report_date = start_date + timedelta(days=day_offset)
            params = {
                "filter[frequency]": "DAILY",
                "filter[reportDate]": report_date.isoformat(),
                "filter[reportSubType]": "SUMMARY",
                "filter[reportType]": "SALES",
                "filter[vendorNumber]": vendor_number,
            }

            try:
                resp = await client.get(
                    f"{ASC_BASE_URL}/salesReports",
                    headers=headers,
                    params=params,
                )
                if resp.status_code == 200:
                    # Sales reports are gzip compressed
                    try:
                        content = gzip.decompress(resp.content).decode("utf-8")
                    except gzip.BadGzipFile:
                        content = resp.text  # Fallback if not compressed
                    lines = content.strip().split("\n")
                    if len(lines) > 1:
                        # S-2: Parse header row for column indices
                        header_cols = lines[0].split("\t")
                        units_idx = _find_col(header_cols, "Units", fallback=7)
                        country_idx = _find_col(header_cols, "Country Code", fallback=12)
                        for line in lines[1:]:
                            cols = line.split("\t")
                            if len(cols) > max(units_idx, country_idx):
                                units = int(cols[units_idx]) if cols[units_idx].isdigit() else 0
                                country = cols[country_idx] if len(cols) > country_idx else "Unknown"
                                total_downloads += units
                                downloads_by_country[country] = (
                                    downloads_by_country.get(country, 0) + units
                                )
                else:
                    print(f"WARNING: ASC sales report {report_date}: HTTP {resp.status_code}", file=sys.stderr)
            except httpx.HTTPError as e:
                # W-2: Log instead of silently swallowing
                print(f"WARNING: ASC sales report {report_date} failed: {e}", file=sys.stderr)
                continue

        # Fetch app analytics for impressions and page views
        try:
            apps_resp = await client.get(
                f"{ASC_BASE_URL}/apps",
                headers=headers,
                params={"filter[bundleId]": "com.anicca.ios"},
            )
            if apps_resp.status_code == 200:
                apps_data = apps_resp.json()
                if apps_data.get("data"):
                    app_id = apps_data["data"][0]["id"]
                    analytics_resp = await client.get(
                        f"{ASC_BASE_URL}/apps/{app_id}/analyticsReportRequests",
                        headers=headers,
                    )
                    if analytics_resp.status_code == 200:
                        analytics_data = analytics_resp.json()
                        for report in analytics_data.get("data", []):
                            attrs = report.get("attributes", {})
                            if attrs.get("category") == "APP_STORE_ENGAGEMENT":
                                impressions = attrs.get("impressionsTotalUnique", 0)
                                page_views = attrs.get("pageViewsTotalUnique", 0)
        except httpx.HTTPError as e:
            # W-2: Log instead of silently swallowing
            print(f"WARNING: ASC analytics fetch failed: {e}", file=sys.stderr)

    cvr = (total_downloads / page_views * 100) if page_views > 0 else 0.0

    # Sort countries by downloads descending, convert to immutable tuple
    sorted_countries = tuple(
        sorted(downloads_by_country.items(), key=lambda x: x[1], reverse=True)
    )

    return AppStoreMetrics(
        total_downloads_7d=total_downloads,
        downloads_by_country=sorted_countries,
        impressions=impressions,
        page_views=page_views,
        cvr_page_to_download=round(cvr, 1),
    )


def _find_col(headers: list[str], name: str, fallback: int) -> int:
    """Find column index by name, with fallback for backwards compatibility."""
    try:
        return headers.index(name)
    except ValueError:
        return fallback
