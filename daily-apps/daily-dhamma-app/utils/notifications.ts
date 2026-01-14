import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getRandomStayPresentMessage, getDailyVerse } from '@/data/verses';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function scheduleMorningVerseNotification(time: string, isPremium: boolean) {
  if (Platform.OS === 'web') {
    console.log('[Notifications] Web platform - skipping morning verse notification');
    return;
  }

  console.log('[Notifications] Scheduling morning verse notification for:', time);
  
  await Notifications.cancelScheduledNotificationAsync('morning-verse');
  
  const [hours, minutes] = time.split(':').map(Number);
  const verse = getDailyVerse(isPremium);
  
  await Notifications.scheduleNotificationAsync({
    identifier: 'morning-verse',
    content: {
      title: 'Daily Dharma',
      body: verse.text.length > 100 ? verse.text.substring(0, 100) + '...' : verse.text,
      data: { verseId: verse.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hours,
      minute: minutes,
    },
  });
  
  console.log('[Notifications] Morning verse notification scheduled');
}

export async function scheduleStayPresentNotifications(frequency: number, isPremium: boolean) {
  if (Platform.OS === 'web') {
    console.log('[Notifications] Web platform - skipping stay present notifications');
    return;
  }

  const actualFrequency = isPremium ? frequency : Math.min(frequency, 3);
  console.log('[Notifications] Scheduling', actualFrequency, 'stay present notifications');

  const existingNotifications = await Notifications.getAllScheduledNotificationsAsync();
  const stayPresentIds = existingNotifications
    .filter(n => n.identifier.startsWith('stay-present-'))
    .map(n => n.identifier);
  
  for (const id of stayPresentIds) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }

  const wakeHour = 8;
  const sleepHour = 21;
  const availableHours = sleepHour - wakeHour;
  const interval = availableHours / actualFrequency;

  for (let i = 0; i < actualFrequency; i++) {
    const baseHour = wakeHour + (interval * i) + (interval / 2);
    const hour = Math.floor(baseHour);
    const minute = Math.floor((baseHour - hour) * 60) + Math.floor(Math.random() * 30);
    
    const message = getRandomStayPresentMessage();
    
    await Notifications.scheduleNotificationAsync({
      identifier: `stay-present-${i}`,
      content: {
        title: 'Daily Dharma',
        body: message,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hour,
        minute: Math.min(minute, 59),
      },
    });
  }
  
  console.log('[Notifications] Stay present notifications scheduled');
}

export async function cancelAllNotifications() {
  if (Platform.OS === 'web') return;
  
  console.log('[Notifications] Cancelling all notifications');
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getNotificationPermissionStatus() {
  if (Platform.OS === 'web') return 'granted';
  
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}
