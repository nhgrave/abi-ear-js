import { beforeEach, describe, expect, it } from 'vitest'
import { Controller } from './controller'
import { Dataset } from './data/dataset'
import type { FrameResult } from './pipeline'
import type { BoxRect, GridGeometry, GridScan } from './vision/types'
import type { SoundHit } from './candidates'
import { fixturePath, hasFixtures, readJson } from '../test-utils/fixtures'

const GEOM: GridGeometry = { x0: 0, y0: 0, pitch: 64, cols: 9, rows: 6 }
const rect = (col: number, row: number, w: number, h: number, clipped = false): BoxRect => ({ col, row, w, h, clipped })
const grid = (boxes: BoxRect[], geometry = GEOM): GridScan => ({ geometry, boxes, uncertain: new Set(), overlays: [] })
const SCAN = grid([rect(7, 1, 1, 2), rect(0, 0, 2, 2)])
const ON_7_1: [number, number] = [7 * 64 + 10, 64 + 10]

function frame(t: number, scan?: GridScan | null, cursor?: [number, number] | null): FrameResult {
  return { t, scan, mean: 40, cursor: cursor ? { t, x: cursor[0], y: cursor[1], score: 0.95 } : null }
}

describe.skipIf(!hasFixtures('merchant.json'))('controller', () => {
  let c: Controller
  /** Vê o vendedor e o cursor parado no ponto nos 400 ms antes do som; depois a pegada. */
  const pickAt = (tSound: number, point: [number, number], hits: SoundHit[] = [{ soundId: 31, score: 0.95 }]) => {
    for (const dt of [380, 280, 180]) c.onFrame(frame(tSound - dt, dt === 380 ? SCAN : undefined, point))
    return c.onPickup({ kind: 'pickup', t: tSound, soundId: hits[0]?.soundId ?? 0, score: hits[0]?.score ?? 0, hits })
  }
  beforeEach(() => {
    c = new Controller(new Dataset(readJson(fixturePath('merchant.json'))))
    c.setProfile(5)
  })

  it('scan then click identifies box', () => {
    const out = pickAt(99_000, ON_7_1)
    const box = c.session.boxAtScreen(...ON_7_1)!
    expect(out).toMatchObject({ kind: 'assigned', uid: box.uid })
    expect(box.picks).toBe(1)
    expect(box.ranking!.candidates.map((x) => x.item.name)).toContain('Desk Clock')
    expect(box.hits()).toEqual([{ soundId: 31, score: 0.95 }])
  })

  it('click outside boxes is ignored', () => {
    expect(pickAt(99_000, [5 * 64 + 5, 5 * 64 + 5])).toMatchObject({ kind: 'unassigned', reason: 'no-box' })
  })

  it('vendor closed and reopened keeps results', () => {
    pickAt(1_000, ON_7_1)
    for (const t of [5_000, 40_000]) c.onFrame(frame(t, null)) // saiu do vendedor por meio minuto
    expect(c.session.boxes.size).toBeGreaterThan(0)
    expect(c.vendorVisible).toBe(false)
    c.onFrame(frame(60_000, SCAN)) // mesmo vendedor, mesmo estoque
    expect(c.vendorVisible).toBe(true)
    expect(c.session.boxes.get('7,1')!.picks).toBe(1)
  })

  it('reopened vendor with another layout starts fresh', () => {
    pickAt(1_000, ON_7_1)
    c.onFrame(frame(5_000, null))
    c.onFrame(frame(60_000, grid([rect(0, 0, 1, 1), rect(1, 0, 1, 1), rect(3, 2, 2, 1)])))
    expect([...c.session.boxes.keys()].sort()).toEqual(['0,0', '1,0', '3,2'])
    expect([...c.session.boxes.values()].every((b) => b.picks === 0)).toBe(true)
  })

  it('profile change reranks', () => {
    pickAt(99_000, ON_7_1)
    const box = c.session.boxes.get('7,1')!
    const before = box.ranking
    c.setProfile(1)
    expect(c.profileId).toBe(1)
    expect(box.ranking).not.toBe(before)
  })

  it('all maps uses every profile', () => {
    c.setProfile(null)
    expect(c.profiles()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    c.setProfile(4)
    expect(c.profiles()).toEqual([4])
  })

  it('click on box only seen clipped ignores size', () => {
    const clipped = grid([rect(7, 5, 1, 1, true)])
    for (const dt of [380, 280, 180]) c.onFrame(frame(99_000 - dt, dt === 380 ? clipped : undefined, [7 * 64 + 10, 5 * 64 + 10]))
    c.onPickup({ kind: 'pickup', t: 99_000, soundId: 31, score: 0.95, hits: [{ soundId: 31, score: 0.95 }] })
    const box = c.session.boxes.get('7,5')!
    expect(box.ranking!.candidates.map((x) => x.item.name)).toContain('Desk Clock')
    expect(box.ranking!.sizeRelaxed).toBe(false)
  })

  it('click long after last grid is ignored', () => {
    c.onFrame(frame(93_000, SCAN))
    c.onFrame(frame(94_000, null))
    for (const dt of [380, 280, 180]) c.onFrame(frame(99_500 - dt, undefined, ON_7_1))
    expect(c.onPickup({ kind: 'pickup', t: 99_500, soundId: 31, score: 0.95, hits: [] })).toMatchObject({ kind: 'unassigned', reason: 'no-vendor' })
    expect(c.session.boxes.get('7,1')!.picks).toBe(0)
  })

  it('implausible box size is uncertain and keeps results', () => {
    pickAt(99_000, [10, 10], [{ soundId: 12, score: 0.95 }])
    c.onFrame(frame(99_500, grid([rect(7, 1, 1, 2), rect(0, 0, 4, 3)]))) // dica "R Rotate" sobre o grid
    const box = c.session.boxes.get('0,0')!
    expect(box.size).toEqual([2, 2])
    expect(box.picks).toBe(1)
  })

  it('inventory grid after leaving the vendor keeps the session', () => {
    pickAt(98_500, ON_7_1)
    c.onFrame(frame(99_000, null))
    const loot = grid([rect(0, 2, 1, 2), rect(1, 2, 1, 1)], { x0: 600, y0: 80, pitch: 32, cols: 6, rows: 5 })
    c.onFrame(frame(112_000, loot))
    expect(c.vendorVisible).toBe(false)
    c.onFrame(frame(113_000, loot))
    expect(c.vendorVisible).toBe(false)
    expect(c.session.boxes.get('7,1')!.picks).toBe(1)
    c.onFrame(frame(120_000, SCAN)) // de volta ao vendedor
    expect(c.session.boxes.get('7,1')!.picks).toBe(1)
  })

  it('ignores a grid with another pitch and keeps the session', () => {
    pickAt(1_000, ON_7_1)
    c.onFrame(frame(1_500, grid([rect(0, 0, 1, 1), rect(2, 0, 1, 1)], { x0: 0, y0: 0, pitch: 40, cols: 9, rows: 6 })))
    expect(c.vendorVisible).toBe(false)
    expect(c.session.geometry!.pitch).toBe(64)
    expect(c.session.boxes.get('7,1')!.picks).toBe(1)
  })

  it('view lists boxes with candidates and icons', () => {
    pickAt(99_000, ON_7_1)
    const v = c.view()
    const b = v.boxes.find((x) => x.col === 7 && x.row === 1)!
    expect(b.picks).toBe(1)
    expect(b.candidates[0].icon).toMatch(/^data\/icons\/\d+\.png$/)
    expect(v.geometry).toEqual(GEOM)
  })
})
