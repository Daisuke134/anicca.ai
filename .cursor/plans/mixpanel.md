---

# on-1aa9d4-314e0533.plan.md 実装後のMixpanel設定

---

## 追加されるイベント

| イベント名 | 説明 |
|-----------|------|
| `onboarding_paywall_viewed` | オンボーディング直後のPaywall表示 |
| `onboarding_paywall_dismissed` | オンボーディング直後のPaywallスキップ |
| `onboarding_paywall_purchased` | オンボーディング直後のPaywallで課金完了 |

---

## Mixpanel Funnel設定

### Funnel 1: オンボーディング完了率

**名前**: `Onboarding v0.4`

```
Step 1: onboarding_started
Step 2: onboarding_welcome_completed
Step 3: onboarding_value_completed
Step 4: onboarding_ideals_completed
Step 5: onboarding_struggles_completed
Step 6: onboarding_habitsetup_completed
Step 7: onboarding_notifications_completed
Step 8: onboarding_completed
```

---

### Funnel 2: Paywall到達率（最重要）

**名前**: `Paywall到達率`

```
Step 1: onboarding_started
Step 2: onboarding_paywall_viewed
```

---

### Funnel 3: 課金率

**名前**: `課金率`

```
Step 1: onboarding_paywall_viewed
Step 2: onboarding_paywall_purchased
```

---

### Funnel 4: 全体コンバージョン

**名前**: `Install → Purchase`

```
Step 1: onboarding_started
Step 2: onboarding_paywall_viewed
Step 3: onboarding_paywall_purchased
```

---

## Retention設定

### Retention 1: Day 1 / Day 7 リテンション

**名前**: `Day 1 / Day 7 Retention`

```
A event (Start): onboarding_completed
B event (Return): app_opened
Unit: Day
Interval Count: 7
```

---

## MCPコマンド

### リテンション取得

```
mcp_mixpanel_run_retention_query(
  project_id: 3970220,
  born_event: "onboarding_completed",
  event: "app_opened",
  unit: "day",
  interval_count: 7,
  retention_type: "birth",
  from_date: "2026-01-01",
  to_date: "2026-01-31"
)
```

### ファネル取得

```
mcp_mixpanel_run_funnels_query(
  project_id: 3970220,
  events: "onboarding_started,onboarding_paywall_viewed,onboarding_paywall_purchased",
  from_date: "2026-01-01",
  to_date: "2026-01-31"
)
```

---

## まとめ

| 種類 | 名前 | ステップ |
|------|------|---------|
| Funnel | Onboarding v0.4 | 8ステップ（started → completed） |
| Funnel | Paywall到達率 | 2ステップ（started → paywall_viewed） |
| Funnel | 課金率 | 2ステップ（paywall_viewed → purchased） |
| Funnel | Install → Purchase | 3ステップ（全体） |
| Retention | Day 1 / Day 7 | completed → app_opened |

---

**on-1aa9d4-314e0533.plan.mdを実装すれば、上記のFunnelが正確に計測できるようになる。**