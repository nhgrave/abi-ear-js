import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fixturePath, hasFixtures, readJson, readRawGray } from '../../test-utils/fixtures'
import { ARROW, ARROW_POINT } from './arrow'
import { CursorTracker, matchArrow } from './cursor'
import type { Gray } from './image'

type Item = { file: string; w: number; h: number; ox: number; oy: number; score: number; x: number; y: number }

describe.skipIf(!hasFixtures('cursor', 'index.json'))('matchArrow golden', () => {
  it('ARROW equals the exported file', () => {
    const f = new Uint8Array(readFileSync(fixturePath('cursor', 'arrow.gray')))
    expect(Array.from(ARROW.data)).toEqual(Array.from(f))
  })

  it('matchArrow matches opencv on the recorded crops', () => {
    const items = readJson<Item[]>(fixturePath('cursor', 'index.json'))
    expect(items.length).toBe(20)
    for (const it of items) {
      const g = readRawGray(fixturePath('cursor', it.file), it.w, it.h)
      const m = matchArrow(g, [0, 0, it.w, it.h])
      expect([it.file, m.x, m.y]).toEqual([it.file, it.x, it.y])
      expect(Math.abs(m.score - it.score)).toBeLessThan(0.01)
    }
  })
})

/** Quadro com ruído e a seta num ponto conhecido. */
function noisy(w: number, h: number, ax: number, ay: number): Gray {
  const data = new Uint8Array(w * h)
  let s = 12345
  for (let i = 0; i < data.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    data[i] = 40 + ((s >> 16) % 60)
  }
  for (let j = 0; j < ARROW.h; j++) for (let i = 0; i < ARROW.w; i++) data[(ay + j) * w + ax + i] = ARROW.data[j * ARROW.w + i]
  return { w, h, data }
}

describe('matchArrow speed and tracker', () => {
  const grid = { x0: 200, y0: 100, pitch: 64, cols: 11, rows: 13 }
  const g = noisy(1920, 1080, 500, 400)
  const timeIt = (f: () => void) => {
    f() // aquecimento
    const t = performance.now()
    f()
    return performance.now() - t
  }

  // tempo depende da máquina: na CI (runner compartilhado) não vale como critério
  it.skipIf(!!process.env.CI)('matchArrow is fast enough', () => {
    const local = timeIt(() => matchArrow(g, [500 - 128, 400 - 128, 256 + ARROW.w, 256 + ARROW.h]))
    const whole = timeIt(() => matchArrow(g, [grid.x0 - 64, grid.y0 - 64, 13 * 64, 15 * 64]))
    console.log(`matchArrow local ${local.toFixed(1)} ms, grid ${whole.toFixed(1)} ms`)
    expect(local).toBeLessThan(15)
    expect(whole).toBeLessThan(150)
  })

  it('CursorTracker finds the arrow, adds ARROW_POINT and needs a grid', () => {
    const tr = new CursorTracker()
    expect(tr.find(g, 0, null)).toBeNull()
    expect(tr.find(g, 5, grid)).toMatchObject({ t: 5, x: 500 + ARROW_POINT[0], y: 400 + ARROW_POINT[1] })
    expect(tr.find(g, 6, grid)).toMatchObject({ x: 501, y: 406 }) // busca local
    const flat: Gray = { w: 1920, h: 1080, data: new Uint8Array(1920 * 1080).fill(30) }
    expect(tr.find(flat, 7, grid)).toBeNull()
  })
})
