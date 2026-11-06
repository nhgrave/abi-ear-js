/** Aceitação do motor: repete uma gravação real e compara com o log do app desktop (se ABI_APP_LOG) e com o que a
 * página fez ao vivo durante a gravação (o events.jsonl da pasta, gravado desde a v0.2.1).
 *
 * ABI_REPLAY=<pasta da gravação> [ABI_APP_LOG=<abi-ear.log>] npx vitest run src/engine/replay.test.ts
 * Opcional: ABI_REPLAY_STRICT=0 só imprime a tabela, sem exigir o critério (gravações de pega e devolve);
 * ABI_REPLAY_OUT=<arquivo> grava a tabela (o vitest esconde o console de testes que passam);
 * ABI_LABEL_MODELS=<arquivo> lê os rótulos com esses modelos e conta a categoria de cada pegada do log que tem uma;
 * ABI_REPLAY_FRAME_MS=<ms> intervalo mínimo entre quadros analisados (padrão 100, como a página ao vivo; 0 usa todos);
 * ABI_REPLAY_WINDOW=<de>,<até> janela da atribuição em ms antes do som (padrão a de attribution.ts), para comparar.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decode } from 'jpeg-js'
import { describe, expect, it } from 'vitest'
import { Listener, type ListenEvent } from './audio/listener'
import { SoundMatcher } from './audio/matcher'
import { WINDOW_MS } from './attribution'
import { Controller, type PickupOutcome } from './controller'
import { Dataset } from './data/dataset'
import { FramePipeline } from './pipeline'
import { rgbaToGray } from './vision/image'
import type { LabelModels } from './vision/label-reader'
import { fixturePath, readF32, readJson } from '../test-utils/fixtures'
import { parseAppPicks, type AppPick } from '../test-utils/app-log'

const DIR = process.env.ABI_REPLAY
const LOG = process.env.ABI_APP_LOG
const MODELS = process.env.ABI_LABEL_MODELS
const STRICT = process.env.ABI_REPLAY_STRICT !== '0'
const FRAME_MS = Number(process.env.ABI_REPLAY_FRAME_MS ?? 100) // a página ao vivo analisa um quadro a cada 100 ms
// janela da atribuição em teste (ABI_REPLAY_WINDOW=150,400): só para medir alternativas
if (process.env.ABI_REPLAY_WINDOW) WINDOW_MS.splice(0, 2, ...(process.env.ABI_REPLAY_WINDOW.split(',').map(Number) as [number, number]))
const APP_CLOCK_MS = 85 // o som na gravação chega cerca de 85 ms depois do horário que o app registra
const NEAR_MS = 500 // pegada ouvida a até isto da pegada do app (como tools/spike_eval.py)
const BLOCK = 4096

function readWavF32(path: string): Float32Array {
  const buf = readFileSync(path)
  let off = 12
  while (off < buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'data') {
      const out = new Float32Array(size / 4)
      new Uint8Array(out.buffer).set(buf.subarray(off + 8, off + 8 + size))
      return out
    }
    off += 8 + size
  }
  throw new Error('WAV sem bloco data')
}

type LivePickup = {
  type: 'pickup'
  t: number
  sound: string
  outcome: 'assigned' | 'unassigned'
  reason: string | null
  box: { col: number; row: number; w: number; h: number; label: string | null } | null
}

/** As pegadas que a página ouviu ao vivo, do events.jsonl da gravação (vazio se a gravação não tem). */
function readLivePickups(dir: string): LivePickup[] | null {
  const path = join(dir, 'events.jsonl')
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { type: string })
    .filter((e): e is LivePickup => e.type === 'pickup')
}

