<template>
  <q-card flat>
    <q-card-section>
      <q-splitter v-model="splitterModel" style="height: 500px">
        <template v-slot:before>
          <q-tabs v-model="tab" vertical class="text-primary">
            <q-tab name="habits" icon="event_repeat" label="Habits" />
            <q-tab name="profile" icon="person" label="Profile" />
            <q-tab name="integrations" icon="link" label="Integrations" />
          </q-tabs>
        </template>

        <template v-slot:after>
          <q-tab-panels v-model="tab" animated class="q-pa-md">
            <!-- Habits Tab -->
            <q-tab-panel name="habits">
              <div class="text-h5 q-mb-md">Habit Settings</div>

              <q-card flat bordered class="q-mb-md">
                <q-item>
                  <q-item-section avatar>
                    <q-icon name="wb_sunny" color="orange" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>Wake</q-item-label>
                    <q-item-label caption>{{ store.wake.time }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-toggle v-model="store.wake.enabled" />
                  </q-item-section>
                </q-item>
                <q-separator />
                <q-item>
                  <q-item-section>
                    <q-btn
                      flat
                      label="Change Time"
                      icon="schedule"
                      @click="showWakePicker = true"
                    />
                  </q-item-section>
                </q-item>
              </q-card>

              <q-card flat bordered>
                <q-item>
                  <q-item-section avatar>
                    <q-icon name="bedtime" color="indigo" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>Bedtime</q-item-label>
                    <q-item-label caption>{{ store.sleep.time }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-toggle v-model="store.sleep.enabled" />
                  </q-item-section>
                </q-item>
                <q-separator />
                <q-item>
                  <q-item-section>
                    <q-btn
                      flat
                      label="Change Time"
                      icon="schedule"
                      @click="showBedtimePicker = true"
                    />
                  </q-item-section>
                </q-item>
              </q-card>
            </q-tab-panel>

            <!-- Profile Tab -->
            <q-tab-panel name="profile">
              <div class="text-h5 q-mb-md">Profile</div>
              <q-input
                v-model="store.profile.name"
                label="Name"
                outlined
              />
              <q-input
                v-model="store.wake.location"
                label="Wake Location"
                outlined
                class="q-mt-md"
                hint="Optional"
              />
            </q-tab-panel>

            <!-- Integrations Tab -->
            <q-tab-panel name="integrations">
              <div class="text-h5 q-mb-md">Integrations</div>
              <q-btn
                color="primary"
                icon="login"
                label="Sign in with Google"
                @click="handleGoogleSignIn"
              />
            </q-tab-panel>
          </q-tab-panels>
        </template>
      </q-splitter>
    </q-card-section>

    <q-separator />
    <q-card-actions align="right">
      <q-btn flat label="Close" @click="handleClose" />
      <q-btn color="primary" label="Save" :loading="saving" @click="handleSave" />
    </q-card-actions>

    <!-- Time Pickers -->
    <q-dialog v-model="showWakePicker">
      <q-card style="min-width: 300px">
        <q-card-section>
          <div class="text-h6">Wake Time</div>
        </q-card-section>
        <q-card-section>
          <q-time
            v-model="store.wake.time"
            format24h
            :hour-options="[5,6,7,8,9,10]"
            color="orange"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="OK" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showBedtimePicker">
      <q-card style="min-width: 300px">
        <q-card-section>
          <div class="text-h6">Bedtime</div>
        </q-card-section>
        <q-card-section>
          <q-time
            v-model="store.sleep.time"
            format24h
            :hour-options="[21,22,23,0,1,2]"
            color="indigo"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="OK" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useOnboardingStore } from '../stores/onboarding'
import { useQuasar } from 'quasar'

const store = useOnboardingStore()
const $q = useQuasar()

const tab = ref('habits')
const splitterModel = ref(20)
const showWakePicker = ref(false)
const showBedtimePicker = ref(false)
const saving = ref(false)

// Load settings on mount
onMounted(async () => {
  await store.loadFromSystem()
})

const handleSave = async () => {
  saving.value = true
  try {
    await store.saveToSystem()
    $q.notify({ type: 'positive', message: 'Settings saved!' })
  } catch (error) {
    $q.notify({ type: 'negative', message: `Failed: ${error.message}` })
  } finally {
    saving.value = false
  }
}

const handleClose = () => {
  if (window.onboarding && window.onboarding.close) {
    window.onboarding.close()
  }
}

const handleGoogleSignIn = async () => {
  if (window.onboarding && window.onboarding.openGoogle) {
    await window.onboarding.openGoogle()
  }
}
</script>
