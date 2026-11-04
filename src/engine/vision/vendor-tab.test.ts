import { describe, expect, it } from 'vitest'
import type { GridGeometry } from './types'
import { vendorTab, warm } from './vendor-tab'

// grid do Field Merchant em 1080p: 9 colunas de 64 px a partir de (1255, 190); a barra das abas fica em y 119..147
const G: GridGeometry = { x0: 1255, y0: 190, pitch: 64, cols: 9, rows: 11 }
const W = 1920
const H = 1080
const TAB = [40, 21, 11] // aba ativa
const OFF = [15, 17, 17] // aba inativa

function image(paint: (x: number, y: number) => number[] | null) {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = paint(x, y) ?? [8, 8, 8]
      data.set([c[0], c[1], c[2], 255], (y * W + x) * 4)
    }
  return { w: W, h: H, data }
}

const inBar = (y: number) => y >= 119 && y < 147
const mid = G.x0 + (G.cols * G.pitch) / 2
const bar = (active: 'left' | 'right') => (x: number, y: number) =>
  inBar(y) && x >= G.x0 + 35 && x < G.x0 + G.cols * G.pitch - 35 ? ((x < mid) === (active === 'left') ? TAB : OFF) : null

describe('warm', () => {
  it('takes the active tab brown and rejects the inactive gray', () => {
    expect(warm(40, 21, 11)).toBe(true)
    expect(warm(15, 17, 17)).toBe(false)
  })

  it('rejects the red weapon backgrounds and the gold rarity backgrounds of the stash', () => {
    expect(warm(32, 9, 15)).toBe(false)
    expect(warm(45, 36, 17)).toBe(false)
  })
})

describe('vendorTab', () => {
  it('sees Purchase when the left tab above the grid is active', () => {
    expect(vendorTab(image(bar('left')), G)).toBe('purchase')
  })

  it('sees Sell when the right tab is active', () => {
    expect(vendorTab(image(bar('right')), G)).toBe('sell')
  })

  it('sees nothing without the tab bar (stash, loot, inventory)', () => {
    expect(vendorTab(image(() => null), G)).toBeNull()
  })

  it('sees nothing when the whole width above the grid is warm (an item row, not a tab)', () => {
    expect(vendorTab(image((x, y) => (inBar(y) ? TAB : null)), G)).toBeNull()
  })

  it('ignores a warm stripe of a single line', () => {
    expect(vendorTab(image((x, y) => (y === 130 && x < mid ? TAB : null)), G)).toBeNull()
  })

  it('finds the bar right above the grid when there is no header row', () => {
    const g = { ...G, y0: 150 }
    expect(vendorTab(image((x, y) => (y >= 119 && y < 147 && x >= g.x0 + 35 && x < mid ? TAB : null)), g)).toBe('purchase')
  })
})

describe('right half only', () => {
  it('reads the same tab from a crop that starts at x0', () => {
    // o worker lê só a metade direita da tela: o recorte diz onde começa
    const full = image(bar('left'))
    const x0 = W / 2
    const w = W - x0
    const data = new Uint8ClampedArray(w * H * 4)
    for (let y = 0; y < H; y++) data.set(full.data.subarray((y * W + x0) * 4, (y * W + W) * 4), y * w * 4)
    expect(vendorTab({ w, h: H, data, x0 }, G)).toBe('purchase')
  })
})
