import { expect, it } from 'vitest'
import { estimateRowShift } from './scroll'
import type { BoxRect } from './types'
import { hasFixtures } from '../../test-utils/fixtures'
import { goldenScan } from '../golden-scan'

const b = (col: number, row: number, w: number, h: number, clipped = false): BoxRect => ({ col, row, w, h, clipped })
const LAYOUT = [b(0, 0, 2, 2), b(2, 0, 1, 2), b(3, 1, 3, 2), b(0, 3, 1, 1), b(6, 2, 2, 3)]
const shifted = (boxes: BoxRect[], k: number) => boxes.map((x) => ({ ...x, row: x.row + k }))

it('no scroll is zero', () => {
  expect(estimateRowShift(LAYOUT, LAYOUT)).toBe(0)
})

it('detects shift in both directions', () => {
  expect(estimateRowShift(LAYOUT, shifted(LAYOUT, 3))).toBe(3)
  expect(estimateRowShift(LAYOUT, shifted(LAYOUT, -2))).toBe(-2)
})

it('partial overlap is still found', () => {
  const curr = [...shifted(LAYOUT, -2).slice(2), b(1, 5, 2, 1)] // duas caixas saíram, uma entrou
  expect(estimateRowShift(LAYOUT, curr)).toBe(-2)
})

it('clipped boxes are ignored and an unrelated layout is null', () => {
  expect(estimateRowShift([b(0, 0, 1, 1, true)], LAYOUT)).toBeNull()
  expect(estimateRowShift(LAYOUT, [b(8, 8, 1, 1), b(7, 9, 1, 1)])).toBeNull()
  expect(estimateRowShift([], LAYOUT)).toBeNull()
})

it.skipIf(!hasFixtures('frames', 'frame_12_5.json'))('real frames scrolled five rows', () => {
  expect(estimateRowShift(goldenScan('frame_12_5').boxes, goldenScan('frame_22_5').boxes)).toBe(5)
})

it('two shifts explaining the same number of boxes is ambiguous', () => {
  // gravação 155614, 18:56:40: duas leituras parciais (arrasto); 1 e 3 linhas explicam 5 caixas cada
  const parse = (s: string) => s.split(' ').map((t) => { const [c, r, wh] = t.split(','); const [w, h] = wh.split('x').map(Number); return b(Number(c), Number(r), w, h) })
  const prev = parse('0,0,1x1 1,0,1x1 2,0,1x1 3,0,1x1 4,0,1x1 5,0,1x1 6,0,1x1 7,0,1x1 8,0,1x1 0,1,2x1 2,1,2x1 4,1,1x2 5,1,1x2 6,1,2x1 0,2,2x2 2,2,2x2 6,2,2x2 4,3,2x2 0,4,2x2 2,4,2x2 0,6,2x2 2,6,2x3')
  const curr = parse('4,0,2x2 0,1,2x2 2,1,2x2 6,1,2x2 4,2,2x2 0,3,2x2 2,3,2x3 6,3,3x2')
  expect(estimateRowShift(prev, curr)).toBeNull()
})
