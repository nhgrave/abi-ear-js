<script setup lang="ts">
// Gravação do modo local (npm run dev): só o autor usa, por isso só em português. Nunca entra no build publicado.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { folderAccess, loadFolder, pickFolder, saveFolder } from './recorder/folder'
import { listRecordings, type RecordingSummary } from './recorder/history'
import type { LiveEvent } from '../live/live-events'
import {
  FRAME_RATES,
  recordingSupport,
  startRecording,
  type ActiveRecording,
  type FrameRate,
  type RecordingStats,
} from './recorder/recorder'

const props = defineProps<{
  sharing: boolean
  getStream: () => MediaStream | null
  subscribe: (fn: (e: LiveEvent) => void) => () => void
}>()

const FPS_KEY = 'abi-ear-dev.fps'
function readFps(): FrameRate {
  try {
    const v = Number(localStorage.getItem(FPS_KEY))
    return (FRAME_RATES as readonly number[]).includes(v) ? (v as FrameRate) : 30
  } catch {
    return 30
  }
}
const fps = ref<FrameRate>(readFps())
watch(fps, (v) => {
  try {
    localStorage.setItem(FPS_KEY, String(v))
  } catch {
    /* lembrar é conveniência */
  }
})

const support = recordingSupport()
const folder = ref<FileSystemDirectoryHandle | null>(null)
const allowed = ref(false)
const history = ref<RecordingSummary[]>([])
const active = ref<ActiveRecording | null>(null)
const stats = ref<RecordingStats | null>(null)
const busy = ref(false)
const notice = ref<string | null>(null)
const error = ref<string | null>(null)
const copied = ref<string | null>(null)
let timer: number | null = null

const canRecord = computed(() => !support && props.sharing && !!folder.value && allowed.value && !active.value && !busy.value)
const elapsed = computed(() => {
  if (!stats.value) return '00:00'
  const s = Math.max(0, Math.floor((Date.now() - stats.value.startedAtMs) / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})

const msg = (err: unknown) => (err instanceof Error ? err.message : String(err))
const dash = (v: number | null, f: (n: number) => string) => (v === null ? '—' : f(v))
const STATUS: Record<RecordingSummary['status'] | 'recording', string> = {
  complete: 'completa',
  failed: 'com erro',
  incomplete: 'incompleta',
  prototype: 'protótipo',
  recording: 'gravando',
}
/** A gravação em andamento ainda não tem fim no session.json: não mostrar como incompleta. */
const statusOf = (r: RecordingSummary) => (active.value && stats.value?.name === r.name ? 'recording' : r.status)
const when = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toLocaleString('pt-BR') : '—')
/** Quadros salvos por segundo de gravação. */
const rate = (r: RecordingSummary) => (r.frames && r.durationS ? `${(r.frames / r.durationS).toFixed(1)}/s` : '—')
const duration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

async function refresh(): Promise<void> {
  if (!folder.value || !allowed.value) return
  try {
    history.value = await listRecordings(folder.value)
  } catch (err) {
    error.value = `Não foi possível ler a pasta: ${msg(err)}`
  }
}

async function choose(): Promise<void> {
  error.value = null
  try {
    const h = await pickFolder()
    if (!h) return
    folder.value = h
    allowed.value = true
    await saveFolder(h).catch(() => {}) // lembrar é conveniência
    await refresh()
  } catch (err) {
    error.value = `Não foi possível abrir a pasta: ${msg(err)}`
  }
}

async function allow(): Promise<void> {
  if (!folder.value) return
  allowed.value = await folderAccess(folder.value, true)
  if (allowed.value) await refresh()
}

async function record(): Promise<void> {
  const stream = props.getStream()
  if (!canRecord.value || !stream || !folder.value) return
  busy.value = true
  notice.value = error.value = null
  try {
    const rec = await startRecording(stream, folder.value, { fps: fps.value, subscribe: props.subscribe })
    active.value = rec
    stats.value = rec.stats()
    timer = window.setInterval(() => (stats.value = rec.stats()), 500)
    void rec.done.then(async (err) => {
      if (err) error.value = `A gravação parou: ${err}`
      await finished(rec)
    })
    // o compartilhamento pode ter caído enquanto a gravação começava (o watch só vê gravação ativa)
    if (!props.sharing) {
      notice.value = 'Compartilhamento encerrado: a gravação foi salva.'
      await rec.stop()
      await finished(rec)
      return
    }
    await refresh()
  } catch (err) {
    error.value = `Não foi possível começar a gravar: ${msg(err)}`
    await refresh()
  } finally {
    busy.value = false
  }
}

async function finished(rec: ActiveRecording): Promise<void> {
  if (active.value !== rec) return
  if (timer !== null) clearInterval(timer)
  timer = null
  stats.value = rec.stats()
  active.value = null
  await refresh()
}

async function stop(): Promise<void> {
  const rec = active.value
  if (!rec) return
  busy.value = true
  try {
    await rec.stop()
    await finished(rec)
  } finally {
    busy.value = false
  }
}

async function copy(name: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(name)
    copied.value = name
    setTimeout(() => copied.value === name && (copied.value = null), 1500)
  } catch {
    error.value = 'Não foi possível copiar.'
  }
}

