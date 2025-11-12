// State management
let currentScreen = 'welcome-screen';
let onboardingData = {
  wake: { enabled: false, time: '06:00', location: '' },
  sleep: { enabled: false, time: '23:00', location: '' },
  profile: { name: '' }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  
  // URLパラメータまたは初期状態で設定画面を表示するかチェック
  const urlParams = new URLSearchParams(window.location.search);
  const showSettings = urlParams.get('settings') === 'true';
  if (showSettings) {
    showScreen('settings-screen');
    loadSettingsData();
  }
  
  // Settings show listener（リスナーを先に設定）
  if (window.onboarding && window.onboarding.onShowSettings) {
    window.onboarding.onShowSettings(async () => {
      showScreen('settings-screen');
      await loadSettingsData();
    });
  }
  
  // Auth completed listener
  if (window.onboarding && window.onboarding.onAuthCompleted) {
    window.onboarding.onAuthCompleted(() => {
      // Show completion screen with message
      const completionMessage = document.getElementById('completion-message');
      if (completionMessage) {
        const wakeTime = onboardingData.wake.enabled ? onboardingData.wake.time : '';
        const sleepTime = onboardingData.sleep.enabled ? onboardingData.sleep.time : '';
        let message = 'I\'ll remind you';
        if (wakeTime && sleepTime) {
          message += ` at ${wakeTime} and ${sleepTime}`;
        } else if (wakeTime) {
          message += ` at ${wakeTime}`;
        } else if (sleepTime) {
          message += ` at ${sleepTime}`;
        }
        message += '.';
        completionMessage.textContent = message;
      }
      showScreen('completion-screen');
    });
  }
});

function setupEventListeners() {
  // Welcome
  const welcomeNext = document.getElementById('welcome-next');
  if (welcomeNext) {
    welcomeNext.addEventListener('click', () => {
      showScreen('habit-selection-screen');
    });
  }
  
  // Habit selection
  const wakeEnabled = document.getElementById('wake-enabled');
  const bedtimeEnabled = document.getElementById('bedtime-enabled');
  const habitNext = document.getElementById('habit-next');
  
  if (wakeEnabled) {
    wakeEnabled.addEventListener('change', () => {
      toggleHabitTimeInput('wake-enabled', 'wake-time');
      updateHabitNextButton();
    });
    toggleHabitTimeInput('wake-enabled', 'wake-time');
  }
  if (bedtimeEnabled) {
    bedtimeEnabled.addEventListener('change', () => {
      toggleHabitTimeInput('bedtime-enabled', 'bedtime-time');
      updateHabitNextButton();
    });
    toggleHabitTimeInput('bedtime-enabled', 'bedtime-time');
  }
  
  if (habitNext) {
    habitNext.addEventListener('click', () => {
      onboardingData.wake.enabled = !!(wakeEnabled && wakeEnabled.checked);
      onboardingData.sleep.enabled = !!(bedtimeEnabled && bedtimeEnabled.checked);
      const wakeTime = document.getElementById('wake-time');
      const bedtimeTime = document.getElementById('bedtime-time');
      onboardingData.wake.time = wakeTime && wakeTime.value ? wakeTime.value : '06:00';
      onboardingData.sleep.time = bedtimeTime && bedtimeTime.value ? bedtimeTime.value : '23:00';
      
      // Navigate based on selection
      if (onboardingData.wake.enabled) {
        showScreen('wake-followup-screen');
      } else if (onboardingData.sleep.enabled) {
        showScreen('bedtime-followup-screen');
      } else {
        showScreen('name-screen');
      }
    });
  }
  
  // Wake follow-up
  const wakeNext = document.getElementById('wake-next');
  if (wakeNext) {
    wakeNext.addEventListener('click', () => {
      const wakeLocation = document.getElementById('wake-location');
      onboardingData.wake.location = wakeLocation ? wakeLocation.value : '';
      
      // If both selected, use wake location for sleep too
      if (onboardingData.sleep.enabled) {
        onboardingData.sleep.location = onboardingData.wake.location;
        showScreen('name-screen');
      } else {
        showScreen('name-screen');
      }
    });
  }
  
  // Bedtime follow-up
  const bedtimeNext = document.getElementById('bedtime-next');
  if (bedtimeNext) {
    bedtimeNext.addEventListener('click', () => {
      const bedtimeLocation = document.getElementById('bedtime-location');
      onboardingData.sleep.location = bedtimeLocation ? bedtimeLocation.value : '';
      showScreen('name-screen');
    });
  }
  
  // Name input
  const nameSave = document.getElementById('name-save');
  if (nameSave) {
    nameSave.addEventListener('click', async () => {
      const profileName = document.getElementById('profile-name');
      onboardingData.profile.name = profileName ? profileName.value : '';
      
      if (!onboardingData.profile.name.trim()) {
        alert('Please enter your name');
        return;
      }
      
      if (window.onboarding && window.onboarding.save) {
        console.log('window.onboarding exists, calling save...');
        try {
          nameSave.disabled = true;
          const result = await window.onboarding.save(onboardingData);
          console.log('Save result:', result);
          if (result?.success) {
            showScreen('google-signin-screen');
          } else {
            alert('Failed to save: ' + (result?.error || 'Unknown error'));
          }
        } catch (error) {
          console.error('Save error:', error);
          alert('Failed to save: ' + ((error && error.message) || 'Unknown error'));
        } finally {
          nameSave.disabled = false;
        }
      } else {
        console.error('window.onboarding is not available!', window.onboarding);
        alert('Onboarding API not available. Please restart the app.');
      }
    });
  }
  
  // Google sign-in
  const googleSigninBtn = document.getElementById('google-signin-btn');
  if (googleSigninBtn) {
    googleSigninBtn.addEventListener('click', async () => {
      if (window.onboarding && window.onboarding.openGoogle) {
        const result = await window.onboarding.openGoogle();
        if (result.success) {
          // Wait for auth completion (polling)
          checkAuthStatus();
        } else {
          alert('Failed to open Google sign-in: ' + (result.error || 'Unknown error'));
        }
      }
    });
  }
  
  // Completion
  const finishBtn = document.getElementById('finish-btn');
  if (finishBtn) {
    finishBtn.addEventListener('click', () => {
      if (window.onboarding && window.onboarding.complete) {
        window.onboarding.complete();
      }
    });
  }
  
  // Settings tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      if (tab) {
        switchTab(tab);
      }
    });
  });
  
  // Settings save buttons
  const saveHabits = document.getElementById('save-habits');
  if (saveHabits) {
    saveHabits.addEventListener('click', async () => {
      await saveSettingsHabits();
    });
  }
  
  const saveProfile = document.getElementById('save-profile');
  if (saveProfile) {
    saveProfile.addEventListener('click', async () => {
      await saveSettingsProfile();
    });
  }
}

