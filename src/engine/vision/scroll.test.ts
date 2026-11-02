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
