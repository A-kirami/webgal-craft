import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import { i18n } from '~/plugins/i18n'
import { notivue } from '~/plugins/notivue'
import { router } from '~/router'

import App from './App.vue'

import '~/plugins/editor'

import 'virtual:uno.css'

import '~/styles/main.css'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const app = createApp(App)

app.use(router)
  .use(pinia)
  .use(i18n)
  .use(notivue)
  .use(autoAnimatePlugin)
  .mount('#app')