function updateHabitNextButton() {
  const wakeEnabledEl = document.getElementById('wake-enabled');
  const bedtimeEnabledEl = document.getElementById('bedtime-enabled');
  const habitNext = document.getElementById('habit-next');
  
  const wakeEnabled = wakeEnabledEl ? wakeEnabledEl.checked : false;
  const bedtimeEnabled = bedtimeEnabledEl ? bedtimeEnabledEl.checked : false;
  
  if (habitNext) {
    habitNext.disabled = !wakeEnabled && !bedtimeEnabled;
  }
}

function toggleHabitTimeInput(checkboxId, timeInputId) {
  const checkbox = document.getElementById(checkboxId);
  const timeInput = document.getElementById(timeInputId);
  if (!timeInput) return;
  const active = checkbox ? checkbox.checked : false;
  timeInput.disabled = !active;
  if (!timeInput.value) {
    timeInput.value = checkboxId === 'wake-enabled' ? '06:00' : '23:00';
  }
}

// Initialize habit selection state on load
updateHabitNextButton();

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
    currentScreen = screenId;
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  
  const btn = document.querySelector('[data-tab="' + tabName + '"]');
  const content = document.getElementById(tabName + '-tab');
  
  if (btn) btn.classList.add('active');
  if (content) content.classList.add('active');
}

