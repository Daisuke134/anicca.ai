import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { 
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL
} from 'react-native-purchases';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';

function getRCToken() {
  if (__DEV__ || Platform.OS === 'web') {
    return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
  }
  return Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    default: process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY,
  });
}

const apiKey = getRCToken();

if (apiKey) {
  console.log('[RevenueCat] Configuring with API key');
  Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
} else {
  console.warn('[RevenueCat] No API key found');
}

export const [RevenueCatProvider, useRevenueCat] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [isConfigured] = useState(!!apiKey);

  const customerInfoQuery = useQuery({
    queryKey: ['revenuecat-customer-info', isConfigured],
    queryFn: async () => {
      if (!isConfigured) {
        console.log('[RevenueCat] Not configured, returning null');
        return null;
      }
      console.log('[RevenueCat] Fetching customer info');
      const info = await Purchases.getCustomerInfo();
      console.log('[RevenueCat] Customer info:', info.entitlements.active);
      return info;
    },
    enabled: isConfigured,
    staleTime: 1000 * 60 * 5,
  });

  const offeringsQuery = useQuery({
    queryKey: ['revenuecat-offerings', isConfigured],
    queryFn: async () => {
      if (!isConfigured) {
        console.log('[RevenueCat] Not configured, returning null');
        return null;
      }
      console.log('[RevenueCat] Fetching offerings');
      const offerings = await Purchases.getOfferings();
      console.log('[RevenueCat] Offerings:', offerings.current?.identifier);
      return offerings;
    },
    enabled: isConfigured,
    staleTime: 1000 * 60 * 10,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      console.log('[RevenueCat] Purchasing package:', pkg.identifier);
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    onSuccess: (customerInfo) => {
      console.log('[RevenueCat] Purchase successful');
      queryClient.setQueryData(['revenuecat-customer-info'], customerInfo);
    },
    onError: (error: Error) => {
      console.error('[RevenueCat] Purchase error:', error.message);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      console.log('[RevenueCat] Restoring purchases');
      const customerInfo = await Purchases.restorePurchases();
      return customerInfo;
    },
    onSuccess: (customerInfo) => {
      console.log('[RevenueCat] Restore successful');
      queryClient.setQueryData(['revenuecat-customer-info'], customerInfo);
    },
    onError: (error: Error) => {
      console.error('[RevenueCat] Restore error:', error.message);
    },
  });

  useEffect(() => {
    if (!isConfigured) return;

    const listener = (customerInfo: CustomerInfo) => {
      console.log('[RevenueCat] Customer info updated');
      queryClient.setQueryData(['revenuecat-customer-info'], customerInfo);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [isConfigured, queryClient]);

  const isPremium = customerInfoQuery.data?.entitlements.active['premium'] !== undefined;

  const currentOffering = offeringsQuery.data?.current ?? null;

  const { mutateAsync: purchasePackageAsync } = purchaseMutation;
  const { mutateAsync: restoreAsync } = restoreMutation;

  const purchasePackage = (pkg: PurchasesPackage) => {
    return purchasePackageAsync(pkg);
  };

  const restorePurchases = () => {
    return restoreAsync();
  };

  return {
    isConfigured,
    isPremium,
    customerInfo: customerInfoQuery.data ?? null,
    currentOffering,
    isLoadingOfferings: offeringsQuery.isLoading,
    isLoadingCustomerInfo: customerInfoQuery.isLoading,
    purchasePackage,
    restorePurchases,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    purchaseError: purchaseMutation.error,
    restoreError: restoreMutation.error,
  };
});