describe.skipIf(!DIR)('replay of a real recording', () => {
  it('agrees with the desktop app picks and the live page', () => {
    const session = readJson<{ audioStartEpochMs: number }>(join(DIR!, 'session.json'))
    const audio = readWavF32(join(DIR!, 'audio.wav'))
    const frames = readdirSync(join(DIR!, 'frames'))
      .filter((f) => f.endsWith('.jpg'))
      .map((f) => ({ t: Number(f.slice(0, -4)), path: join(DIR!, 'frames', f) }))
      .sort((a, b) => a.t - b.t)

    const raw = readJson<{ sounds: { id: number; pickup: string }[] }>(fixturePath('merchant.json'))
    const ds = new Dataset(raw)
    const matcher = new SoundMatcher()
    for (const s of raw.sounds) matcher.addReference(s.id, readF32(fixturePath('sounds', `${s.pickup}.f32`)), s.pickup)
    const listener = new Listener(matcher)
    const controller = new Controller(ds)
    controller.setProfile('auto') // o padrão da página
    const pipeline = new FramePipeline(MODELS ? readJson<LabelModels>(MODELS) : null)
    const picks = (LOG ? parseAppPicks(readFileSync(LOG, 'latin1')) : []).filter((p) => p.t >= frames[0].t && p.t <= frames[frames.length - 1].t)
    const counts: Record<string, number> = {}
    const wrong: string[] = []
    const matched = new Set<AppPick>()
    let heardTotal = 0
    const tally = (res: string) => (counts[res] = (counts[res] ?? 0) + 1)
    // categoria da caixa da pegada, no instante dela, contra a que o app tinha (só pegadas do log com categoria)
    const labeledPicks = picks.filter((p) => p.label !== null)
    const cats: Record<string, number> = { coberta: 0, errada: 0, 'sem categoria': 0, 'sem caixa': 0 }
    const wrongCats: string[] = []
    const labelMs: number[] = []
    let li = 0
    const judgeLabels = (now: number) => {
      for (; li < labeledPicks.length && labeledPicks[li].t + APP_CLOCK_MS <= now; li++) {
        const p = labeledPicks[li]
        const box = controller.session.boxAtScreen(p.x, p.y)
        const res = !box ? 'sem caixa' : box.label === null ? 'sem categoria' : box.label === p.label ? 'coberta' : 'errada'
        cats[res]++
        if (res === 'errada') wrongCats.push(`${new Date(p.t).toISOString()} ${p.key} ${p.size}: app ${p.label}, nós ${box!.label}`)
        if (res === 'sem categoria') wrongCats.push(`${new Date(p.t).toISOString()} ${p.key} ${p.size}: app ${p.label}, nós sem categoria (${box!.w}x${box!.h})`)
      }
    }

    // o que a página fez ao vivo: mesma base de tempo da gravação, sem a diferença de relógio do app
    const live = readLivePickups(DIR!)
    const liveMatched = new Set<LivePickup>()
    const liveCounts: Record<string, number> = {}
    const liveDiffs: string[] = []
    const compareLive = (out: PickupOutcome) => {
      if (!live) return
      const tally = (k: string) => (liveCounts[k] = (liveCounts[k] ?? 0) + 1)
      const l = live
        .filter((q) => !liveMatched.has(q) && Math.abs(q.t - out.event.t) <= NEAR_MS)
        .sort((a, b) => Math.abs(a.t - out.event.t) - Math.abs(b.t - out.event.t))[0]
      if (!l) return tally('só no replay')
      liveMatched.add(l)
      const ours = out.kind === 'assigned' ? controller.session.boxByUid(out.uid) : null
      const where = (b: LivePickup['box']) => (b ? `(${b.col}, ${b.row}) ${b.w}x${b.h} ${b.label ?? 'sem categoria'}` : '-')
      const same =
        out.kind === l.outcome &&
        (out.kind === 'assigned'
          ? !!ours && !!l.box && ours.col === l.box.col && ours.row === l.box.row && ours.w === l.box.w && ours.h === l.box.h
          : out.reason === l.reason)
      if (same) {
        tally('igual')
        if (ours && l.box && ours.label !== l.box.label) {
          tally('categoria diferente')
          liveDiffs.push(`${new Date(l.t).toISOString()} categoria: ao vivo ${l.box.label}, replay ${ours.label}`)
        }
        return
      }
      tally('diferente')
      const replay = out.kind === 'assigned' ? where(ours && { col: ours.col, row: ours.row, w: ours.w, h: ours.h, label: ours.label }) : `? (${out.reason})`
      const atLive = l.outcome === 'assigned' ? where(l.box) : `? (${l.reason})`
      liveDiffs.push(`${new Date(l.t).toISOString()} ao vivo ${atLive}; replay ${replay}`)
    }

    /** Avalia a pegada na hora, com a sessão como estava: a caixa sob o cursor do app é o gabarito. */
    const judge = (out: PickupOutcome) => {
      heardTotal++
      compareLive(out)
      const p = picks
        .filter((q) => !matched.has(q) && Math.abs(q.t + APP_CLOCK_MS - out.event.t) <= NEAR_MS)
        .sort((a, b) => Math.abs(a.t + APP_CLOCK_MS - out.event.t) - Math.abs(b.t + APP_CLOCK_MS - out.event.t))[0]
      if (!p) return // som de pegar sem pegada no log (ou outro som parecido): não entra na conta
      matched.add(p)
      if (out.kind === 'unassigned') return tally(`? (${out.reason})`)
      const appBox = controller.session.boxAtScreen(p.x, p.y)
      if (!appBox) return tally('app fora de caixa')
      if (appBox.uid === out.uid) return tally('concorda')
      tally('errada')
      const ours = controller.session.boxByUid(out.uid)
      wrong.push(`${new Date(p.t).toISOString()} app ${p.key} ${p.size} em (${p.x}, ${p.y}); nós (${ours?.col}, ${ours?.row}) ${ours?.w}x${ours?.h}`)
    }

    // quadros e blocos de áudio em ordem de tempo, como chegariam ao vivo
    let fi = 0
    let lastFrameT = -Infinity
    const msPerSample = 1000 / 48000
    for (let start = 0; start < audio.length; start += BLOCK) {
      const tStart = session.audioStartEpochMs + start * msPerSample
      while (fi < frames.length && frames[fi].t <= tStart) {
        if (frames[fi].t - lastFrameT < FRAME_MS) {
          fi++
          continue
        }
        lastFrameT = frames[fi].t
        const img = decode(readFileSync(frames[fi].path), { useTArray: true, formatAsRGBA: true })
        const gray = rgbaToGray(img.data as unknown as Uint8ClampedArray, img.width, img.height)
        const r = pipeline.process(gray, frames[fi].t, controller.hint(), { w: img.width, h: img.height, data: img.data })
        if (r.labelMs !== undefined) labelMs.push(r.labelMs)
        controller.onFrame(r)
        judgeLabels(frames[fi].t)
        fi++
      }
      for (const e of listener.push(audio.subarray(start, start + BLOCK), tStart)) {
        if (e.kind === 'pickup') judge(controller.onPickup(e as Extract<ListenEvent, { kind: 'pickup' }>))
      }
    }
    counts['sem som'] = picks.length - matched.size
    const heard = matched.size
    labelMs.sort((a, b) => a - b)
    const ms = (q: number) => (labelMs.length ? labelMs[Math.min(labelMs.length - 1, Math.floor(q * labelMs.length))].toFixed(1) : '-')
    const labelSummary = MODELS
      ? `categorias (${labeledPicks.length} pegadas do log com categoria): ${JSON.stringify(cats)}\n${wrongCats.join('\n')}\n` +
        `leitura por varredura: p95 ${ms(0.95)} ms, máximo ${ms(1)} ms (${labelMs.length} varreduras)\n`
      : ''
    if (live) liveCounts['só ao vivo'] = live.length - liveMatched.size
    const liveSummary = live
      ? `ao vivo (${live.length} pegadas no events.jsonl): ${JSON.stringify(liveCounts)}\n${liveDiffs.join('\n')}\n`
      : 'ao vivo: a gravação não tem events.jsonl\n'
    const appSummary = LOG
      ? `${picks.length} pegadas do app, ${heard} com som, ${heardTotal} pegadas ouvidas\n${JSON.stringify(counts)}\n${wrong.join('\n')}\n`
      : `sem log do app; ${heardTotal} pegadas ouvidas\n`
    const summary = `${DIR}\n${appSummary}${liveSummary}${labelSummary}`
    console.log(summary)
    if (process.env.ABI_REPLAY_OUT) writeFileSync(process.env.ABI_REPLAY_OUT, summary)
    if (STRICT && LOG) {
      expect(counts['errada'] ?? 0).toBeLessThanOrEqual(1)
      expect(counts['concorda'] ?? 0).toBeGreaterThanOrEqual(0.95 * heard)
      if (MODELS) expect(cats['errada']).toBe(0)
    }
  }, 30 * 60_000)
})
