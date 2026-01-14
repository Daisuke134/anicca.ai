import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Platform,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { Flower2, Bell, Sparkles } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/providers/AppProvider';

const { width } = Dimensions.get('window');

interface OnboardingPage {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

const pages: OnboardingPage[] = [
  {
    id: '1',
    title: 'Ancient wisdom for\nmodern minds',
    subtitle: 'Find peace in the timeless teachings\nof the Dhammapada',
    icon: <Flower2 size={80} color={Colors.light.gold} strokeWidth={1.2} />,
  },
  {
    id: '2',
    title: 'Daily verses on\nyour lock screen',
    subtitle: 'Start each day with wisdom\nthat transforms your perspective',
    icon: <Sparkles size={80} color={Colors.light.gold} strokeWidth={1.2} />,
  },
  {
    id: '3',
    title: 'Stay present\nthroughout the day',
    subtitle: 'Gentle reminders to bring you back\nto the present moment',
    icon: <Bell size={80} color={Colors.light.gold} strokeWidth={1.2} />,
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useApp();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const requestNotificationPermission = async () => {
    console.log('[Onboarding] Requesting notification permission');
    if (Platform.OS !== 'web') {
      const { status } = await Notifications.requestPermissionsAsync();
      console.log('[Onboarding] Notification permission status:', status);
    }
  };

  const handleNext = async () => {
    if (currentIndex < pages.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      await requestNotificationPermission();
      completeOnboarding();
      router.replace('/paywall');
    }
  };

  const handleSkip = () => {
    completeOnboarding();
    router.replace('/');
  };

  const renderPage = ({ item, index }: { item: OnboardingPage; index: number }) => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    
    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.3, 1, 0.3],
      extrapolate: 'clamp',
    });

    const scale = scrollX.interpolate({
      inputRange,
      outputRange: [0.8, 1, 0.8],
      extrapolate: 'clamp',
    });

    return (
      <View style={[styles.page, { width }]}>
        <Animated.View style={[styles.iconContainer, { opacity, transform: [{ scale }] }]}>
          <View style={styles.iconCircle}>
            {item.icon}
          </View>
        </Animated.View>
        <Animated.View style={{ opacity }}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle}>{item.subtitle}</Text>
        </Animated.View>
      </View>
    );
  };

  const renderDots = () => (
    <View style={styles.dotsContainer}>
      {pages.map((_, index) => {
        const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
        
        const dotWidth = scrollX.interpolate({
          inputRange,
          outputRange: [8, 24, 8],
          extrapolate: 'clamp',
        });

        const opacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.4, 1, 0.4],
          extrapolate: 'clamp',
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              { width: dotWidth, opacity },
            ]}
          />
        );
      })}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <Animated.FlatList
        ref={flatListRef}
        data={pages}
        renderItem={renderPage}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
        scrollEventThrottle={16}
      />

      {renderDots()}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>
            {currentIndex === pages.length - 1 ? 'Enable Notifications' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  skipButton: {
    padding: 8,
  },
  skipText: {
    fontSize: 16,
    color: Colors.light.textMuted,
    fontWeight: '500',
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    marginBottom: 48,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.light.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  title: {
    fontSize: 32,
    fontWeight: '300',
    color: Colors.light.text,
    textAlign: 'center',
    lineHeight: 42,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 17,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.gold,
  },
  footer: {
    paddingHorizontal: 24,
  },
  nextButton: {
    backgroundColor: Colors.light.text,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  nextButtonText: {
    color: Colors.light.background,
    fontSize: 17,
    fontWeight: '600',
  },
});
