import { describe, expect, it } from 'vitest'
import { backgroundTint, boxImage, identify, iconImage, iconScore, ICON_FILL, revealedBoxes, SIG_CELL, type IconSource } from './revealed'
import type { BoxRect, GridGeometry } from './types'
import type { Rgba } from './vendor-tab'

const GEOM: GridGeometry = { x0: 10, y0: 10, pitch: 64, cols: 3, rows: 2 }
const BG_NORMAL: [number, number, number] = [15, 17, 17]
const BG_PURPLE: [number, number, number] = [29, 21, 42] // caixa revelada de raridade roxa (gravação 2026-11-07-160851)

/** Ícone de teste w x h: formas coloridas sorteadas pela semente, fundo transparente. */
function icon(seed: number, w: number, h: number): IconSource {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const data = new Uint8ClampedArray(w * h * 4)
  for (let k = 0; k < 6; k++) {
    const [cx, cy, r] = [rnd() * w, rnd() * h, 4 + rnd() * (w / 4)]
    const color = [rnd() * 255, rnd() * 255, rnd() * 255]
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue
      const i = (y * w + x) * 4
      data.set([color[0], color[1], color[2], 255], i)
    }
  }
  return { w, h, data }
}

/** Tela com uma caixa em (0,0) de w x h células: fundo da cor dada e, se houver, o ícone desenhado como o jogo faz
 * (80% da caixa, centralizado), com um pouco de ruído. */
function screen(box: BoxRect, bg: [number, number, number], ic: IconSource | null, x0 = 0): Rgba {
  const W = 220
  const H = 150
  const data = new Uint8ClampedArray(W * H * 4)
  let s = 99
  const noise = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 6
  const bw = box.w * GEOM.pitch
  const bh = box.h * GEOM.pitch
  const k = Math.min((ICON_FILL * bw) / (ic?.w ?? 1), (ICON_FILL * bh) / (ic?.h ?? 1))
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let px = [0, 0, 0]
    const bx = x - GEOM.x0
    const by = y - GEOM.y0
    if (bx >= 0 && by >= 0 && bx < bw && by < bh) {
      px = [...bg]
      if (ic) {
        const ix = Math.floor((bx - (bw - ic.w * k) / 2) / k)
        const iy = Math.floor((by - (bh - ic.h * k) / 2) / k)
        if (ix >= 0 && iy >= 0 && ix < ic.w && iy < ic.h && ic.data[(iy * ic.w + ix) * 4 + 3] > 128) {
          const i = (iy * ic.w + ix) * 4
          px = [ic.data[i], ic.data[i + 1], ic.data[i + 2]]
        }
      }
    }
    const o = (y * W + x) * 4
    data.set([px[0] + noise(), px[1] + noise(), px[2] + noise(), 255], o)
  }
  if (!x0) return { w: W, h: H, data }
  // só a parte da direita, a partir de x0 (como o worker lê a metade direita da tela)
  const half = new Uint8ClampedArray((W - x0) * H * 4)
  for (let y = 0; y < H; y++) half.set(data.subarray((y * W + x0) * 4, (y * W + W) * 4), y * (W - x0) * 4)
  return { w: W - x0, h: H, data: half, x0 }
}

const BOX: BoxRect = { col: 0, row: 0, w: 2, h: 1, clipped: false }
const JACK = icon(1, 64, 32)
const BOTTLE = icon(2, 64, 32)
const CABLE = icon(3, 64, 32)

describe('revealed box', () => {
  it('has a colored background (the rarity), a common box a gray one', () => {
    expect(backgroundTint(screen(BOX, BG_PURPLE, JACK), GEOM, BOX)).toBeGreaterThanOrEqual(15)
    expect(backgroundTint(screen(BOX, BG_NORMAL, null), GEOM, BOX)).toBeLessThan(5)
  })

  it('resamples the box to SIG_CELL px per cell', () => {
    const img = boxImage(screen(BOX, BG_PURPLE, JACK), GEOM, BOX)
    expect([img.w, img.h, img.rgba.length]).toEqual([2 * SIG_CELL, SIG_CELL, 2 * SIG_CELL * SIG_CELL * 4])
  })

  it('scores the icon drawn in the box far above the other icons', () => {
    const img = boxImage(screen(BOX, BG_PURPLE, JACK), GEOM, BOX)
    expect(iconScore(img, iconImage(JACK, 2, 1))).toBeGreaterThan(0.8)
    expect(iconScore(img, iconImage(BOTTLE, 2, 1))).toBeLessThan(0.5)
  })

  it('identifies the item among the candidates', () => {
    const img = boxImage(screen(BOX, BG_PURPLE, JACK), GEOM, BOX)
    const icons = [BOTTLE, JACK, CABLE].map((ic, k) => ({ itemId: 100 + k, image: iconImage(ic, 2, 1) }))
    expect(identify(img, icons)).toMatchObject({ itemId: 101 })
  })

  it('reads the same from the right half of the screen (the worker reads from x0)', () => {
    const img = boxImage(screen(BOX, BG_PURPLE, JACK, 5), GEOM, BOX)
    expect(identify(img, [JACK, BOTTLE].map((ic, k) => ({ itemId: k, image: iconImage(ic, 2, 1) })))).toMatchObject({ itemId: 0 })
  })

  it('identifies nothing when no candidate fits (the item is not in the list) or two fit alike', () => {
    const img = boxImage(screen(BOX, BG_PURPLE, JACK), GEOM, BOX)
    expect(identify(img, [BOTTLE, CABLE].map((ic, k) => ({ itemId: k, image: iconImage(ic, 2, 1) })))).toBeNull()
    expect(identify(img, [JACK, JACK].map((ic, k) => ({ itemId: k, image: iconImage(ic, 2, 1) })))).toBeNull()
  })

  it('keeps the icon proportion inside the box (a square icon in a 2x1 box)', () => {
    const square = icon(4, 64, 64)
    const img = boxImage(screen(BOX, BG_PURPLE, square), GEOM, BOX)
    expect(iconScore(img, iconImage(square, 2, 1))).toBeGreaterThan(0.8)
  })
})

describe('revealedBoxes', () => {
  it('takes the whole boxes with something bright below the label (lit) on a colored background', () => {
    const revealed = screen(BOX, BG_PURPLE, JACK)
    const common = screen(BOX, BG_NORMAL, JACK) // texto claro de um tooltip por cima de uma caixa comum
    const lit: BoxRect = { ...BOX, lit: true }
    expect(revealedBoxes(revealed, GEOM, [lit]).map((r) => [r.col, r.row, r.w, r.h])).toEqual([[0, 0, 2, 1]])
    expect(revealedBoxes(revealed, GEOM, [lit])[0].image.w).toBe(2 * SIG_CELL)
    expect(revealedBoxes(common, GEOM, [lit])).toEqual([])
    expect(revealedBoxes(revealed, GEOM, [BOX])).toEqual([]) // sem nada claro abaixo do rótulo: não há imagem
    expect(revealedBoxes(revealed, GEOM, [{ ...lit, clipped: true }])).toEqual([])
  })
})
