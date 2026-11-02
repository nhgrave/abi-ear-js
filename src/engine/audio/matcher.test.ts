import { beforeAll, describe, expect, it } from 'vitest'
import { SoundMatcher } from './matcher'
import { fixturePath, hasFixtures, readF32, readJson } from '../../test-utils/fixtures'

type MatcherGolden = {
  clips: Record<string, { peaks: Record<string, [number, number]>; match: [number, number][] }>
  refs: Record<string, number>
}

describe.skipIf(!hasFixtures('golden', 'matcher.json'))('SoundMatcher vs python golden', () => {
  const golden = readJson<MatcherGolden>(fixturePath('golden', 'matcher.json'))
  let matcher: SoundMatcher

  beforeAll(() => {
    const merchant = readJson<{ sounds: { pickup: string; id: number }[] }>(fixturePath('merchant.json'))
    matcher = new SoundMatcher()
    for (const s of merchant.sounds) {
      matcher.addReference(s.id, readF32(fixturePath('sounds', `${s.pickup}.f32`)), s.pickup)
    }
  })

  it('reference lengths match python', () => {
    const lengths: Record<string, number> = {}
    for (const r of matcher.references) lengths[r.soundId] = r.samples.length
    expect(lengths).toEqual(golden.refs)
  })

  it('peaks match the python golden on every clip', () => {
    for (const [name, g] of Object.entries(golden.clips)) {
      const peaks = matcher.peaks(readF32(fixturePath('clips', `${name}.f32`)))
      expect([...peaks.keys()].sort()).toEqual(Object.keys(g.peaks).map(Number).sort())
      for (const [id, [score, index]] of Object.entries(g.peaks)) {
        const [s, i] = peaks.get(Number(id))!
        expect(Math.abs(s - score), `${name} #${id} nota`).toBeLessThanOrEqual(0.01)
        expect(Math.abs(i - index), `${name} #${id} índice`).toBeLessThanOrEqual(2)
      }
    }
  })

  it('match gives the same hits as python', () => {
    for (const [name, g] of Object.entries(golden.clips)) {
      const hits = matcher.match(readF32(fixturePath('clips', `${name}.f32`)))
      expect(hits.map((h) => h.soundId), name).toEqual(g.match.map(([id]) => id))
      hits.forEach((h, k) => expect(Math.abs(h.score - g.match[k]![1])).toBeLessThanOrEqual(0.01))
    }
  })

  it('peaks are fast enough for continuous listening', () => {
    const clip = readF32(fixturePath('clips', 'clock.f32')).subarray(0, 24000)
    matcher.peaks(clip) // aquece o cache de espectros e o JIT
    const t0 = performance.now()
    for (let i = 0; i < 5; i++) matcher.peaks(clip)
    const avg = (performance.now() - t0) / 5
    console.log(`peaks: ${avg.toFixed(1)} ms por chamada (0,5 s, ${matcher.references.length} referências)`)
    expect(avg).toBeLessThan(40)
  })
})

describe('SoundMatcher', () => {
  it('ignores silent references and clips shorter than the references', () => {
    const m = new SoundMatcher()
    m.addReference(1, new Float32Array(48000))
    expect(m.references).toHaveLength(0)
    const noise = Float32Array.from({ length: 20000 }, (_, i) => Math.sin(i * 0.9) * Math.cos(i * 0.013))
    m.addReference(2, noise)
    expect(m.peaks(new Float32Array(100)).size).toBe(0)
  })
})
