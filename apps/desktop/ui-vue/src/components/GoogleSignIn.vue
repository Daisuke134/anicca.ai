<template>
  <div class="text-center q-pa-md">
    <h2 class="text-h5 q-mb-md">Connect Google Account</h2>
    <p class="text-grey-7 q-mb-lg">Optional: Connect your Google account for calendar integration</p>
    <q-btn
      color="primary"
      icon="login"
      label="Sign in with Google"
      size="lg"
      @click="handleGoogleSignIn"
    />
    <q-stepper-navigation class="q-mt-lg">
      <q-btn flat label="Back" @click="store.prevStep()" class="q-mr-sm" />
      <q-btn flat label="Skip" @click="store.nextStep()" />
    </q-stepper-navigation>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useOnboardingStore } from '../stores/onboarding'

const store = useOnboardingStore()

const handleGoogleSignIn = async () => {
  if (window.onboarding && window.onboarding.openGoogle) {
    await window.onboarding.openGoogle()
  }
}

// Listen for auth completion
const handleAuthCompleted = () => {
  store.nextStep()
}

onMounted(() => {
  if (window.onboarding && window.onboarding.onAuthCompleted) {
    window.onboarding.onAuthCompleted(handleAuthCompleted)
  }
})

onUnmounted(() => {
  if (window.onboarding && window.onboarding.removeAuthCompletedListener) {
    window.onboarding.removeAuthCompletedListener(handleAuthCompleted)
  }
})
</script>
