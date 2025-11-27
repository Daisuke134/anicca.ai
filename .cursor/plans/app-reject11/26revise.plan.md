<!-- db4b2544-6bc5-48db-bf3e-614aa236a91d ab529c86-81d2-468a-87a5-c134a4f568cd -->
# Anicca App Review Remediation Plan

### Scope

Address four review points:

- 3.1.2: Clearly describe subscription benefits
- 2.1: Fix IAP UX bug (unresponsive/hidden subscription info when user skipped tutorial)
- 2.5.4: Remove VoIP background mode (no VoIP features)
- Receipt validation note: clarify and ensure sandbox fallback handling (via RevenueCat)

### Evidence (current state)

- VoIP background mode present:
```45:52:/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/Info.plist
<key>UIBackgroundModes</key>
<array>
	<string>audio</string>
	<string>voip</string>
	<string>remote-notification</string>
</array>
```

- Settings shows current plan as static row and only a separate Manage button (tapping the row does nothing):
```21:27:/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/SettingsView.swift
Section(String(localized: "settings_subscription_title")) {
    HStack {
        Text(String(localized: "settings_subscription_current_plan"))
        Spacer()
        Text(appState.subscriptionInfo.displayPlanName)
    }
    ...
    Button(String(localized: "settings_subscription_manage")) {
        showingManageSubscription = true
    }
}
```

- Manage sheet currently hides current plan when free:
```27:31:/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/Views/ManageSubscriptionSheet.swift
// Current plan section
if appState.subscriptionInfo.plan != .free {
    currentPlanSection
}
```


### Changes

#### A) Clarify subscription benefits (Guideline 3.1.2)

1) App Store Connect product copy (≤55 chars each). Paste into each product localization:

- EN Monthly: "Up to 300 min/month of AI voice sessions. Auto-renews."
- EN Annual:  "Up to 3600 min/year of AI voice sessions. Auto-renews."
- JA 月額: 「AI音声対話を月300分まで。自動更新、管理可。」
- JA 年額: 「AI音声対話を年3600分まで。自動更新、管理可。」

2) In-app clarification: keep short explanatory lines on plan cards (longer than 55 chars allowed in-app). See pseudo-edits.

References: [Apple Subscriptions](https://developer.apple.com/app-store/subscriptions/)

#### B) Fix IAP UX (Guideline 2.1)

1) Make the "Current Plan" row tappable to open purchase/manage sheet.

2) Present Paywall for free users; present Customer Center for subscribed users.

3) Ensure subscription info is visible even when free (do not hide the current plan section) and keep `syncNow()` on appear.

