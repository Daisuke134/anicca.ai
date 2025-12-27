<!-- 6b0c3c31-b2cc-4e61-bdce-8b61697c1007 25127995-d68a-47a9-aec9-b67486e15fff -->
# 修正方針（実装はせず、疑似パッチのみ）

## 背景（原因）

- AlarmKitの許可が **`denied`** になった後は、一般的なiOSの権限と同様に **アプリからOSの許可ダイアログを再表示できません**。そのため、トグルON → `requestAuthorization()` → 何も出ずに denied のまま → モデル値を `false` に戻す、という流れになり **「タップしてもONにできない」**ように見えます。
- 習慣一覧のOFFアニメが崩れるのは、`List`内で **同じ操作で「トグル状態の変更」と「セクション移動(=並び替え/要素の再構成)」を同じwithAnimationで同時に起こしている**のが主因です。

## 疑似パッチ（差分）

### 1) AlarmKit: denied/restricted で requestAuthorization を呼ばず、UI側は設定誘導

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Notifications/AlarmKitHabitCoordinator.swift
@@
     func requestAuthorizationIfNeeded() async -> Bool {
         do {
             let currentState = manager.authorizationState
             logger.info("Current AlarmKit authorization state: \(String(describing: currentState), privacy: .public)")
             
             if currentState == .authorized {
                 return true
             }
+
+            // NOTE:
+            // 一度 denied/restricted になると、アプリからOSの許可ダイアログを再提示できない。
+            // このケースはUI側で「設定を開く」導線を出す（ここでは false を返すだけ）。
+            if currentState == .denied || currentState == .restricted {
+                return false
+            }
             
-            // iOS 18+: requestAuthorization() を再度呼ぶとダイアログを再提示できる
+            // notDetermined のときだけ requestAuthorization() でOSダイアログを出す
             let state = try await manager.requestAuthorization()
             logger.info("AlarmKit authorization result: \(String(describing: state), privacy: .public)")
             return state == .authorized
         } catch {
             logger.error("AlarmKit authorization failed: \(error.localizedDescription, privacy: .public). Ensure NSAlarmKitUsageDescription is set in Info.plist")
             return false
         }
     }
