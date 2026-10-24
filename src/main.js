import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/theme.css'
import { usePlayerStore, getAudio } from './stores/player'
import { useModeStore } from './stores/mode'
import { useFavStore } from './stores/favorites'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

// 调试 / 自检钩子：本地应用，暴露 store 便于自动化验证（不影响功能）
try {
  window.__TL = {
    player: usePlayerStore(),
    mode: useModeStore(),
    fav: useFavStore(),
    audio: getAudio
  }
} catch (_) {}
