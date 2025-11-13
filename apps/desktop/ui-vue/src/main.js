import { createApp } from 'vue'
import { Quasar, Notify, Dialog } from 'quasar'
import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/dist/quasar.css'

import App from './App.vue'
import createRouter from './router'
import createStore from './stores'

const app = createApp(App)

// Use Pinia
const pinia = createStore()
app.use(pinia)

// Use Router
const router = createRouter()
app.use(router)

// Use Quasar
app.use(Quasar, {
  plugins: {
    Notify,
    Dialog
  },
  config: {
    dark: 'auto'
  }
})

app.mount('#q-app')