*** End Patch
```

### 2) 「フルスクリーンアラーム」トグル: denied時にアラート表示→設定アプリへ

（該当: `HabitEditSheet` / `CustomHabitEditSheet` の AlarmKit トグル）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Habits/HabitsSectionView.swift
@@
 struct HabitEditSheet: View {
@@
     @Environment(\.dismiss) private var dismiss
+
+    // AlarmKit denied/restricted のときに設定アプリへ誘導する
+    @State private var isShowingAlarmKitSettingsAlert = false
@@
     var body: some View {
         NavigationView {
             Form {
@@
             }
@@
         }
         .onAppear {
             load()
             followups = appState.followupCount(for: habit)
         }
+        .alert(String(localized: "onboarding_alarmkit_settings_needed"), isPresented: $isShowingAlarmKitSettingsAlert) {
+            Button(String(localized: "common_open_settings")) { openSystemSettings() }
+            Button(String(localized: "common_ok"), role: .cancel) {}
+        } message: {
+            Text(String(localized: "onboarding_alarmkit_settings_message"))
+        }
     }
@@
 #if canImport(AlarmKit)
     @available(iOS 26.0, *)
     @ViewBuilder
     private var alarmKitToggle: some View {
         switch habit {
         case .wake:
             Toggle(
                 String(localized: "settings_alarmkit_toggle"),
-                isOn: alarmKitPermissionBinding(appState: appState, keyPath: \.useAlarmKitForWake)
+                isOn: alarmKitPermissionBinding(
+                    appState: appState,
+                    keyPath: \.useAlarmKitForWake,
+                    onSettingsNeeded: { isShowingAlarmKitSettingsAlert = true }
+                )
             )
         case .training:
             Toggle(
                 String(localized: "settings_alarmkit_toggle"),
-                isOn: alarmKitPermissionBinding(appState: appState, keyPath: \.useAlarmKitForTraining)
+                isOn: alarmKitPermissionBinding(
+                    appState: appState,
+                    keyPath: \.useAlarmKitForTraining,
+                    onSettingsNeeded: { isShowingAlarmKitSettingsAlert = true }
+                )
             )
         case .bedtime:
             Toggle(
                 String(localized: "settings_alarmkit_toggle"),
-                isOn: alarmKitPermissionBinding(appState: appState, keyPath: \.useAlarmKitForBedtime)
+                isOn: alarmKitPermissionBinding(
+                    appState: appState,
+                    keyPath: \.useAlarmKitForBedtime,
+                    onSettingsNeeded: { isShowingAlarmKitSettingsAlert = true }
+                )
             )
         case .custom:
             Toggle(
                 String(localized: "settings_alarmkit_toggle"),
-                isOn: alarmKitPermissionBinding(appState: appState, keyPath: \.useAlarmKitForCustom)
+                isOn: alarmKitPermissionBinding(
+                    appState: appState,
+                    keyPath: \.useAlarmKitForCustom,
+                    onSettingsNeeded: { isShowingAlarmKitSettingsAlert = true }
+                )
             )
         }
     }
 #endif
+
+    private func openSystemSettings() {
+        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
+        UIApplication.shared.open(url)
+    }
 }
@@
 struct CustomHabitEditSheet: View {
@@
     @State private var followups: Int = 2
+
+    @State private var isShowingAlarmKitSettingsAlert = false
@@
     var body: some View {
         NavigationView {
             Form {
@@
                 if #available(iOS 26.0, *) {
                     Section(String(localized: "settings_alarmkit_section_title")) {
                         Toggle(
                             String(localized: "settings_alarmkit_toggle"),
-                            isOn: alarmKitPermissionBinding(appState: appState, keyPath: \.useAlarmKitForCustom)
+                            isOn: alarmKitPermissionBinding(
+                                appState: appState,
+                                keyPath: \.useAlarmKitForCustom,
+                                onSettingsNeeded: { isShowingAlarmKitSettingsAlert = true }
+                            )
                         )
                         Text(String(localized: "settings_alarmkit_description"))
                             .font(.footnote)
                             .foregroundStyle(.secondary)
                     }
                 }
@@
         }
@@
         .onAppear {
@@
         }
+        .alert(String(localized: "onboarding_alarmkit_settings_needed"), isPresented: $isShowingAlarmKitSettingsAlert) {
+            Button(String(localized: "common_open_settings")) { openSystemSettings() }
+            Button(String(localized: "common_ok"), role: .cancel) {}
+        } message: {
+            Text(String(localized: "onboarding_alarmkit_settings_message"))
+        }
     }
+
+    private func openSystemSettings() {
+        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
+        UIApplication.shared.open(url)
+    }
 }
@@
 #if canImport(AlarmKit)
 @available(iOS 26.0, *)
-private func alarmKitPermissionBinding(appState: AppState, keyPath: WritableKeyPath<UserProfile, Bool>) -> Binding<Bool> {
+private func alarmKitPermissionBinding(
+    appState: AppState,
+    keyPath: WritableKeyPath<UserProfile, Bool>,
+    onSettingsNeeded: @escaping () -> Void
+) -> Binding<Bool> {
     Binding(
         get: { appState.userProfile[keyPath: keyPath] },
         set: { newValue in
             let currentValue = appState.userProfile[keyPath: keyPath]
             guard currentValue != newValue else { return }
 
             if newValue {
                 Task { @MainActor in
-                    let granted = await AlarmKitHabitCoordinator.shared.requestAuthorizationIfNeeded()
+                    // denied/restricted の場合はOSダイアログは出せないので、アプリ内アラート→設定へ
+                    let state = AlarmManager.shared.authorizationState
+                    if state == .denied || state == .restricted {
+                        onSettingsNeeded()
+                        var profile = appState.userProfile
+                        profile[keyPath: keyPath] = false
+                        appState.updateUserProfile(profile, sync: true)
+                        return
+                    }
+
+                    let granted = await AlarmKitHabitCoordinator.shared.requestAuthorizationIfNeeded()
+                    if !granted {
+                        // notDetermined から拒否された場合も設定導線を出す
+                        onSettingsNeeded()
+                    }
                     var profile = appState.userProfile
                     profile[keyPath: keyPath] = granted
                     appState.updateUserProfile(profile, sync: true)
                 }
             } else {
                 var profile = appState.userProfile
                 profile[keyPath: keyPath] = false
                 appState.updateUserProfile(profile, sync: true)
             }
         }
     )
 }
 #endif
*** End Patch
```