References: [RevenueCat Sandbox Testing](https://www.revenuecat.com/docs/test-and-launch/sandbox)

#### C) Remove VoIP background mode (Guideline 2.5.4)

- Remove `<string>voip</string>` from `UIBackgroundModes` in `Info.plist`.
- Keep `audio` and `remote-notification` only.

References: [UIBackgroundModes key](https://developer.apple.com/documentation/bundleresources/information-property-list/uibackgroundmodes)

#### D) Receipt validation note & sandbox fallback

- We validate via RevenueCat servers; they handle sandbox vs production automatically for store receipts. No direct Apple receipt calls in our backend are required.
- If we later add direct Apple validation, implement: call Production first; on error 21007 (Sandbox receipt used in production), retry against Sandbox.

References:

- [Validating receipts with the App Store](https://developer.apple.com/documentation/storekit/validating-receipts-with-the-app-store)
- [Testing in Sandbox](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox)
- [Manage Sandbox Account](https://developer.apple.com/help/app-store-connect/test-in-app-purchases/manage-sandbox-apple-account-settings/)
- [RevenueCat Sandbox Testing](https://www.revenuecat.com/docs/test-and-launch/sandbox)

### Pseudo-edits (apply exactly)

- Info.plist (remove VoIP):
```diff
--- a/aniccaios/aniccaios/Info.plist
+++ b/aniccaios/aniccaios/Info.plist
@@
 <key>UIBackgroundModes</key>
 <array>
 	<string>audio</string>
-	<string>voip</string>
 	<string>remote-notification</string>
 </array>
```

- SettingsView (make row tappable + conditional sheet contents):
```diff
--- a/aniccaios/aniccaios/SettingsView.swift
+++ b/aniccaios/aniccaios/SettingsView.swift
@@
-                Section(String(localized: "settings_subscription_title")) {
-                    HStack {
-                        Text(String(localized: "settings_subscription_current_plan"))
-                        Spacer()
-                        Text(appState.subscriptionInfo.displayPlanName)
-                    }
+                Section(String(localized: "settings_subscription_title")) {
+                    Button {
+                        showingManageSubscription = true
+                    } label: {
+                        HStack {
+                            Text(String(localized: "settings_subscription_current_plan"))
+                            Spacer()
+                            Text(appState.subscriptionInfo.displayPlanName)
+                        }
+                    }
+                    .buttonStyle(.plain)
@@
-        .sheet(isPresented: $showingManageSubscription) {
-            RevenueCatUI.CustomerCenterView()
-                .onCustomerCenterRestoreCompleted { customerInfo in
-                    Task {
-                        let subscription = SubscriptionInfo(info: customerInfo)
-                        await MainActor.run { appState.updateSubscriptionInfo(subscription) }
-                        await SubscriptionManager.shared.syncNow()
-                    }
-                }
-        }
+        .sheet(isPresented: $showingManageSubscription) {
+            if appState.subscriptionInfo.plan == .free {
+                PaywallContainerView(forcePresent: true)
+                    .environment(\.locale, .autoupdatingCurrent)
+                    .task { await SubscriptionManager.shared.refreshOfferings() }
+            } else {
+                RevenueCatUI.CustomerCenterView()
+                    .environment(\.locale, .autoupdatingCurrent)
+                    .onCustomerCenterRestoreCompleted { customerInfo in
+                        Task {
+                            let subscription = SubscriptionInfo(info: customerInfo)
+                            await MainActor.run { appState.updateSubscriptionInfo(subscription) }
+                            await SubscriptionManager.shared.syncNow()
+                        }
+                    }
+            }
+        }
```

- ManageSubscriptionSheet (show current plan when free + optional subscribe label):
```diff
--- a/aniccaios/aniccaios/Views/ManageSubscriptionSheet.swift
+++ b/aniccaios/aniccaios/Views/ManageSubscriptionSheet.swift
@@
-                    // Current plan section
-                    if appState.subscriptionInfo.plan != .free {
-                        currentPlanSection
-                    }
+                    // Current plan section (show also when free)
+                    currentPlanSection
@@
-                            vm.title = String(localized: "settings_subscription_select")
+                            vm.title = appState.subscriptionInfo.plan == .free
+                                ? String(localized: "settings_subscription_subscribe")
+                                : String(localized: "settings_subscription_select")
```

- Localization additions (EN/JA) for in-app clarity:
```diff
--- a/aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
+++ b/aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
+ "settings_subscription_free_description" = "Up to 30 minutes per month. Monthly plan: 300 minutes/month. Annual plan: 3600 minutes/year.";
+ "settings_subscription_monthly_detail" = "Includes 300 minutes of voice conversations per month";
+ "settings_subscription_annual_detail" = "Includes 3600 minutes of voice conversations per year";
+ "settings_subscription_subscribe" = "Subscribe";

--- a/aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
+++ b/aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
+ "settings_subscription_free_description" = "月30分まで利用可能。月額: 月300分、年額: 年3,600分を含みます。";
+ "settings_subscription_monthly_detail" = "月300分の音声対話を含みます";
+ "settings_subscription_annual_detail" = "年間3,600分の音声対話を含みます";
+ "settings_subscription_subscribe" = "サブスクライブ";
```

- Plan card: add brief benefit lines (heuristics by identifier):
```diff
--- a/aniccaios/aniccaios/Views/ManageSubscriptionSheet.swift
+++ b/aniccaios/aniccaios/Views/ManageSubscriptionSheet.swift
@@
                         if !package.storeProduct.localizedDescription.isEmpty {
                             Text(package.storeProduct.localizedDescription)
                                 .font(.caption)
                                 .foregroundStyle(.secondary)
                         }
+                        if package.identifier.contains("monthly") || package.storeProduct.productIdentifier.contains("monthly") {
+                            Text("settings_subscription_monthly_detail").font(.caption).foregroundStyle(.secondary)
+                        } else if package.identifier.contains("annual") || package.storeProduct.productIdentifier.contains("annual") || package.identifier.contains("yearly") || package.storeProduct.productIdentifier.contains("yearly") {
+                            Text("settings_subscription_annual_detail").font(.caption).foregroundStyle(.secondary)
+                        }
```

- Paywall fallback localization (ensure localized keys used):
```diff
--- a/aniccaios/aniccaios/Components/PaywallContainerView.swift
+++ b/aniccaios/aniccaios/Components/PaywallContainerView.swift
@@
-            Text("paywall_unavailable_title")
+            Text(String(localized: "paywall_unavailable_title"))
@@
-            Button(String(localized: "paywall_retry_button")) {
+            Button(String(localized: "paywall_retry_button")) {
                 Task { await loadOffering() }
             }
@@
-            Button(String(localized: "common_close")) {
+            Button(String(localized: "common_close")) {
                 onDismissRequested?()
             }
```

- docs/APP.md (append a clear Receipt Validation Policy section):
```diff
--- a/docs/APP.md
+++ b/docs/APP.md
@@
+## Receipt Validation Policy
+
+We use RevenueCat for purchase handling and receipt validation. The app sends purchases to RevenueCat SDK, which forwards receipts to RevenueCat servers. RevenueCat validates against Apple and manages production/sandbox differences automatically.
+
+If we implement direct Apple receipt validation in our backend in the future, we will:
+1) Validate against Apple Production endpoint first.
+2) If the response indicates error 21007 (Sandbox receipt used in production), retry against the Sandbox endpoint.
+
+References:
+- Apple Subscriptions: https://developer.apple.com/app-store/subscriptions/
+- Receipt Validation: https://developer.apple.com/documentation/storekit/validating-receipts-with-the-app-store
+- Sandbox Testing: https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox
+- Manage Sandbox Account: https://developer.apple.com/help/app-store-connect/test-in-app-purchases/manage-sandbox-apple-account-settings/
+- RevenueCat Sandbox: https://www.revenuecat.com/docs/test-and-launch/sandbox
```


### Notes

- Ensure Account Holder accepted Paid Apps Agreement in App Store Connect.
- Test on iPadOS 26.1 with a sandbox account: tapping "Current Plan – Free plan" presents the paywall; subscribed users see Customer Center.
- RevenueCat dashboard > Customers: verify events and entitlement updates.

### To-dos

- [ ] Remove voip from UIBackgroundModes in Info.plist
- [ ] Make Current Plan row tappable and present appropriate sheet
- [ ] Show current plan section even when free plan
- [ ] Add EN/JA strings for subscription benefit details
- [ ] Update docs/APP.md on receipt validation and sandbox fallback
- [ ] Provide EN/JA App Store Connect product copy for subscriptions