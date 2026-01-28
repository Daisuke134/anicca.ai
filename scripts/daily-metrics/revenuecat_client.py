"""RevenueCat API v2 client for subscription metrics."""

import os
import sys

import httpx

from models import RevenueCatMetrics

RC_BASE_URL = "https://api.revenuecat.com/v2"


def _get_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {os.environ['REVENUECAT_V2_SECRET_KEY']}",
        "Content-Type": "application/json",
    }


async def fetch_revenuecat_metrics() -> RevenueCatMetrics:
    """Fetch MRR, active subs, trials, conversions, and churn from RevenueCat API v2."""
    headers = _get_headers()

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get project ID
        resp = await client.get(f"{RC_BASE_URL}/projects", headers=headers)
        resp.raise_for_status()
        project_id = resp.json()["items"][0]["id"]

        # Get overview metrics
        overview_resp = await client.get(
            f"{RC_BASE_URL}/projects/{project_id}/metrics/overview",
            headers=headers,
        )
        overview_resp.raise_for_status()
        data = overview_resp.json()

        metrics = data.get("metrics", [])
        mrr = 0.0
        active_subs = 0
        active_trials = 0

        for metric in metrics:
            name = metric.get("name", "")
            value = metric.get("value", 0)
            if name == "mrr":
                mrr = float(value) / 100  # cents to dollars
            elif name == "active_subscriptions":
                active_subs = int(value)
            elif name == "active_trials":
                active_trials = int(value)

        # Get trial-to-paid and churn metrics
        trial_to_paid = 0
        trial_expired = 0
        churn_rate = 0.0

        try:
            events_resp = await client.get(
                f"{RC_BASE_URL}/projects/{project_id}/metrics/overview",
                headers=headers,
                params={"metric_names": "new_paid_from_trial,expired_trials,churn"},
            )
            if events_resp.status_code == 200:
                events_data = events_resp.json()
                for metric in events_data.get("metrics", []):
                    name = metric.get("name", "")
                    value = metric.get("value", 0)
                    if name == "new_paid_from_trial":
                        trial_to_paid = int(value)
                    elif name == "expired_trials":
                        trial_expired = int(value)
                    elif name == "churn":
                        churn_rate = float(value)
        except httpx.HTTPError as e:
            # W-2: Log instead of silently swallowing
            print(f"WARNING: RevenueCat trial/churn metrics failed: {e}", file=sys.stderr)

    return RevenueCatMetrics(
        mrr=round(mrr, 2),
        active_subscriptions=active_subs,
        active_trials=active_trials,
        trial_to_paid_count=trial_to_paid,
        trial_expired_count=trial_expired,
        monthly_churn_rate=round(churn_rate * 100, 1) if churn_rate < 1 else round(churn_rate, 1),
    )