### 3) 習慣一覧トグルOFF時のアニメーション崩れ: 「トグルOFF」と「セクション移動」を分離

（`HabitsSectionView.habitRow` / `customHabitRow` のOFF処理）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Habits/HabitsSectionView.swift
@@
             Toggle("", isOn: Binding(
                 get: { activeHabits.contains(habit) },
                 set: { isOn in
                     withAnimation(.easeInOut(duration: 0.18)) {
                         if isOn {
@@
                         } else {
-                            // トグルOFF時はAppStateからも削除して永続化
-                            activeHabits.remove(habit)
-                            habitTimes.removeValue(forKey: habit)
-                            appState.removeHabitSchedule(habit)
+                            // 1) まずトグル状態だけをアニメーション（行の移動/セクション移動は起こさない）
+                            activeHabits.remove(habit)
+
+                            // 2) 少し遅延して、構造変化（schedule削除＝セクション移動）をアニメ無しで実行
+                            Task { @MainActor in
+                                try? await Task.sleep(nanoseconds: 220_000_000)
+                                var t = Transaction()
+                                t.disablesAnimations = true
+                                withTransaction(t) {
+                                    habitTimes.removeValue(forKey: habit)
+                                    appState.removeHabitSchedule(habit)
+                                }
+                            }
                         }
                     }
                 }
             ))
             .labelsHidden()
             .tint(AppTheme.Colors.accent)
-            .animation(.easeInOut(duration: 0.18), value: activeHabits)
+            // NOTE: withAnimation側で制御する（ここでList構造変化まで巻き込むと崩れやすい）
         }
@@
             Toggle("", isOn: Binding(
                 get: { activeCustomHabits.contains(id) },
                 set: { isOn in
                     withAnimation(.easeInOut(duration: 0.18)) {
                         if isOn {
@@
                         } else {
-                            // トグルOFF時はAppStateからも削除して永続化
-                            activeCustomHabits.remove(id)
-                            customHabitTimes.removeValue(forKey: id)
-                            appState.updateCustomHabitSchedule(id: id, time: nil)
+                            activeCustomHabits.remove(id)
+
+                            Task { @MainActor in
+                                try? await Task.sleep(nanoseconds: 220_000_000)
+                                var t = Transaction()
+                                t.disablesAnimations = true
+                                withTransaction(t) {
+                                    customHabitTimes.removeValue(forKey: id)
+                                    appState.updateCustomHabitSchedule(id: id, time: nil)
+                                }
+                            }
                         }
                     }
                 }
             ))
             .labelsHidden()
             .tint(AppTheme.Colors.accent)
-            .animation(.easeInOut(duration: 0.18), value: activeCustomHabits)
         }
*** End Patch
```

## 期待される挙動

- **AlarmKit**: denied のときはOSダイアログは出ない代わりに、**アプリ内ダイアログが出て「設定を開く」**が押せる → 設定で許可後に戻って再度ONすればONになる。
- **習慣一覧**: OFFにした瞬間はトグルだけ自然に切り替わり、その後の「下へ移動/未設定セクションへ移動」は **変な液状アニメにならず**安定して更新される。

---

（注）ユーザー要望どおり、この回答は **実装はせず疑似パッチのみ**です。