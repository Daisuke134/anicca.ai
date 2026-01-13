import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, Flower2, Sparkles, Bell } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { PurchasesPackage } from 'react-native-purchases';

const features = [
  {
    icon: Sparkles,
    title: 'Premium Verses',
    description: 'Unlock 22 additional Dhammapada teachings',
  },
  {
    icon: Bell,
    title: 'More Reminders',
    description: 'Up to 10 mindfulness moments per day',
  },
  {
    icon: Flower2,
    title: 'Bookmarking',
    description: 'Save your favorite verses',
  },
];

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = Colors.light;
  const [selectedPlan, setSelectedPlan] = useState<'yearly' | 'monthly'>('yearly');

  const {
    currentOffering,
    isLoadingOfferings,
    purchasePackage,
    restorePurchases,
    isPurchasing,
    isRestoring,
    isPremium
  } = useRevenueCat();

  const monthlyPackage = currentOffering?.availablePackages.find(
    pkg => pkg.identifier === 'daily_dharma_monthly' || pkg.identifier === '$rc_monthly'
  );
  const yearlyPackage = currentOffering?.availablePackages.find(
    pkg => pkg.identifier === 'daily_dharma_yearly' || pkg.identifier === '$rc_annual'
  );

  const handlePurchase = async () => {
    const pkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
    if (!pkg) {
      console.log('[Paywall] No package available');
      Alert.alert('Error', 'Subscription plans are not available. Please try again later.');
      return;
    }

    console.log('[Paywall] Purchasing:', pkg.identifier);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await purchasePackage(pkg);
      console.log('[Paywall] Purchase successful');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Purchase failed';
      console.error('[Paywall] Purchase error:', errorMessage);
      if (!errorMessage.includes('cancelled') && !errorMessage.includes('PURCHASE_CANCELLED')) {
        Alert.alert('Purchase Failed', 'Please try again later.');
      }
    }
  };

  const handleSelectPlan = (plan: 'yearly' | 'monthly') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlan(plan);
  };

  const handleRestore = async () => {
    console.log('[Paywall] Restoring purchases');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await restorePurchases();
      if (isPremium) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Restored', 'Your premium access has been restored.');
        router.replace('/');
      } else {
        Alert.alert('No Purchases', 'No previous purchases found.');
      }
    } catch (error) {
      console.error('[Paywall] Restore error:', error);
      Alert.alert('Restore Failed', 'Please try again later.');
    }
  };

  const handleSkip = () => {
    console.log('[Paywall] User skipped paywall');
    router.replace('/');
  };

  const formatPrice = (pkg: PurchasesPackage | undefined) => {
    if (!pkg) return '';
    return pkg.product.priceString;
  };

  const isLoading = isPurchasing || isRestoring;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={[styles.closeButton, { backgroundColor: colors.backgroundSecondary }]}
          onPress={handleSkip}
          activeOpacity={0.7}
          disabled={isLoading}
        >
          <X size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <View style={[styles.iconCircle, { backgroundColor: colors.backgroundSecondary }]}>
            <Flower2 size={48} color={colors.gold} strokeWidth={1.2} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            Deepen Your{'\n'}Practice
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Unlock more verses and reminders
          </Text>
        </View>

        <View style={styles.featuresSection}>
          {features.map((feature, index) => (
            <View
              key={index}
              style={[styles.featureRow, { borderBottomColor: colors.border }]}
            >
              <View style={[styles.featureIcon, { backgroundColor: colors.backgroundSecondary }]}>
                <feature.icon size={20} color={colors.gold} />
              </View>
              <View style={styles.featureText}>
                <Text style={[styles.featureTitle, { color: colors.text }]}>
                  {feature.title}
                </Text>
                <Text style={[styles.featureDescription, { color: colors.textMuted }]}>
                  {feature.description}
                </Text>
              </View>
              <Check size={18} color={colors.accent} />
            </View>
          ))}
        </View>

        {isLoadingOfferings ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              Loading plans...
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.pricingSection}>
              <TouchableOpacity
                style={[
                  styles.planOption,
                  selectedPlan === 'monthly' && styles.planOptionSelected,
                  { borderColor: selectedPlan === 'monthly' ? colors.gold : colors.border }
                ]}
                onPress={() => handleSelectPlan('monthly')}
                activeOpacity={0.8}
              >
                <View style={styles.planOptionHeader}>
                  <Text style={[styles.planOptionTitle, { color: colors.text }]}>Monthly</Text>
                  <View style={[
                    styles.radioCircle,
                    { borderColor: selectedPlan === 'monthly' ? colors.gold : colors.border }
                  ]}>
                    {selectedPlan === 'monthly' && (
                      <View style={[styles.radioSelected, { backgroundColor: colors.gold }]} />
                    )}
                  </View>
                </View>
                <Text style={[styles.planOptionPrice, { color: colors.text }]}>
                  {formatPrice(monthlyPackage) || '$2.99'}
                  <Text style={[styles.planOptionPeriod, { color: colors.textMuted }]}>/month</Text>
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.planOption,
                  selectedPlan === 'yearly' && styles.planOptionSelected,
                  { borderColor: selectedPlan === 'yearly' ? colors.gold : colors.border }
                ]}
                onPress={() => handleSelectPlan('yearly')}
                activeOpacity={0.8}
              >
                <View style={styles.planOptionHeader}>
                  <Text style={[styles.planOptionTitle, { color: colors.text }]}>Yearly</Text>
                  <View style={[
                    styles.radioCircle,
                    { borderColor: selectedPlan === 'yearly' ? colors.gold : colors.border }
                  ]}>
                    {selectedPlan === 'yearly' && (
                      <View style={[styles.radioSelected, { backgroundColor: colors.gold }]} />
                    )}
                  </View>
                </View>
                <Text style={[styles.planOptionPrice, { color: colors.text }]}>
                  {formatPrice(yearlyPackage) || '$19.99'}
                  <Text style={[styles.planOptionPeriod, { color: colors.textMuted }]}>/year</Text>
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.purchaseButton, { backgroundColor: colors.gold }]}
              onPress={handlePurchase}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              {isPurchasing ? (
                <ActivityIndicator size="small" color={Colors.light.background} />
              ) : (
                <Text style={styles.purchaseButtonText}>
                  Subscribe Now
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={isLoading}>
          <Text style={[styles.skipText, { color: colors.textMuted }]}>
            Continue with Free
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.restoreButton} 
          onPress={handleRestore}
          disabled={isLoading}
        >
          <Text style={[styles.restoreText, { color: colors.textSecondary }]}>
            {isRestoring ? 'Restoring...' : 'Restore Purchases'}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.termsText, { color: colors.textMuted }]}>
          Cancel anytime • Auto-renews unless cancelled
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: '300' as const,
    textAlign: 'center',
    lineHeight: 42,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 17,
    textAlign: 'center',
  },
  featuresSection: {
    marginBottom: 32,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 14,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '500' as const,
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: 14,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
  },
  pricingSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  planOption: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: Colors.light.card,
  },
  planOptionSelected: {
    backgroundColor: Colors.light.backgroundSecondary,
  },
  planOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planOptionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  planOptionPrice: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  planOptionPeriod: {
    fontSize: 14,
    fontWeight: '400' as const,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  purchaseButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  purchaseButtonText: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.light.background,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  restoreText: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  termsText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
});
