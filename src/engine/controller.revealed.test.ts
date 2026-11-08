import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Controller } from './controller'
import { Dataset } from './data/dataset'
import type { FrameResult } from './pipeline'
import { iconImage, type BoxImage, type IconSource } from './vision/revealed'
import type { GridGeometry } from './vision/types'

// a base publicada (public/data): o Portable Jack é um item 2x1 de Tools, revelado na gravação 2026-11-07-160851
const ds = new Dataset(JSON.parse(readFileSync('public/data/merchant.json', 'utf8')))
const JACK = 408050029
const GEOM: GridGeometry = { x0: 1254, y0: 190, pitch: 64, cols: 9, rows: 11 }

function icon(seed: number): IconSource {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const data = new Uint8ClampedArray(64 * 32 * 4)
  for (let k = 0; k < 6; k++) {
    const [cx, cy, r, color] = [rnd() * 64, rnd() * 32, 4 + rnd() * 16, [rnd() * 255, rnd() * 255, rnd() * 255]]
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) data.set([...color, 255], (y * 64 + x) * 4)
  }
  return { w: 64, h: 32, data }
}

/** A caixa como a tela a mostra revelada: o ícone do item sobre o fundo roxo da raridade. */
function revealedImage(itemIcon: IconSource): BoxImage {
  const img = iconImage(itemIcon, 2, 1)
  const rgba = new Uint8ClampedArray(img.rgba)
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] < 128) rgba.set([29, 21, 42, 255], i)
  return { ...img, rgba }
}

const frame = (t: number, revealed: boolean): FrameResult => ({
  t,
  cursor: null,
  scan: { geometry: GEOM, boxes: [{ col: 0, row: 0, w: 2, h: 1, clipped: false, lit: true }, { col: 2, row: 0, w: 2, h: 1, clipped: false }], uncertain: new Set(), overlays: [] },
  mean: 40,
  labels: [],
  tab: 'purchase',
  ...(revealed && { revealed: [{ col: 0, row: 0, w: 2, h: 1, image: revealedImage(icon(JACK)) }] }),
})

describe('revealed boxes in the controller', () => {
  it('shows the revealed item at 100%, with no pickup', () => {
    const c = new Controller(ds)
    c.icons = (id) => iconImage(icon(id), 2, 1)
    c.onFrame(frame(1000, true))
    const box = c.view().boxes.find((b) => b.col === 0)!
    expect(box).toMatchObject({ revealed: true, picks: 0 })
    expect(box.candidates.map((x) => [x.name, x.pct])).toEqual([['Portable Jack', 100]])
    expect(c.view().boxes.find((b) => b.col === 2)).toMatchObject({ revealed: false, candidates: [] })
  })

  it('waits for the icons to load and identifies on a later frame', () => {
    const c = new Controller(ds)
    let loaded = false
    c.icons = (id) => (loaded ? iconImage(icon(id), 2, 1) : null)
    c.onFrame(frame(1000, true))
    expect(c.view().boxes.find((b) => b.col === 0)!.revealed).toBe(false)
    loaded = true
    c.onFrame(frame(1400, true))
    expect(c.view().boxes.find((b) => b.col === 0)!.candidates.map((x) => x.name)).toEqual(['Portable Jack'])
  })

  it('keeps the revealed item when the box is picked', () => {
    const c = new Controller(ds)
    c.icons = (id) => iconImage(icon(id), 2, 1)
    for (const t of [700, 900, 1000]) c.onFrame({ ...frame(t, t === 1000), cursor: { t, x: GEOM.x0 + 64, y: GEOM.y0 + 32, score: 0.95 } })
    const sound = ds.items.get(JACK)!.soundId
    const out = c.onPickup({ kind: 'pickup', t: 1250, soundId: sound, score: 0.9, hits: [{ soundId: sound, score: 0.9 }] })
    expect(out.kind).toBe('assigned')
    expect(c.view().boxes.find((b) => b.col === 0)!.candidates.map((x) => [x.name, x.pct])).toEqual([['Portable Jack', 100]])
  })

  it('identifies nothing without icons (the page has not loaded them yet)', () => {
    const c = new Controller(ds)
    c.onFrame(frame(1000, true))
    expect(c.view().boxes.find((b) => b.col === 0)!.revealed).toBe(false)
  })
})
