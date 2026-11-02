/** Estoque reorganizado depois de uma compra (de qualquer jogador): a lista é reempacotada.
 * Sem preço na v0.1: as caixas são marcadas pelo `picks` (que `takeDataFrom` também copia). */
import { describe, expect, it } from 'vitest'
import { align } from './reflow'
import { TrackedBox, VendorSession } from './session'
import { goldenScan } from './golden-scan'
import { cellKey, type BoxRect, type GridScan } from './vision/types'
import { hasFixtures } from '../test-utils/fixtures'

const U = 'Uncommon Mystery Cargo'
const MC = 'Mystery Cargo'
const E = 'Energy Items'
const P = 'Paper'
const F = 'Flammables'
const H = 'Household Items'

type Box = { col: number; row: number; label: string | null; h: number }
const rowOf = (labels: string[], row = 0): Box[] => labels.map((label, col) => ({ col, row, label, h: 1 }))
const column = (labels: string[], rows: number[]): Box[] => labels.map((label, i) => ({ col: 0, row: rows[i], label, h: 1 }))

// ----- alinhamento de uma sequência de mesmo tamanho

describe('align', () => {
  it('unchanged sequence maps to itself', () => {
    expect(align(rowOf([U, MC, E]), rowOf([U, MC, E]), 0, 10, false)).toEqual([0, 1, 2])
  })

  it('boxes after the bought one move back', () => {
    expect(align(rowOf([U, E, MC, P]), rowOf([U, MC, P]), 0, 10, false)).toEqual([0, 2, 3])
  })

  it('twin of the bought box has no known origin', () => {
    // duas Mystery Cargo seguidas, uma foi comprada: a que ficou pode ser qualquer uma das duas
    expect(align(rowOf([U, MC, MC, E, E]), rowOf([U, MC, E, E]), 0, 10, false)).toEqual([0, null, 3, 4])
  })

  it('box entering from below has no origin', () => {
    expect(align(column([MC, P], [0, 4]), column([P, E], [0, 9]), 0, 10, false)).toEqual([1, null])
  })

  it('scrolled view cannot tell identical boxes apart', () => {
    // vista rolada: a primeira pode ter saído por cima, as outras subido, e uma entrado por baixo
    const old = column([MC, MC, MC], [5, 9, 14])
    expect(align(old, column([MC, MC, MC], [5, 9, 14]), 5, 15, true)).toEqual([null, null, null])
  })

  it('scrolled view with distinct labels still aligns', () => {
    const old = column([MC, P, E], [5, 9, 12])
    expect(align(old, column([P, E, F], [5, 9, 14]), 5, 15, true)).toEqual([1, 2, null])
  })

  it('unchanged view in the middle of the stock is not ambiguous', () => {
    const old = column([MC, MC, MC], [5, 9, 11])
    expect(align(old, column([MC, MC, MC], [5, 9, 11]), 5, 15, true)).toEqual([0, 1, 2])
  })
})

// ----- quadros reais: "MeuHomii spent 40,000 Koen on a mystery cargo" (e o aviso desceu o painel 37 px)

const labelMap = (entries: [number, number, string][]) => new Map(entries.map(([c, r, l]) => [cellKey(c, r), l]))
const BEFORE = labelMap([
  [0, 0, U], [1, 0, MC], [2, 0, MC], [3, 0, E], [4, 0, E], [5, 0, MC], [7, 0, MC], [8, 0, MC],
  [0, 1, P], [1, 1, P], [2, 1, P], [3, 1, MC], [4, 1, MC], [5, 1, MC],
  [6, 2, F], [0, 3, H], [2, 3, F], [4, 3, F], [6, 4, F], [0, 5, F],
  [2, 5, U], [5, 6, U], [7, 6, MC], [0, 7, MC], [3, 7, MC],
])
const AFTER = labelMap([
  [0, 0, U], [1, 0, MC], [2, 0, E], [3, 0, E], [4, 0, MC], [6, 0, MC], [7, 0, MC], [8, 0, P],
  [0, 1, P], [1, 1, P], [2, 1, MC], [3, 1, MC], [4, 1, MC],
  [5, 2, F], [7, 2, H], [0, 3, F], [2, 3, F], [4, 4, F], [6, 4, F],
  [0, 5, U], [3, 6, U], [5, 6, MC], [7, 6, MC], [0, 7, MC],
])

function boughtAndRepacked(): VendorSession {
  const s = new VendorSession()
  s.applyScan(goldenScan('reflow_before'), BEFORE, 0)
  for (const [key, box] of s.boxes) {
    const [c, r] = key.split(',').map(Number)
    box.picks = 1000 * (c + 10 * r) + 7 // marca cada caixa pela posição de antes
  }
  const after = goldenScan('reflow_after')
  for (let i = 1; i < 5; i++) s.applyScan(after, AFTER, 500 * i)
  return s
}

