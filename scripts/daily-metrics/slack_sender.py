"""Slack Block Kit message formatter and sender."""

import asyncio
import os
import sys
from datetime import date

import httpx

from models import AlertCondition, AppStoreMetrics, DailyMetrics, DayOverDay, RevenueCatMetrics


def _format_country_breakdown(countries: tuple[tuple[str, int], ...], limit: int = 5) -> str:
    """Format top N countries as 'US: 5 | JP: 3 | EU: 2'."""
    top = countries[:limit]
    if not top:
        return "N/A"
    return " | ".join(f"{k}: {v}" for k, v in top)


def _diff_str(current: float, previous: float, prefix: str = "", suffix: str = "") -> str:
    """Format day-over-day diff like (+$9.99) or (-2)."""
    dod = DayOverDay(current=current, previous=previous)
    return f"({prefix}{dod.diff_str}{suffix})" if dod.diff != 0 else ""


def format_slack_blocks(metrics: DailyMetrics, previous: DailyMetrics | None = None) -> dict:
    """Format metrics into Slack Block Kit payload."""
    today_str = metrics.date
    blocks = []

    # Header
    blocks.append({
        "type": "header",
        "text": {"type": "plain_text", "text": f"📊 Anicca Daily Report ({today_str})"},
    })

    # Revenue section
    if metrics.revenuecat:
        rc = metrics.revenuecat
        prev_rc = previous.revenuecat if previous and previous.revenuecat else None

        mrr_diff = _diff_str(rc.mrr, prev_rc.mrr, prefix="$") if prev_rc else ""
        subs_diff = _diff_str(rc.active_subscriptions, prev_rc.active_subscriptions) if prev_rc else ""

        trial_total = rc.trial_to_paid_count + rc.trial_expired_count
        trial_pct = (
            f"{rc.trial_to_paid_count / trial_total * 100:.0f}%"
            if trial_total > 0
            else "N/A"
        )

        revenue_text = (
            f"*💰 REVENUE*\n"
            f"  MRR: ${rc.mrr:.2f} {mrr_diff}\n"
            f"  Active Subs: {rc.active_subscriptions} {subs_diff}\n"
            f"  Trial→Paid: {rc.trial_to_paid_count}/{trial_total} ({trial_pct})\n"
            f"  Monthly Churn: {rc.monthly_churn_rate}%"
        )
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": revenue_text}})

    # Installs section
    if metrics.app_store:
        asc = metrics.app_store
        prev_asc = previous.app_store if previous and previous.app_store else None

        dl_diff = _diff_str(asc.total_downloads_7d, prev_asc.total_downloads_7d) if prev_asc else ""
        countries = _format_country_breakdown(asc.downloads_by_country)

        installs_text = (
            f"*📥 INSTALLS (7日間)*\n"
            f"  合計: {asc.total_downloads_7d} {dl_diff} (目標: 70)\n"
            f"  {countries}\n"
            f"  CVR (閲覧→DL): {asc.cvr_page_to_download}% (目標: 3%)"
        )
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": installs_text}})

        # Funnel
        if asc.impressions > 0 or asc.page_views > 0:
            imp_to_page = (
                f"{asc.page_views / asc.impressions * 100:.1f}%"
                if asc.impressions > 0
                else "N/A"
            )
            page_to_dl_daily = asc.total_downloads_7d // 7
            page_to_dl = (
                f"{page_to_dl_daily / asc.page_views * 100:.0f}%"
                if asc.page_views > 0
                else "N/A"
            )
            funnel_text = (
                f"*📈 FUNNEL*\n"
                f"  Imp → Page View → DL\n"
                f"  {asc.impressions}/日 → {asc.page_views} ({imp_to_page}) → {page_to_dl_daily} ({page_to_dl})"
            )
            blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": funnel_text}})

    # Alerts
    alerts = _check_alerts(metrics)
    triggered = [a for a in alerts if a.is_triggered]
    if triggered:
        alert_lines = "\n".join(f"  - {a.message}" for a in triggered)
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*⚠️ ALERTS*\n{alert_lines}"},
        })

    # Errors (W-4 fix: show error + success status together)
    if metrics.errors:
        error_lines = []
        for e in metrics.errors:
            error_lines.append(f"❌ {e}")
        if metrics.app_store:
            error_lines.append("✅ App Store Connect API: 正常")
        if metrics.revenuecat:
            error_lines.append("✅ RevenueCat API: 正常")
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*🚨 ERRORS*\n" + "\n".join(error_lines)},
        })

    return {"blocks": blocks}


def format_error_message(errors: list[str], successes: list[str]) -> dict:
    """Format error notification for Slack (total failure case)."""
    today_str = date.today().isoformat()
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"🚨 Anicca Metrics Error ({today_str})"},
        },
    ]

    status_lines = [f"❌ {err}" for err in errors]
    status_lines.extend(f"✅ {suc}" for suc in successes)

    blocks.append({
        "type": "section",
        "text": {"type": "mrkdwn", "text": "\n".join(status_lines)},
    })
    blocks.append({
        "type": "section",
        "text": {
            "type": "mrkdwn",
            "text": "全APIが失敗しました。API Keyの有効期限を確認してください。",
        },
    })

    return {"blocks": blocks}


def _check_alerts(metrics: DailyMetrics) -> list[AlertCondition]:
    """Check alert conditions against thresholds."""
    alerts = []
    if metrics.app_store:
        alerts.append(AlertCondition(
            metric_name="CVR",
            current_value=metrics.app_store.cvr_page_to_download,
            threshold=3.0,
            unit="%",
        ))
        avg_daily_dl = metrics.app_store.total_downloads_7d / 7
        alerts.append(AlertCondition(
            metric_name="日次DL",
            current_value=avg_daily_dl,
            threshold=10.0,
            unit="/日",
        ))
    return alerts


async def send_to_slack(payload: dict) -> bool:
    """Send Block Kit payload to Slack via webhook. Retries up to 3 times."""
    webhook_url = os.environ["SLACK_METRICS_WEBHOOK_URL"]
    async with httpx.AsyncClient(timeout=10.0) as client:
        for attempt in range(3):
            try:
                resp = await client.post(webhook_url, json=payload)
                if resp.status_code == 200:
                    return True
                print(f"Slack API returned {resp.status_code}: {resp.text}", file=sys.stderr)
                if resp.status_code == 429:
                    await asyncio.sleep(2 ** attempt)
                    continue
                return False
            except httpx.HTTPError as e:
                print(f"Slack send attempt {attempt + 1} failed: {e}", file=sys.stderr)
                if attempt < 2:
                    await asyncio.sleep(1)
        return False
