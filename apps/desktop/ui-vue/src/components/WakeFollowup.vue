<template>
  <div>
    <h2 class="text-h5 q-mb-md">Where do you wake up?</h2>
    <q-input
      v-model="store.wake.location"
      outlined
      placeholder="e.g., Bedroom in Setagaya"
      hint="Optional: helps personalize your experience"
    />
    <q-stepper-navigation>
      <q-btn flat label="Back" @click="store.prevStep()" class="q-mr-sm" />
      <q-btn color="primary" label="Next" @click="store.nextStep()" />
    </q-stepper-navigation>
  </div>
</template>

<script setup>
import { useOnboardingStore } from '../stores/onboarding'

const store = useOnboardingStore()
</script>
