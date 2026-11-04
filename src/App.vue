<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import AppFooter from './components/AppFooter.vue'
import BoxDetails from './components/BoxDetails.vue'
import Indicators from './components/Indicators.vue'
import ProfileSelect from './components/ProfileSelect.vue'
import SetupGuide from './components/SetupGuide.vue'
import VendorGrid from './components/VendorGrid.vue'
import { profileOptions } from './engine/profiles'
import { detectLocale, t, type Locale } from './i18n'
import { createRuntime } from './live/runtime'

const LOCALE_KEY = 'abi-ear.locale'
function initialLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_KEY)
    if (v === 'pt' || v === 'en') return v
  } catch { /* sem armazenamento */ }
  return detectLocale()
}

const locale = ref<Locale>(initialLocale())
const setLocale = (l: Locale) => {
  locale.value = l
  document.documentElement.lang = l === 'pt' ? 'pt-BR' : 'en'
  try { localStorage.setItem(LOCALE_KEY, l) } catch { /* sem armazenamento */ }
}
// gravação: só com npm run dev; o Vite remove este ramo (e o chunk) do build publicado
const DevRecorder = import.meta.env.DEV ? defineAsyncComponent(() => import('./dev/DevRecorder.vue')) : null
const rt = createRuntime()
const s = rt.state
const selected = ref<number | null>(null)
const options = computed(() => (s.loading || !rt.dataset() ? [] : profileOptions(rt.dataset()!)))
const selectedBox = computed(() => s.view.boxes.find((b) => b.uid === selected.value) ?? null)
// a caixa que acabou de ser pega aparece no painel sem precisar clicar
watch(
  () => s.lastPickup,
  (p) => {
    if (p?.uid != null) selected.value = p.uid
  },
)
const helpLines = ['help.pick', 'help.category', 'help.color', 'help.badge', 'help.dashed'] as const

onMounted(async () => {
  setLocale(locale.value)
  await rt.load()
  // prévia do layout sem o jogo (?preview): só com npm run dev, como a gravação
  // (?preview=help: sem caixa selecionada)
  const preview = import.meta.env.DEV ? new URLSearchParams(location.search).get('preview') : null
  if (preview !== null && rt.dataset()) {
    const { previewView } = await import('./dev/preview')
    s.view = previewView(rt.dataset()!)
    const ok = (reason: string) => ({ level: 'green' as const, reason })
    s.health = { audio: ok('audio.ok'), screen: ok('screen.ok'), vendor: ok('vendor.ok'), cursor: ok('cursor.ok') }
    const picked = s.view.boxes.find((b) => b.picks > 0 && b.candidates.length > 1)
    if (picked) s.lastPickup = { sound: 'Item_Misc_ElectronicDevice_Up', score: 0.93, outcome: 'assigned', reason: null, uid: preview === 'help' ? null : picked.uid }
  }
})
</script>

<template>
  <div class="page">
    <header class="top">
      <div class="brand">
        <h1>{{ t('title', locale) }}</h1>
        <p class="tagline">{{ t('tagline', locale) }}</p>
      </div>
      <div class="controls">
        <Indicators :health="s.health" :locale="locale" />
        <ProfileSelect :options="options" :model-value="s.profile" :locale="locale" @update:model-value="rt.setProfile" />
        <button v-if="!s.sharing" class="primary" :disabled="!s.ready || s.starting" @click="rt.start">{{ t('start', locale) }}</button>
        <button v-else @click="rt.stop">{{ t('stop', locale) }}</button>
        <button @click="rt.clear(); selected = null">{{ t('clear', locale) }}</button>
        <select class="lang" :value="locale" :aria-label="t('language', locale)" @change="setLocale(($event.target as HTMLSelectElement).value as Locale)">
          <option value="pt">PT</option>
          <option value="en">EN</option>
        </select>
      </div>
    </header>

    <ul v-if="s.problems.length" class="problems">
      <li v-for="p in s.problems" :key="p">{{ t(p, locale) }}</li>
    </ul>

    <SetupGuide v-if="!s.sharing && s.view.boxes.length === 0" :locale="locale" />

    <main class="main">
      <VendorGrid :view="s.view" :selected="selected" @select="(uid) => (selected = uid)" />
      <BoxDetails v-if="selectedBox" :box="selectedBox" :locale="locale" />
      <aside v-else-if="s.view.boxes.length" class="help">
        <h2>{{ t('help.title', locale) }}</h2>
        <ul>
          <li v-for="k in helpLines" :key="k">{{ t(k, locale) }}</li>
        </ul>
      </aside>
    </main>

    <component :is="DevRecorder" v-if="DevRecorder" :sharing="s.sharing" :get-stream="rt.stream" :subscribe="rt.onEvent" />
    <AppFooter :last-pickup="s.lastPickup" :version="s.dataVersion" :synced-at="s.syncedAt" :resolution="s.resolution" :locale="locale" />
  </div>
</template>

<style>
:root {
  --bg: #0f1115; --panel: #171a21; --text: #e6e8ec; --muted: #9aa1ad; --line: #2a2f3a; --accent: #e3893b;
  --green: #4caf6a; --yellow: #d9b33b; --red: #d9534f; --gray: #5b6270;
  --box: #20242d; --box-line: #3a404c; --band: rgba(227, 137, 59, 0.08);
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
button { font: inherit; background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 6px 12px; cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: #1a1208; font-weight: 600; }
button:disabled { opacity: 0.5; cursor: default; }
</style>

<style scoped>
.page { max-width: 1100px; margin: 0 auto; padding: 16px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.top { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
h1 { margin: 0; font-size: 22px; }
.tagline { margin: 2px 0 0; color: var(--muted); font-size: 14px; max-width: 46ch; }
.controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.lang { background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 4px; font: inherit; }
.problems { margin: 0; padding: 10px 16px 10px 32px; background: #3a1f1f; border: 1px solid var(--red); border-radius: 8px; }
/* grid do tamanho do jogo em 1080p (células de 64 px) quando cabe; o painel fica com o resto */
.main { display: grid; grid-template-columns: minmax(0, 578px) minmax(0, 1fr); gap: 16px; align-items: start; }
.help { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; color: var(--muted); font-size: 13px; }
.help h2 { font-size: 16px; margin: 0 0 6px; color: var(--text); }
.help ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
.help li:first-child { color: var(--text); }
@media (max-width: 760px) { .main { grid-template-columns: minmax(0, 1fr); } }
</style>
