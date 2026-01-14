import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, Linking, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Bell, Sun, Moon, Clock, ExternalLink, Crown, Info, Shield, FileText, FlaskConical, Sunrise } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import Colors from '@/constants/colors';
import { useApp } from '@/providers/AppProvider';
import { getDailyVerse, getRandomStayPresentMessage } from '@/data/verses';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, isPremium } = useApp();
  const colors = settings.darkMode ? Colors.dark : Colors.light;

  const handleFrequencyChange = (frequency: 3 | 5 | 7 | 10) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSettings({ notificationFrequency: frequency });
  };

  const handleDarkModeToggle = (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSettings({ darkMode: value });
  };

  const FrequencyButton = ({ value, label }: { value: 3 | 5 | 7 | 10; label: string }) => {
    const isSelected = settings.notificationFrequency === value;
    return (
      <TouchableOpacity
        style={[
          styles.frequencyButton,
          {
            backgroundColor: isSelected ? colors.gold : colors.backgroundSecondary,
            borderColor: isSelected ? colors.gold : colors.border,
          },
        ]}
        onPress={() => handleFrequencyChange(value)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.frequencyButtonText,
            { color: isSelected ? Colors.light.background : colors.textSecondary },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Settings',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <ChevronLeft size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {!isPremium && (
          <TouchableOpacity
            style={[styles.premiumBanner, { backgroundColor: colors.gold }]}
            onPress={() => router.push('/paywall')}
            activeOpacity={0.8}
          >
            <Crown size={24} color={Colors.light.background} />
            <View style={styles.premiumBannerText}>
              <Text style={styles.premiumTitle}>Unlock Premium</Text>
              <Text style={styles.premiumSubtitle}>Full library & unlimited features</Text>
            </View>
            <ChevronLeft size={20} color={Colors.light.background} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>APPEARANCE</Text>
          <View style={[styles.settingRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.settingLeft}>
              {settings.darkMode ? (
                <Moon size={20} color={colors.textSecondary} />
              ) : (
                <Sun size={20} color={colors.textSecondary} />
              )}
              <Text style={[styles.settingLabel, { color: colors.text }]}>Dark Mode</Text>
            </View>
            <Switch
              value={settings.darkMode}
              onValueChange={handleDarkModeToggle}
              trackColor={{ false: colors.border, true: colors.gold }}
              thumbColor={Colors.light.background}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>STAY PRESENT REMINDERS</Text>
          <View style={[styles.settingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.settingCardHeader}>
              <Bell size={20} color={colors.textSecondary} />
              <Text style={[styles.settingLabel, { color: colors.text }]}>Daily Frequency</Text>
            </View>
            <Text style={[styles.settingDescription, { color: colors.textMuted }]}>
              How many mindfulness reminders per day
            </Text>
            {isPremium ? (
              <View style={styles.frequencyButtons}>
                <FrequencyButton value={3} label="3x" />
                <FrequencyButton value={5} label="5x" />
                <FrequencyButton value={7} label="7x" />
                <FrequencyButton value={10} label="10x" />
              </View>
            ) : (
              <View style={styles.frequencyFixed}>
                <Text style={[styles.frequencyFixedText, { color: colors.text }]}>
                  3x per day
                </Text>
                <TouchableOpacity onPress={() => router.push('/paywall')}>
                  <Text style={[styles.upgradeLink, { color: colors.gold }]}>
                    Upgrade for more
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>MORNING VERSE</Text>
          <View style={[styles.settingRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.settingLeft}>
              <Clock size={20} color={colors.textSecondary} />
              <Text style={[styles.settingLabel, { color: colors.text }]}>Notification Time</Text>
            </View>
            <Text style={[styles.settingValue, { color: colors.textMuted }]}>
              {settings.morningNotificationTime}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>ABOUT</Text>
          <TouchableOpacity
            style={[styles.settingRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => Linking.openURL('https://en.wikipedia.org/wiki/Dhammapada')}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <Info size={20} color={colors.textSecondary} />
              <Text style={[styles.settingLabel, { color: colors.text }]}>About the Dhammapada</Text>
            </View>
            <ExternalLink size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>LEGAL</Text>
          <TouchableOpacity
            style={[styles.settingRow, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 8 }]}
            onPress={() => Linking.openURL('https://aniccaai.com/dailydharma/privacy')}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <Shield size={20} color={colors.textSecondary} />
              <Text style={[styles.settingLabel, { color: colors.text }]}>Privacy Policy</Text>
            </View>
            <ExternalLink size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.settingRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <FileText size={20} color={colors.textSecondary} />
              <Text style={[styles.settingLabel, { color: colors.text }]}>Terms of Service</Text>
            </View>
            <ExternalLink size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {__DEV__ && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>DEVELOPER</Text>

            {/* Test Morning Verse */}
            <TouchableOpacity
              style={[styles.settingRow, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 8 }]}
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const verse = getDailyVerse(isPremium);
                const body = verse.text.length > 100
                  ? verse.text.substring(0, 100) + '...'
                  : verse.text;

                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: 'Daily Dharma ☀️',
                    body: body,
                    data: { verseId: verse.id },
                  },
                  trigger: null,
                });

                Alert.alert('Morning Verse Test', `✅ Sent!\n\n"${body}"`);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.settingLeft}>
                <Sunrise size={20} color={colors.gold} />
                <Text style={[styles.settingLabel, { color: colors.text }]}>Test Morning Verse</Text>
              </View>
            </TouchableOpacity>

            {/* Test Stay Present */}
            <TouchableOpacity
              style={[styles.settingRow, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 8 }]}
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const message = getRandomStayPresentMessage();

                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: 'Daily Dharma 🧘',
                    body: message,
                  },
                  trigger: null,
                });

                Alert.alert('Stay Present Test', `✅ Sent!\n\n"${message}"`);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.settingLeft}>
                <Bell size={20} color={colors.gold} />
                <Text style={[styles.settingLabel, { color: colors.text }]}>Test Stay Present</Text>
              </View>
            </TouchableOpacity>

            {/* Show Scheduled Notifications */}
            <TouchableOpacity
              style={[styles.settingRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const scheduled = await Notifications.getAllScheduledNotificationsAsync();

                console.log('[Test] Scheduled notifications count:', scheduled.length);
                scheduled.forEach((n, i) => {
                  console.log(`[Test] Notification ${i + 1}:`, {
                    id: n.identifier,
                    title: n.content.title,
                    body: n.content.body,
                    trigger: n.trigger,
                  });
                });

                const summary = scheduled.map(n => {
                  const trigger = n.trigger as { dateComponents?: { hour?: number; minute?: number } };
                  const time = trigger.dateComponents
                    ? `${trigger.dateComponents.hour}:${String(trigger.dateComponents.minute).padStart(2, '0')}`
                    : 'unknown';
                  return `• ${time} - ${n.identifier}`;
                }).join('\n');

                Alert.alert(
                  'Scheduled Notifications',
                  `📋 ${scheduled.length} notifications\n\n${summary}\n\nCheck console for details.`
                );
              }}
              activeOpacity={0.7}
            >
              <View style={styles.settingLeft}>
                <FlaskConical size={20} color={colors.gold} />
                <Text style={[styles.settingLabel, { color: colors.text }]}>Show Scheduled</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        <Text style={[styles.versionText, { color: colors.textMuted }]}>
          Daily Dharma v1.0.0
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    gap: 12,
  },
  premiumBannerText: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.background,
  },
  premiumSubtitle: {
    fontSize: 13,
    color: Colors.light.background,
    opacity: 0.9,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    fontSize: 16,
  },
  settingValue: {
    fontSize: 16,
  },
  settingCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  settingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  settingDescription: {
    fontSize: 14,
    marginBottom: 16,
    marginLeft: 32,
  },
  frequencyButtons: {
    flexDirection: 'row',
    gap: 12,
    marginLeft: 32,
  },
  frequencyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  frequencyButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  frequencyFixed: {
    marginLeft: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  frequencyFixedText: {
    fontSize: 16,
    fontWeight: '600',
  },
  upgradeLink: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 13,
    marginTop: 24,
  },
});
