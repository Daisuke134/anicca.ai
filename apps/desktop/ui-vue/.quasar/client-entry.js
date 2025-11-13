/**
 * THIS FILE IS GENERATED AUTOMATICALLY.
 * DO NOT EDIT.
 *
 * You are probably looking on adding startup/initialization code.
 * Use "quasar new boot <name>" and add it there.
 * One boot file per concern. Then reference the file(s) in quasar.config.js > boot:
 * boot: ['file', ...] // do not add ".js" extension to it.
 *
 * Boot files are your "main.js"
 **/


import { createApp } from 'vue'







import '@quasar/extras/material-icons/material-icons.css'




// We load Quasar stylesheet file
import 'quasar/dist/quasar.css'




import 'src/css/app.css'


import createQuasarApp from './app.js'
import quasarUserOptions from './quasar-user-options.js'







const publicPath = `/./`

const doubleSlashRE = /\/\//
const addPublicPath = url => (publicPath + url).replace(doubleSlashRE, '/')


async function start ({
  app,
  router
  , store
}) {
  

  

  app.use(router)
  

  

    

    
      app.mount('#q-app')
    

    

  

}

createQuasarApp(createApp, quasarUserOptions)

  .then(start)

