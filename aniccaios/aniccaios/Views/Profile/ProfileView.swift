import SwiftUI

/// v0.3 Profile タブ（v3-ui.md 準拠）
struct ProfileView: View {
    @EnvironmentObject private var appState: AppState

    // Data Integration: 最小は @AppStorage（フェーズ7でセンサー送信開始/停止へ接続）
    @AppStorage("com.anicca.dataIntegration.screenTimeEnabled") private var screenTimeEnabled = false
    @AppStorage("com.anicca.dataIntegration.sleepEnabled") private var sleepEnabled = false
    @AppStorage("com.anicca.dataIntegration.stepsEnabled") private var stepsEnabled = false
    @AppStorage("com.anicca.dataIntegration.motionEnabled") private var motionEnabled = false

    @State private var showingManageSubscription = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    header

                    accountCard
                    traitsCard
                    idealsSection
                    strugglesSection
                    nudgeStrengthSection
                    stickyModeSection
                    dataIntegrationSection

                    // Account Management / Legal は既存 SettingsView 実装を流用できるが、
                    // フェーズ6ではまずUIの骨格をここに揃える（導線統合は別パッチで整理）
                    LegalLinksView()
                }
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, AppTheme.Spacing.md)
            }
            .background(AppBackground())
        }
        .sheet(isPresented: $showingManageSubscription) {
            // 既存 SettingsView の subscriptionSheetContent 相当を後で共通化する想定
            SettingsView()
                .environmentObject(appState)
        }
    }

    private var header: some View {
        Text("Profile")
            .font(.system(size: 30, weight: .bold))
            .foregroundStyle(AppTheme.Colors.label)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 6)
    }

    private var accountCard: some View {
        CardView(cornerRadius: 32) {
            VStack(spacing: 0) {
                row(label: "Name", value: appState.userProfile.displayName.isEmpty ? "-" : appState.userProfile.displayName)
                divider
                Button {
                    showingManageSubscription = true
                } label: {
                    row(label: "Plan", value: appState.subscriptionInfo.displayPlanName, showsChevron: true)
                }
                .buttonStyle(.plain)
                divider
                row(label: "Language", value: appState.userProfile.preferredLanguage.languageLine)
            }
        }
    }

    private var traitsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your Traits")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            CardView(cornerRadius: 28) {
                VStack(spacing: 14) {
                    Text("You're highly agreeable and open to new experiences, balancing structure with flexibility.")
                        .font(.system(size: 16))
                        .foregroundStyle(AppTheme.Colors.label)
                        .multilineTextAlignment(.center)

                    // keywords はフェーズ3で AppState/UserProfile に導入（ここでは見た目だけ固定）
                    HStack(spacing: 8) {
                        chip("Openness")
                        chip("Agreeableness")
                        chip("Conscientiousness")
                    }
                    .frame(maxWidth: .infinity, alignment: .center)

                    NavigationLink {
                        TraitsDetailView()
                    } label: {
                        HStack {
                            Text("View full trait profile")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(AppTheme.Colors.label)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        }
                        .padding(.top, 6)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var idealsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Ideal Self")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            FlowChips(options: [
                "Kind", "Altruistic", "Confident", "Mindful", "Honest", "Open", "Courageous"
            ])
        }
    }

    private var strugglesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Current Struggles")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            FlowChips(options: [
                "Rumination", "Jealousy", "Self-Criticism", "Anxiety", "Loneliness", "Irritation"
            ])
        }
    }

    private var nudgeStrengthSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Nudge strength")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            // フェーズ3で NudgeIntensity を導入する前提（フェーズ6ではUI骨格のみ）
            CardView(cornerRadius: 999) {
                HStack(spacing: 8) {
                    pill("Quiet", isSelected: false)
                    pill("Normal", isSelected: true)
                    pill("Active", isSelected: false)
                }
            }
        }
    }

    private var stickyModeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sticky Mode")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            CardView(cornerRadius: 28) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Sticky Mode")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(AppTheme.Colors.label)
                        Spacer()
                        Toggle("", isOn: Binding(
                            get: { appState.userProfile.stickyModeEnabled },
                            set: { v in
                                var p = appState.userProfile
                                p.stickyModeEnabled = v
                                appState.updateUserProfile(p, sync: true)
                            }
                        ))
                        .labelsHidden()
                    }
                    Text("When ON, Anicca keeps talking until you respond 5 times.")
                        .font(AppTheme.Typography.caption1Dynamic)
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
            }
        }
    }

    private var dataIntegrationSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Data Integration")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            Text("Optional. Link your data so Anicca can nudge you more precisely. All core features work even if everything is OFF.")
                .font(AppTheme.Typography.caption1Dynamic)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)

            CardView(cornerRadius: 28) {
                VStack(spacing: 0) {
                    Toggle("Screen Time", isOn: $screenTimeEnabled)
                        .tint(AppTheme.Colors.accent)
                    divider
                    Toggle("Sleep (HealthKit)", isOn: $sleepEnabled)
                        .tint(AppTheme.Colors.accent)
                    divider
                    Toggle("Steps (HealthKit)", isOn: $stepsEnabled)
                        .tint(AppTheme.Colors.accent)
                    divider
                    Toggle("Movement", isOn: $motionEnabled)
                        .tint(AppTheme.Colors.accent)
                }
            }
        }
    }

    private func row(label: String, value: String, showsChevron: Bool = false) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            Spacer()
            HStack(spacing: 6) {
                Text(value)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                if showsChevron {
                    Image(systemName: "chevron.right")
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .opacity(0.6)
                }
            }
        }
        .padding(.vertical, 14)
    }

    private var divider: some View {
        Rectangle()
            .fill(AppTheme.Colors.borderLight.opacity(0.6))
            .frame(height: 1)
    }

    private func chip(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12, weight: .medium))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(AppTheme.Colors.buttonUnselected)
            .clipShape(Capsule())
    }

    private func pill(_ text: String, isSelected: Bool) -> some View {
        Text(text)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.secondaryLabel)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(isSelected ? AppTheme.Colors.buttonSelected : Color.clear)
            .clipShape(Capsule())
    }
}

/// v0.3: pill 風のチップ群（実装は最小。フェーズ4/3の traits 保存に接続する）
private struct FlowChips: View {
    let options: [String]
    @State private var selected: Set<String> = []

    var body: some View {
        // LazyVGrid で擬似的に折り返し
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 10)], spacing: 10) {
            ForEach(options, id: \.self) { item in
                let isOn = selected.contains(item)
                Button {
                    if isOn { selected.remove(item) } else { selected.insert(item) }
                    // NOTE: 本保存（AppState.updateTraits）はフェーズ3のフィールド追加後に接続する
                } label: {
                    Text(item)
                        .font(.system(size: 14, weight: .medium))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity)
                        .background(isOn ? AppTheme.Colors.buttonSelected : AppTheme.Colors.cardBackground)
                        .foregroundStyle(isOn ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.label)
                        .overlay(
                            RoundedRectangle(cornerRadius: 999, style: .continuous)
                                .stroke(AppTheme.Colors.border.opacity(0.2), lineWidth: 1)
                        )
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