async function loadSettingsData() {
  // ファイルから実際の設定データを読み込む
  if (window.onboarding && window.onboarding.loadSettings) {
    try {
      const result = await window.onboarding.loadSettings();
      if (result?.success && result?.data) {
        const data = result.data;
        
        // Wake設定を反映
        if (data.wake?.enabled) {
          const wakeEnabled = document.getElementById('settings-wake-enabled');
          const wakeTime = document.getElementById('settings-wake-time');
          if (wakeEnabled) wakeEnabled.checked = true;
          if (wakeTime) wakeTime.value = data.wake.time || '06:00';
        }
        
        // Sleep設定を反映
        if (data.sleep?.enabled) {
          const bedtimeEnabled = document.getElementById('settings-bedtime-enabled');
          const bedtimeTime = document.getElementById('settings-bedtime-time');
          if (bedtimeEnabled) bedtimeEnabled.checked = true;
          if (bedtimeTime) bedtimeTime.value = data.sleep.time || '23:00';
        }
        
        // Profile設定を反映
        const profileName = document.getElementById('settings-profile-name');
        if (profileName) profileName.value = data.profile?.name || '';
        
        const sleepPlace = document.getElementById('settings-sleep-place');
        if (sleepPlace) {
          const sleepPlaceValue = data.wake?.location || data.sleep?.location || '';
          sleepPlace.value = sleepPlaceValue;
        }
        
        // Languageフィールドに現在の言語を設定
        const languageInput = document.getElementById('settings-language');
        if (languageInput) {
          const browserLang = navigator.language || navigator.userLanguage || 'en';
          const displayLang = browserLang.startsWith('ja') ? 'Japanese' : 'English';
          languageInput.value = displayLang;
        }
        
        // メモリ上のデータも更新
        onboardingData = data;
        return;
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
  
  // フォールバック: メモリ上のデータを使用
  if (onboardingData.wake.enabled) {
    const wakeEnabled = document.getElementById('settings-wake-enabled');
    const wakeTime = document.getElementById('settings-wake-time');
    if (wakeEnabled) wakeEnabled.checked = true;
    if (wakeTime) wakeTime.value = onboardingData.wake.time;
  }
  
  if (onboardingData.sleep.enabled) {
    const bedtimeEnabled = document.getElementById('settings-bedtime-enabled');
    const bedtimeTime = document.getElementById('settings-bedtime-time');
    if (bedtimeEnabled) bedtimeEnabled.checked = true;
    if (bedtimeTime) bedtimeTime.value = onboardingData.sleep.time;
  }
  
  const profileName = document.getElementById('settings-profile-name');
  if (profileName) profileName.value = onboardingData.profile.name || '';
  
  // Locationフィールドをフォールバックでも設定
  const sleepPlace = document.getElementById('settings-sleep-place');
  if (sleepPlace) {
    const sleepPlaceValue = onboardingData.wake?.location || onboardingData.sleep?.location || '';
    sleepPlace.value = sleepPlaceValue;
  }
  
  // Languageフィールドに現在の言語を設定
  const languageInput = document.getElementById('settings-language');
  if (languageInput) {
    const browserLang = navigator.language || navigator.userLanguage || 'en';
    const displayLang = browserLang.startsWith('ja') ? 'Japanese' : 'English';
    languageInput.value = displayLang;
  }
}

async function saveSettingsHabits() {
  const wakeEnabled = document.getElementById('settings-wake-enabled');
  const wakeTime = document.getElementById('settings-wake-time');
  const bedtimeEnabled = document.getElementById('settings-bedtime-enabled');
  const bedtimeTime = document.getElementById('settings-bedtime-time');
  
  // LocationはProfileタブから取得（既存のonboardingDataを使用）
  const payload = {
    wake: {
      enabled: wakeEnabled ? wakeEnabled.checked : false,
      time: wakeTime ? wakeTime.value : '06:00',
      location: onboardingData.wake?.location || ''
    },
    sleep: {
      enabled: bedtimeEnabled ? bedtimeEnabled.checked : false,
      time: bedtimeTime ? bedtimeTime.value : '23:00',
      location: onboardingData.sleep?.location || ''
    },
    profile: {
      name: onboardingData.profile.name
    }
  };
  
  if (window.onboarding && window.onboarding.save) {
    const result = await window.onboarding.save(payload);
    if (result.success) {
      alert('Settings saved!');
      onboardingData = payload;
    } else {
      alert('Failed to save: ' + (result.error || 'Unknown error'));
    }
  }
}

async function saveSettingsProfile() {
  const profileName = document.getElementById('settings-profile-name');
  const sleepPlace = document.getElementById('settings-sleep-place');
  
  const name = profileName ? profileName.value : '';
  const sleepPlaceValue = sleepPlace ? sleepPlace.value : '';
  
  // Update onboardingData and save
  onboardingData.profile.name = name;
  // Locationをwake/sleepの両方に設定（どちらかが有効な場合）
  if (onboardingData.wake.enabled) {
    onboardingData.wake.location = sleepPlaceValue;
  }
  if (onboardingData.sleep.enabled) {
    onboardingData.sleep.location = sleepPlaceValue;
  }
  
  if (window.onboarding && window.onboarding.save) {
    const result = await window.onboarding.save(onboardingData);
    if (result.success) {
      alert('Profile saved!');
    } else {
      alert('Failed to save: ' + (result.error || 'Unknown error'));
    }
  }
}

