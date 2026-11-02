/** Aceitação do motor: repete uma gravação real do protótipo e compara com o log do app desktop.
 *
 * ABI_REPLAY=<pasta da gravação> ABI_APP_LOG=<abi-ear.log> npx vitest run src/engine/replay.test.ts
 * Opcional: ABI_REPLAY_STRICT=0 só imprime a tabela, sem exigir o critério (gravações de pega e devolve);
 * ABI_REPLAY_OUT=<arquivo> grava a tabela (o vitest esconde o console de testes que passam).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decode } from 'jpeg-js'
import { describe, expect, it } from 'vitest'
import { Listener, type ListenEvent } from './audio/listener'
import { SoundMatcher } from './audio/matcher'
import { Controller, type PickupOutcome } from './controller'
import { Dataset } from './data/dataset'
import { FramePipeline } from './pipeline'
import { rgbaToGray } from './vision/image'
import { fixturePath, readF32, readJson } from '../test-utils/fixtures'

const DIR = process.env.ABI_REPLAY
const LOG = process.env.ABI_APP_LOG
const STRICT = process.env.ABI_REPLAY_STRICT !== '0'
const APP_CLOCK_MS = 85 // o som na gravação chega cerca de 85 ms depois do horário que o app registra
const NEAR_MS = 500 // pegada ouvida a até isto da pegada do app (como tools/spike_eval.py)
const BLOCK = 4096

type AppPick = { t: number; x: number; y: number; key: string; size: string }

/** Linhas "pegada às" do log do app (hora local), como parse_app_picks de tools/spike_eval.py. */
function parseAppPicks(text: string): AppPick[] {
  const re = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d),(\d{3}) INFO abi_ear\.controller: pegada às (\d\d:\d\d:\d\d\.\d{3}) em \((-?\d+), (-?\d+)\): caixa \((-?\d+), (-?\d+)\) (\S+)/gm
  const seen = new Map<string, AppPick>()
  for (const m of text.matchAll(re)) {
    const logged = new Date(`${m[1]}T${m[2]}.${m[3]}`).getTime()
    let at = new Date(`${m[1]}T${m[4]}`).getTime()
    if (at > logged + 3600_000) at -= 86_400_000 // som antes da meia-noite, linha escrita depois
    const p = { t: at, x: Number(m[5]), y: Number(m[6]), key: `${m[7]},${m[8]}`, size: m[9] }
    const id = `${p.t}|${p.x}|${p.y}`
    if (!seen.has(id)) seen.set(id, p)
  }
  return [...seen.values()]
}

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

describe.skipIf(!DIR || !LOG)('replay of a real recording', () => {
  it('agrees with the desktop app picks', () => {
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
    controller.setProfile(null)
    const pipeline = new FramePipeline()
    const picks = parseAppPicks(readFileSync(LOG!, 'latin1')).filter((p) => p.t >= frames[0].t && p.t <= frames[frames.length - 1].t)
    const counts: Record<string, number> = {}
    const wrong: string[] = []
    const matched = new Set<AppPick>()
    let heardTotal = 0
    const tally = (res: string) => (counts[res] = (counts[res] ?? 0) + 1)

    /** Avalia a pegada na hora, com a sessão como estava: a caixa sob o cursor do app é o gabarito. */
    const judge = (out: PickupOutcome) => {
      heardTotal++
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
    const msPerSample = 1000 / 48000
    for (let start = 0; start < audio.length; start += BLOCK) {
      const tStart = session.audioStartEpochMs + start * msPerSample
      while (fi < frames.length && frames[fi].t <= tStart) {
        const img = decode(readFileSync(frames[fi].path), { useTArray: true, formatAsRGBA: true })
        const gray = rgbaToGray(img.data as unknown as Uint8ClampedArray, img.width, img.height)
        controller.onFrame(pipeline.process(gray, frames[fi].t, controller.hint()))
        fi++
      }
      for (const e of listener.push(audio.subarray(start, start + BLOCK), tStart)) {
        if (e.kind === 'pickup') judge(controller.onPickup(e as Extract<ListenEvent, { kind: 'pickup' }>))
      }
    }
    counts['sem som'] = picks.length - matched.size
    const heard = matched.size
    const summary = `${DIR}\n${picks.length} pegadas do app, ${heard} com som, ${heardTotal} pegadas ouvidas\n${JSON.stringify(counts)}\n${wrong.join('\n')}\n`
    console.log(summary)
    if (process.env.ABI_REPLAY_OUT) writeFileSync(process.env.ABI_REPLAY_OUT, summary)
    if (STRICT) {
      expect(counts['errada'] ?? 0).toBeLessThanOrEqual(1)
      expect(counts['concorda'] ?? 0).toBeGreaterThanOrEqual(0.95 * heard)
    }
  }, 30 * 60_000)
})
