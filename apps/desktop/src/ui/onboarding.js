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
  
  // Settings show listener
  if (window.onboarding && window.onboarding.onShowSettings) {
    window.onboarding.onShowSettings(() => {
      showScreen('settings-screen');
      loadSettingsData();
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
    wakeEnabled.addEventListener('change', updateHabitNextButton);
  }
  if (bedtimeEnabled) {
    bedtimeEnabled.addEventListener('change', updateHabitNextButton);
  }
  
  if (habitNext) {
    habitNext.addEventListener('click', () => {
      onboardingData.wake.enabled = wakeEnabled ? wakeEnabled.checked : false;
      onboardingData.sleep.enabled = bedtimeEnabled ? bedtimeEnabled.checked : false;
      const wakeTime = document.getElementById('wake-time');
      const bedtimeTime = document.getElementById('bedtime-time');
      onboardingData.wake.time = wakeTime ? wakeTime.value : '06:00';
      onboardingData.sleep.time = bedtimeTime ? bedtimeTime.value : '23:00';
      
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
      
      // Save onboarding data
      if (window.onboarding && window.onboarding.save) {
        const result = await window.onboarding.save(onboardingData);
        if (result.success) {
          showScreen('google-signin-screen');
        } else {
          alert('Failed to save: ' + (result.error || 'Unknown error'));
        }
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

function loadSettingsData() {
  // Load current settings from files (would need IPC call)
  // For now, use onboardingData
  if (onboardingData.wake.enabled) {
    const wakeEnabled = document.getElementById('settings-wake-enabled');
    const wakeTime = document.getElementById('settings-wake-time');
    const wakeLocation = document.getElementById('settings-wake-location');
    if (wakeEnabled) wakeEnabled.checked = true;
    if (wakeTime) wakeTime.value = onboardingData.wake.time;
    if (wakeLocation) wakeLocation.value = onboardingData.wake.location || '';
  }
  
  if (onboardingData.sleep.enabled) {
    const bedtimeEnabled = document.getElementById('settings-bedtime-enabled');
    const bedtimeTime = document.getElementById('settings-bedtime-time');
    const bedtimeLocation = document.getElementById('settings-bedtime-location');
    if (bedtimeEnabled) bedtimeEnabled.checked = true;
    if (bedtimeTime) bedtimeTime.value = onboardingData.sleep.time;
    if (bedtimeLocation) bedtimeLocation.value = onboardingData.sleep.location || '';
  }
  
  const profileName = document.getElementById('settings-profile-name');
  if (profileName) profileName.value = onboardingData.profile.name || '';
}

async function saveSettingsHabits() {
  const wakeEnabled = document.getElementById('settings-wake-enabled');
  const wakeTime = document.getElementById('settings-wake-time');
  const wakeLocation = document.getElementById('settings-wake-location');
  const bedtimeEnabled = document.getElementById('settings-bedtime-enabled');
  const bedtimeTime = document.getElementById('settings-bedtime-time');
  const bedtimeLocation = document.getElementById('settings-bedtime-location');
  
  const payload = {
    wake: {
      enabled: wakeEnabled ? wakeEnabled.checked : false,
      time: wakeTime ? wakeTime.value : '06:00',
      location: wakeLocation ? wakeLocation.value : ''
    },
    sleep: {
      enabled: bedtimeEnabled ? bedtimeEnabled.checked : false,
      time: bedtimeTime ? bedtimeTime.value : '23:00',
      location: bedtimeLocation ? bedtimeLocation.value : ''
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
  if (onboardingData.wake.enabled) {
    onboardingData.wake.location = sleepPlaceValue;
  }
  if (onboardingData.sleep.enabled && !onboardingData.wake.enabled) {
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

