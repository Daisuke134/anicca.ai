"""Tests for Slack message formatting."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models import AppStoreMetrics, DailyMetrics, RevenueCatMetrics
from slack_sender import _check_alerts, _format_country_breakdown, format_error_message, format_slack_blocks


class TestFormatCountryBreakdown:
    def test_basic(self):
        result = _format_country_breakdown((("US", 5), ("JP", 3), ("EU", 2)))
        assert result == "US: 5 | JP: 3 | EU: 2"

    def test_empty(self):
        assert _format_country_breakdown(()) == "N/A"

    def test_limit(self):
        countries = tuple((f"C{i}", i) for i in range(10))
        result = _format_country_breakdown(countries, limit=3)
        assert result.count("|") == 2  # 3 items, 2 separators


class TestFormatSlackBlocks:
    def test_full_metrics(self):
        metrics = DailyMetrics(
            date="2026-01-28",
            app_store=AppStoreMetrics(
                total_downloads_7d=12,
                downloads_by_country=(("US", 5), ("JP", 4), ("EU", 3)),
                impressions=900,
                page_views=13,
                cvr_page_to_download=1.8,
            ),
            revenuecat=RevenueCatMetrics(
                mrr=149.85,
                active_subscriptions=15,
                active_trials=3,
                trial_to_paid_count=1,
                trial_expired_count=2,
                monthly_churn_rate=6.7,
            ),
        )
        payload = format_slack_blocks(metrics)
        assert "blocks" in payload
        blocks = payload["blocks"]

        # Header exists
        assert blocks[0]["type"] == "header"
        assert "2026-01-28" in blocks[0]["text"]["text"]

        # Revenue section
        revenue_block = blocks[1]["text"]["text"]
        assert "$149.85" in revenue_block
        assert "15" in revenue_block
        assert "6.7%" in revenue_block

        # Installs section
        installs_block = blocks[2]["text"]["text"]
        assert "12" in installs_block
        assert "1.8%" in installs_block

    def test_revenuecat_only(self):
        metrics = DailyMetrics(
            date="2026-01-28",
            revenuecat=RevenueCatMetrics(mrr=50.0, active_subscriptions=5),
            errors=("ASC: timeout",),
        )
        payload = format_slack_blocks(metrics)
        blocks = payload["blocks"]
        # Should have header + revenue + errors
        assert any("ERRORS" in str(b) for b in blocks)

    def test_day_over_day_comparison(self):
        current = DailyMetrics(
            date="2026-01-28",
            revenuecat=RevenueCatMetrics(mrr=149.85, active_subscriptions=15),
        )
        previous = DailyMetrics(
            date="2026-01-27",
            revenuecat=RevenueCatMetrics(mrr=139.86, active_subscriptions=14),
        )
        payload = format_slack_blocks(current, previous)
        revenue_text = payload["blocks"][1]["text"]["text"]
        assert "+$" in revenue_text or "(+" in revenue_text

    def test_trial_to_paid_display(self):
        metrics = DailyMetrics(
            date="2026-01-28",
            revenuecat=RevenueCatMetrics(
                mrr=100.0,
                trial_to_paid_count=3,
                trial_expired_count=7,
                monthly_churn_rate=5.0,
            ),
        )
        payload = format_slack_blocks(metrics)
        revenue_text = payload["blocks"][1]["text"]["text"]
        assert "3/10" in revenue_text
        assert "30%" in revenue_text


class TestFormatErrorMessage:
    def test_error_format(self):
        payload = format_error_message(
            errors=["App Store Connect API: 認証エラー (401)"],
            successes=["RevenueCat API: 正常"],
        )
        blocks = payload["blocks"]
        assert blocks[0]["text"]["text"].startswith("🚨")
        status_text = blocks[1]["text"]["text"]
        assert "❌" in status_text
        assert "✅" in status_text


class TestCheckAlerts:
    def test_cvr_below_threshold(self):
        metrics = DailyMetrics(
            date="2026-01-28",
            app_store=AppStoreMetrics(cvr_page_to_download=1.8, total_downloads_7d=12),
        )
        alerts = _check_alerts(metrics)
        triggered = [a for a in alerts if a.is_triggered]
        assert len(triggered) >= 1
        assert any("CVR" in a.metric_name for a in triggered)

    def test_dl_below_threshold(self):
        metrics = DailyMetrics(
            date="2026-01-28",
            app_store=AppStoreMetrics(total_downloads_7d=14),  # 2/day < 10
        )
        alerts = _check_alerts(metrics)
        triggered = [a for a in alerts if a.is_triggered]
        assert any("DL" in a.metric_name for a in triggered)

    def test_no_alerts_when_good(self):
        metrics = DailyMetrics(
            date="2026-01-28",
            app_store=AppStoreMetrics(
                total_downloads_7d=100,  # ~14/day > 10
                cvr_page_to_download=5.0,  # > 3%
            ),
        )
        alerts = _check_alerts(metrics)
        triggered = [a for a in alerts if a.is_triggered]
        assert len(triggered) == 0


class TestMonthlyChurnRate:
    def test_churn_in_revenue_block(self):
        metrics = DailyMetrics(
            date="2026-01-28",
            revenuecat=RevenueCatMetrics(
                mrr=100.0,
                monthly_churn_rate=8.5,
            ),
        )
        payload = format_slack_blocks(metrics)
        revenue_text = payload["blocks"][1]["text"]["text"]
        assert "8.5%" in revenue_text
