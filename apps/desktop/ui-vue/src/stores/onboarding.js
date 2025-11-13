import { defineStore } from 'pinia'

export const useOnboardingStore = defineStore('onboarding', {
  state: () => ({
    currentStep: 1,
    wake: { enabled: false, time: '06:00', location: '' },
    sleep: { enabled: false, time: '23:00', location: '' },
    profile: { name: '' }
  }),

  getters: {
    isHabitSelected: (state) => state.wake.enabled || state.sleep.enabled,
    canProceedToName: (state) => state.wake.enabled || state.sleep.enabled
  },

  actions: {
    updateHabits(habits) {
      if (habits.wake) this.wake = { ...this.wake, ...habits.wake }
      if (habits.sleep) this.sleep = { ...this.sleep, ...habits.sleep }
    },

    updateProfile(profile) {
      this.profile = { ...this.profile, ...profile }
    },

    nextStep() {
      // Skip wake follow-up if wake disabled
      if (this.currentStep === 2 && !this.wake.enabled) {
        this.currentStep = 4  // Skip to name
      } else {
        this.currentStep++
      }
    },

    prevStep() {
      if (this.currentStep === 4 && !this.wake.enabled) {
        this.currentStep = 2  // Skip wake follow-up
      } else {
        this.currentStep--
      }
    },

    async saveToSystem() {
      const payload = {
        wake: this.wake,
        sleep: this.sleep,
        profile: this.profile
      }

      if (window.onboarding && window.onboarding.save) {
        const result = await window.onboarding.save(payload)
        if (!result || !result.success) {
          throw new Error(result?.error || 'Save failed')
        }
        return result
      }
      throw new Error('Onboarding API not available')
    },

    async loadFromSystem() {
      if (window.onboarding && window.onboarding.loadSettings) {
        const result = await window.onboarding.loadSettings()
        if (result && result.success && result.data) {
          if (result.data.wake) this.wake = result.data.wake
          if (result.data.sleep) this.sleep = result.data.sleep
          if (result.data.profile) this.profile = result.data.profile
        }
      }
    }
  }
})
