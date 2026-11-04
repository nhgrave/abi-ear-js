import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findOverlays, scan, type GridGeometry, type GridScan } from './grid'
import { fixturePath, hasFixtures, readGray, readJson } from '../../test-utils/fixtures'

type GoldenScan = {
  geometry: GridGeometry
  boxes: [number, number, number, number, boolean][]
  uncertain: [number, number][]
  overlays: [number, number, number, number][]
} | null
type Golden = { w: number; h: number; full: GoldenScan; right: GoldenScan }

const FRAMES = hasFixtures('frames')
  ? readdirSync(fixturePath('frames')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
  : []

function expectSameScan(got: GridScan | null, want: GoldenScan) {
  expect(got === null).toBe(want === null)
  if (got === null || want === null) return
  const g = got.geometry
  const w = want.geometry
  expect(Math.abs(g.x0 - w.x0)).toBeLessThanOrEqual(1)
  expect(Math.abs(g.y0 - w.y0)).toBeLessThanOrEqual(1)
  expect(Math.abs(g.pitch - w.pitch)).toBeLessThanOrEqual(1)
  expect([g.cols, g.rows]).toEqual([w.cols, w.rows])
  const boxes = (bs: [number, number, number, number, boolean][]) => bs.map((b) => b.join(',')).sort()
  expect(boxes(got.boxes.map((b) => [b.col, b.row, b.w, b.h, b.clipped]))).toEqual(boxes(want.boxes))
  expect([...got.uncertain].sort()).toEqual(want.uncertain.map(([c, r]) => `${c},${r}`).sort())
  expect(got.overlays.length).toBe(want.overlays.length)
  got.overlays.forEach((o, i) => o.forEach((v, j) => expect(Math.abs(v - want.overlays[i][j])).toBeLessThanOrEqual(1)))
}

describe.skipIf(FRAMES.length === 0)('scan matches the python golden on every fixture frame (full and right half)', () => {
  for (const name of FRAMES) {
    it(name, () => {
      const golden = readJson<Golden>(fixturePath('frames', `${name}.json`))
      const gray = readGray(name)
      expectSameScan(scan(gray), golden.full)
      const half = Math.floor(golden.w / 2)
      expectSameScan(scan(gray, [half, 0, golden.w - half, golden.h]), golden.right)
    })
  }
})

describe.skipIf(!hasFixtures('frames', 'live_vendor_backpack.json'))('with the vendor frame', () => {
  it('scan with the vendor hint keeps the hinted grid', () => {
    const golden = readJson<Golden>(fixturePath('frames', 'live_vendor_backpack.json'))
    const hint = golden.right!.geometry
    const found = scan(readGray('live_vendor_backpack'), null, hint)
    expect(found).not.toBeNull()
    expect(Math.abs(found!.geometry.x0 - hint.x0)).toBeLessThanOrEqual(1)
    expect(Math.abs(found!.geometry.y0 - hint.y0)).toBeLessThanOrEqual(1)
    expect(Math.abs(found!.geometry.pitch - hint.pitch)).toBeLessThanOrEqual(1)
    expect([found!.geometry.cols, found!.geometry.rows]).toEqual([hint.cols, hint.rows])
  })

  it.skipIf(!!process.env.CI)('scans a 1080p frame in under 150 ms', () => {
    const gray = readGray('live_vendor_backpack')
    scan(gray) // aquece o JIT
    const t0 = performance.now()
    scan(gray)
    expect(performance.now() - t0).toBeLessThan(150)
  })
})

describe('tooltip cut by the right edge of the screen', () => {
  // perto da borda direita da tela o canto de baixo do tooltip fica cortado. (Com o contorno da seta do cursor
  // cortando a cantoneira de cima ele não é achado; aí a sessão reconhece as caixas juntadas: withoutSuspects)
  const geom: GridGeometry = { x0: 100, y0: 100, pitch: 64, cols: 9, rows: 6 }
  const frame = () => {
    const w = 760
    const h = 600
    const data = new Uint8Array(w * h).fill(20)
    const set = (x: number, y: number, v: number) => x >= 0 && x < w && y >= 0 && y < h && (data[y * w + x] = v)
    for (let y = 200; y < 292; y++) for (let x = 560; x < 800; x++) set(x, y, 3) // fundo do tooltip, até além da tela
    for (let x = 560; x < 800; x++) set(x, 200, 150) // borda de cima
    for (let y = 200; y < 292; y++) set(560, y, 150) // borda esquerda
    for (let x = 560; x < 800; x++) set(x, 291, 150) // borda de baixo
    for (let y = 210; y < 230; y++) for (let x = 580; x < 640; x += 3) set(x, y, 200) // texto
    return { w, h, data }
  }

  it('is found from its top-left corner', () => {
    expect(findOverlays(frame(), geom)).toHaveLength(1)
  })
})
