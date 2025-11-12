<template>
  <div>
    <h2 class="text-h5 q-mb-md">What is your name?</h2>
    <q-input
      v-model="store.profile.name"
      outlined
      placeholder="Enter your name"
      autofocus
      @keyup.enter="handleNext"
    />
    <q-stepper-navigation>
      <q-btn flat label="Back" @click="store.prevStep()" class="q-mr-sm" />
      <q-btn
        color="primary"
        label="Save"
        :disable="!store.profile.name"
        :loading="saving"
        @click="handleNext"
      />
    </q-stepper-navigation>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useOnboardingStore } from '../stores/onboarding'
import { useQuasar } from 'quasar'

const store = useOnboardingStore()
const $q = useQuasar()
const saving = ref(false)

const handleNext = async () => {
  saving.value = true
  try {
    await store.saveToSystem()
    store.nextStep()
  } catch (error) {
    $q.notify({ type: 'negative', message: `Failed to save: ${error.message}` })
  } finally {
    saving.value = false
  }
}
</script>
