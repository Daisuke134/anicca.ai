<template>
  <q-page class="flex flex-center">
    <div style="width: 100%; max-width: 800px; padding: 20px">
      <q-stepper
        v-model="store.currentStep"
        ref="stepper"
        color="primary"
        animated
        header-nav
        :contracted="$q.screen.lt.md"
      >
        <!-- Step 1: Welcome -->
        <q-step :name="1" title="Welcome" icon="waving_hand" :done="store.currentStep > 1">
          <div class="text-center q-pa-xl">
            <h1 class="text-h3 q-mb-md">Welcome to Anicca</h1>
            <p class="text-subtitle1">Let's set up your daily habits</p>
          </div>
          <q-stepper-navigation>
            <q-btn color="primary" label="Get Started" @click="store.nextStep()" />
          </q-stepper-navigation>
        </q-step>

        <!-- Step 2: Habit Selection -->
        <q-step :name="2" title="Habits" icon="event_repeat" :done="store.currentStep > 2">
          <HabitSelection />
        </q-step>

        <!-- Step 3: Wake Follow-up -->
        <q-step :name="3" title="Wake Details" icon="wb_sunny" :done="store.currentStep > 3" v-if="store.wake.enabled">
          <WakeFollowup />
        </q-step>

        <!-- Step 4: Name Input -->
        <q-step :name="4" title="Profile" icon="person" :done="store.currentStep > 4">
          <NameInput />
        </q-step>

        <!-- Step 5: Google Sign-in -->
        <q-step :name="5" title="Connect" icon="link" :done="store.currentStep > 5">
          <GoogleSignIn />
        </q-step>

        <!-- Step 6: Settings -->
        <q-step :name="6" title="Settings" icon="settings" :done="store.currentStep > 6">
          <SettingsView />
        </q-step>
      </q-stepper>
    </div>
  </q-page>
</template>

<script setup>
import { onMounted } from 'vue'
import { useOnboardingStore } from '../stores/onboarding'
import HabitSelection from '../components/HabitSelection.vue'
import WakeFollowup from '../components/WakeFollowup.vue'
import NameInput from '../components/NameInput.vue'
import GoogleSignIn from '../components/GoogleSignIn.vue'
import SettingsView from '../components/SettingsView.vue'

const store = useOnboardingStore()

// URLパラメータで設定画面直接表示
onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search)
  if (urlParams.get('settings') === 'true') {
    store.currentStep = 6
  }
})
</script>
