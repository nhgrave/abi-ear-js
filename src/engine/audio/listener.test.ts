import { describe, expect, it } from 'vitest'
import { Listener, type ListenEvent } from './listener'
import { SoundMatcher } from './matcher'
import { SAMPLE_RATE } from './filter'
import { fixturePath, hasFixtures, readF32, readJson } from '../../test-utils/fixtures'

const BLOCK = 4096
const MS_PER_SAMPLE = 1000 / SAMPLE_RATE

function feed(listener: Listener, x: Float32Array, startMs = 0): ListenEvent[] {
  const events: ListenEvent[] = []
  for (let i = 0; i < x.length; i += BLOCK) {
    events.push(...listener.push(x.subarray(i, i + BLOCK), startMs + i * MS_PER_SAMPLE))
  }
  return events
}

describe.skipIf(!hasFixtures('golden', 'listen.json'))('Listener vs python golden', () => {
  it('listener finds the same pickups as python', () => {
    const merchant = readJson<{ sounds: { pickup: string; id: number }[] }>(fixturePath('merchant.json'))
    const matcher = new SoundMatcher()
    for (const s of merchant.sounds) {
      matcher.addReference(s.id, readF32(fixturePath('sounds', `${s.pickup}.f32`)), s.pickup)
    }
    const x = readF32(fixturePath('clips', 'listen.f32'))
    const duration = x.length / SAMPLE_RATE
    // O Listener só emite o pickup quando o buffer cobre t + CLIP_AFTER_S (0,7 s); o que cai nos últimos
    // 0,7 s do arquivo fica pendente, então o gabarito é cortado aí.
    const golden = readJson<[number, number, number][]>(fixturePath('golden', 'listen.json')).filter(
      ([t]) => t <= duration - 0.7,
    )
    expect(golden.length).toBeGreaterThan(10)

    const pickups = feed(new Listener(matcher), x).filter((e) => e.kind === 'pickup')
    expect(pickups.map((e) => e.soundId)).toEqual(golden.map(([, id]) => id))
    pickups.forEach((e, k) => {
      const [t, , score] = golden[k]!
      expect(Math.abs(e.t - t * 1000), `t #${k}`).toBeLessThanOrEqual(5)
      expect(Math.abs(e.score - score), `nota #${k}`).toBeLessThanOrEqual(0.01)
      if (e.kind === 'pickup') expect(e.hits.length).toBeGreaterThan(0)
    })
  }, 60_000) // 2 min de áudio em janelas de 0,1 s
})

describe('Listener', () => {
  // ruído branco determinístico (LCG)
  const noise = (n: number, amp: number, seed: number) => {
    let s = seed
    return Float32Array.from({ length: n }, () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return ((s / 2 ** 32) * 2 - 1) * amp
    })
  }

  it('listener reports a near miss between 0.5 and 0.7', () => {
    const ref = noise(14400, 0.3, 1)
    const matcher = new SoundMatcher()
    matcher.addReference(7, ref)
    const place = (sigma: number) => {
      const x = noise(3 * SAMPLE_RATE, sigma, 2)
      for (let i = 0; i < ref.length; i++) x[SAMPLE_RATE + i]! += ref[i]!
      return x
    }
    // escolhe o ruído que deixa a nota entre 0,55 e 0,65
    const sigma = [0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 1].find((s) => {
      const score = matcher.peaks(place(s)).get(7)![0]
      return score > 0.55 && score < 0.65
    })
    expect(sigma).toBeDefined()
    const events = feed(new Listener(matcher), place(sigma!))
    expect(events.some((e) => e.kind === 'pickup')).toBe(false)
    const miss = events.filter((e) => e.kind === 'near-miss')
    expect(miss).toHaveLength(1)
    expect(miss[0]!.soundId).toBe(7)
    expect(Math.abs(miss[0]!.t - 1000)).toBeLessThanOrEqual(5)
  })

  it('emits a pickup once, with the matcher hits, for a clean signal', () => {
    const ref = noise(14400, 0.3, 3)
    const matcher = new SoundMatcher()
    matcher.addReference(9, ref)
    const x = new Float32Array(3 * SAMPLE_RATE)
    x.set(ref, SAMPLE_RATE)
    const events = feed(new Listener(matcher), x, 5000)
    expect(events).toHaveLength(1)
    const e = events[0]!
    expect(e.kind).toBe('pickup')
    if (e.kind === 'pickup') {
      expect(e.soundId).toBe(9)
      expect(Math.abs(e.t - 6000)).toBeLessThanOrEqual(5)
      expect(e.hits.map((h) => h.soundId)).toEqual([9])
    }
  })
})