watch(
  () => props.sharing,
  (on) => {
    if (on || !active.value) return
    notice.value = 'Compartilhamento encerrado: a gravação foi salva.'
    void stop()
  },
)

onMounted(async () => {
  folder.value = await loadFolder()
  if (folder.value) {
    allowed.value = await folderAccess(folder.value, false)
    await refresh()
  }
})

onBeforeUnmount(() => {
  if (timer !== null) clearInterval(timer)
  void active.value?.stop()
})
</script>

<template>
  <section class="rec" data-dev="abi-ear-dev-recorder">
    <h2>Gravação (modo local)</h2>
    <p v-if="support" class="warn">{{ support }}</p>

    <div class="row">
      <span class="muted">Pasta:</span>
      <strong>{{ folder?.name ?? 'nenhuma' }}</strong>
      <button :disabled="!!active || !!support" @click="choose">Escolher pasta</button>
      <button v-if="folder && !allowed" :disabled="!!support" @click="allow">Liberar pasta</button>
    </div>

    <div class="row">
      <label class="muted">
        Quadros por segundo:
        <select v-model.number="fps" :disabled="!!active">
          <option v-for="r in FRAME_RATES" :key="r" :value="r">{{ r }}</option>
        </select>
      </label>
      <button v-if="!active" class="primary" :disabled="!canRecord" @click="record">Gravar</button>
      <button v-else class="stop" :disabled="busy" @click="stop">Parar</button>
      <span v-if="!active && !support && !sharing" class="muted">Inicie o compartilhamento para gravar.</span>
      <span v-if="active && stats" class="live">
        ● {{ stats.name }} · {{ elapsed }} · {{ stats.frames }} quadros ({{ stats.skipped }} pulados) · {{ stats.audioS.toFixed(1) }} s de áudio
      </span>
    </div>
    <p v-if="notice" class="muted">{{ notice }}</p>
    <p v-if="error" class="err">{{ error }}</p>

    <div v-if="folder && allowed" class="history">
      <div class="row">
        <h3>Histórico</h3>
        <button @click="refresh">Atualizar</button>
      </div>
      <p v-if="history.length === 0" class="muted">Nenhuma gravação nesta pasta.</p>
      <table v-else>
        <thead>
          <tr><th>Gravação</th><th>Início</th><th>Duração</th><th>Quadros</th><th>Por segundo</th><th>Áudio</th><th>Resolução</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="r in history" :key="r.name">
            <td class="mono">{{ r.name }}</td>
            <td>{{ when(r.startedAt) }}</td>
            <td>{{ dash(r.durationS, duration) }}</td>
            <td>{{ dash(r.frames, String) }}</td>
            <td>{{ rate(r) }}</td>
            <td>{{ dash(r.audioS, (s) => `${s.toFixed(1)} s`) }}</td>
            <td>{{ r.resolution ? `${r.resolution[0]}×${r.resolution[1]}` : '—' }}</td>
            <td :class="statusOf(r)" :title="r.error ?? undefined">{{ STATUS[statusOf(r)] }}</td>
            <td><button @click="copy(r.name)">{{ copied === r.name ? 'Copiado' : 'Copiar nome' }}</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.rec { display: grid; gap: 10px; padding: 12px 16px; border: 1px dashed var(--line); border-radius: 8px; font-size: 14px; }
h2 { margin: 0; font-size: 15px; color: var(--muted); }
h3 { margin: 0; font-size: 14px; }
p { margin: 0; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.muted { color: var(--muted); }
.warn { color: var(--yellow); }
.err { color: var(--red); }
.live { color: var(--red); font-variant-numeric: tabular-nums; }
.stop { border-color: var(--red); }
.history { display: grid; gap: 8px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--muted); font-weight: 500; }
.mono { font-family: ui-monospace, monospace; }
.complete { color: var(--green); }
.incomplete { color: var(--yellow); }
.failed { color: var(--red); }
.recording { color: var(--red); }
.prototype { color: var(--muted); }
@media (max-width: 760px) { .history { overflow-x: auto; } }
</style>