/** "col,row" de antes da compra. */
const origin = (box: TrackedBox) => (box.picks === 0 ? null : `${(Math.floor((box.picks - 7) / 1000)) % 10},${Math.floor((box.picks - 7) / 10000)}`)

describe.skipIf(!hasFixtures('frames', 'reflow_before.json'))('real frames', () => {
  it('results follow the boxes after a purchase', () => {
    const s = boughtAndRepacked()
    const found = new Map([...s.boxes].map(([k, b]) => [k, [b.w, b.h, b.label, origin(b)]]))
    const expected: Record<string, [number, number, string, string]> = {
      '0,0': [1, 1, U, '0,0'], // antes da caixa comprada: não mudou
      '2,0': [1, 1, E, '3,0'],
      '3,0': [1, 1, E, '4,0'],
      '4,0': [2, 1, MC, '5,0'],
      '8,0': [1, 2, P, '0,1'],
      '0,1': [1, 2, P, '1,1'],
      '4,1': [1, 2, MC, '5,1'],
      '5,2': [2, 2, F, '6,2'],
      '7,2': [2, 2, H, '0,3'],
      '0,5': [3, 2, U, '2,5'],
      '3,6': [2, 3, U, '5,6'],
      '0,7': [3, 2, MC, '0,7'],
    }
    for (const [key, value] of Object.entries(expected)) expect(found.get(key), key).toEqual(value)
  })

  it('twin of the bought box loses its result', () => {
    // (1, 0) e (2, 0) eram duas Mystery Cargo 1x1; uma foi comprada e não há como saber qual
    const s = boughtAndRepacked()
    expect(s.boxes.get('1,0')!.label).toBe(MC)
    expect(s.boxes.get('1,0')!.picks).toBe(0)
  })

  it('box seen with a tooltip waits for a clean scan', () => {
    const s = new VendorSession()
    s.applyScan(goldenScan('reflow_before'), BEFORE, 0)
    s.boxes.get('3,0')!.picks = 123
    for (let i = 1; i < 5; i++) s.applyScan(goldenScan('live_tooltip_right'), AFTER, 500 * i) // mesmo estoque, com tooltip
    expect(s.boxes.get('3,0')!.picks).toBe(123)
    expect(s.boxes.get('3,0')!.label).toBe(E) // nada refeito ainda
  })
})

// ----- caixas fora da vista

const GEOM = { x0: 0, y0: 0, pitch: 64, cols: 6, rows: 4 }
const grid = (...boxes: [number, number, number, number][]): GridScan => ({
  geometry: GEOM,
  boxes: boxes.map(([col, row, w, h]): BoxRect => ({ col, row, w, h, clipped: false })),
  uncertain: new Set(),
  overlays: [],
})

describe('boxes out of view', () => {
  it('box out of view is kept but marked when the stock moves', () => {
    const s = new VendorSession()
    s.applyScan(grid([0, 0, 1, 1], [1, 0, 2, 1], [3, 0, 1, 1]), new Map(), 0)
    const far = new TrackedBox(0, 20, 2, 2, false, { label: F, picks: 5 })
    s.boxes.set(far.key, far) // vista antes, rolando lá embaixo
    const repacked = grid([0, 0, 2, 1], [2, 0, 1, 1], [3, 0, 2, 1])
    s.applyScan(repacked, new Map(), 500)
    s.applyScan(repacked, new Map(), 1000)
    expect(s.boxes.get('0,20')!.stale).toBe(true)
    expect(s.boxes.get('0,20')!.picks).toBe(5)
    expect([...s.boxes].filter(([k, b]) => k !== '0,20' && b.stale)).toEqual([])
  })

  it('marked box seen again in the same place is confirmed', () => {
    const s = new VendorSession()
    s.applyScan(grid([0, 0, 2, 2], [2, 0, 1, 1]), new Map(), 0)
    s.boxes.get('0,0')!.stale = true
    s.boxes.get('0,0')!.picks = 5
    s.applyScan(grid([0, 0, 2, 2], [2, 0, 1, 1]), labelMap([[0, 0, F]]), 500)
    expect(s.boxes.get('0,0')!.stale).toBe(false)
    expect(s.boxes.get('0,0')!.picks).toBe(5)
  })

  it('marked box with another label in its place is dropped', () => {
    const s = new VendorSession()
    s.applyScan(grid([0, 0, 2, 2], [2, 0, 1, 1]), labelMap([[0, 0, F]]), 0)
    s.boxes.get('0,0')!.stale = true
    s.boxes.get('0,0')!.picks = 5
    s.applyScan(grid([0, 0, 2, 2], [2, 0, 1, 1]), labelMap([[0, 0, H]]), 500)
    expect(s.boxes.get('0,0')!.label).toBe(H)
    expect(s.boxes.get('0,0')!.picks).toBe(0)
  })
})
