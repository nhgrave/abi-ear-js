import { describe, expect, it } from 'vitest'
import { hasFixtures, readF32, readGray, readJson, fixturePath } from './fixtures'

describe.skipIf(!hasFixtures('frames', 'frame_22_5.json'))('fixtures', () => {
  it('reads a gray frame with the size from its json', () => {
    const g = readGray('frame_22_5')
    expect(g.data.length).toBe(g.w * g.h)
    expect(g.w).toBeGreaterThan(0)
  })
  it('reads float32 audio and json', () => {
    const x = readF32(fixturePath('clips', 'brooch.f32'))
    expect(x.length).toBeGreaterThan(10000)
    expect(readJson<unknown[]>(fixturePath('golden', 'listen.json')).length).toBeGreaterThan(0)
  })
})
