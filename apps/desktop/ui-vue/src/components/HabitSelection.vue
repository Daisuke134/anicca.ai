<template>
  <div>
    <h2 class="text-h5 q-mb-md">Select habits to set up</h2>

    <q-card flat bordered class="q-mb-md">
      <q-item>
        <q-item-section avatar>
          <q-checkbox v-model="store.wake.enabled" color="orange" />
        </q-item-section>
        <q-item-section>
          <q-item-label>Wake</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-btn
            flat
            round
            icon="schedule"
            @click="showWakePicker = true"
            :disable="!store.wake.enabled"
          >
            <q-badge color="orange" floating>{{ store.wake.time }}</q-badge>
          </q-btn>
        </q-item-section>
      </q-item>
    </q-card>

    <q-card flat bordered class="q-mb-md">
      <q-item>
        <q-item-section avatar>
          <q-checkbox v-model="store.sleep.enabled" color="indigo" />
        </q-item-section>
        <q-item-section>
          <q-item-label>Bedtime</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-btn
            flat
            round
            icon="bedtime"
            @click="showBedtimePicker = true"
            :disable="!store.sleep.enabled"
          >
            <q-badge color="indigo" floating>{{ store.sleep.time }}</q-badge>
          </q-btn>
        </q-item-section>
      </q-item>
    </q-card>

    <q-stepper-navigation>
      <q-btn
        color="primary"
        label="Next"
        :disable="!store.isHabitSelected"
        @click="store.nextStep()"
      />
    </q-stepper-navigation>

    <!-- Wake Time Picker -->
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

    <!-- Bedtime Picker -->
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
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useOnboardingStore } from '../stores/onboarding'

const store = useOnboardingStore()
const showWakePicker = ref(false)
const showBedtimePicker = ref(false)
</script>
