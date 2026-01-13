import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { useRevenueCat } from './RevenueCatProvider';

interface AppSettings {
  hasCompletedOnboarding: boolean;
  isPremium: boolean;
  notificationFrequency: 3 | 5 | 7 | 10;
  morningNotificationTime: string;
  darkMode: boolean;
  bookmarkedVerses: number[];
}

const defaultSettings: AppSettings = {
  hasCompletedOnboarding: false,
  isPremium: false,
  notificationFrequency: 3,
  morningNotificationTime: '07:00',
  darkMode: false,
  bookmarkedVerses: [],
};

const STORAGE_KEY = 'daily_dharma_settings';

export const [AppProvider, useApp] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const { isPremium: rcIsPremium } = useRevenueCat();

  const settingsQuery = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      console.log('[AppProvider] Loading settings from storage');
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AppSettings;
        // Migration: Free users with frequency > 3 should be reset to 3
        if (!parsed.isPremium && parsed.notificationFrequency > 3) {
          console.log('[AppProvider] Migrating free user frequency from', parsed.notificationFrequency, 'to 3');
          parsed.notificationFrequency = 3;
        }
        console.log('[AppProvider] Loaded settings:', parsed);
        return parsed;
      }
      console.log('[AppProvider] No stored settings, using defaults');
      return defaultSettings;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (newSettings: AppSettings) => {
      console.log('[AppProvider] Saving settings:', newSettings);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
      return newSettings;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['app-settings'], data);
    },
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const { mutate: saveSettings } = saveMutation;

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    saveSettings(newSettings);
  }, [settings, saveSettings]);

  const completeOnboarding = useCallback(() => {
    console.log('[AppProvider] Completing onboarding');
    updateSettings({ hasCompletedOnboarding: true });
  }, [updateSettings]);

  const setPremium = useCallback((isPremium: boolean) => {
    console.log('[AppProvider] Setting premium:', isPremium);
    updateSettings({ isPremium });
  }, [updateSettings]);

  const isPremium = rcIsPremium || settings.isPremium;

  const toggleBookmark = useCallback((verseId: number) => {
    const bookmarks = settings.bookmarkedVerses.includes(verseId)
      ? settings.bookmarkedVerses.filter(id => id !== verseId)
      : [...settings.bookmarkedVerses, verseId];
    updateSettings({ bookmarkedVerses: bookmarks });
  }, [settings.bookmarkedVerses, updateSettings]);

  const isBookmarked = useCallback((verseId: number) => {
    return settings.bookmarkedVerses.includes(verseId);
  }, [settings.bookmarkedVerses]);

  return {
    settings,
    isPremium,
    isLoading: settingsQuery.isLoading,
    updateSettings,
    completeOnboarding,
    setPremium,
    toggleBookmark,
    isBookmarked,
  };
});
