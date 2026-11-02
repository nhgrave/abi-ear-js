import { describe, expect, it } from 'vitest'
import { boxDisplay } from './format'
import type { BoxView } from '../engine/view'

const box = (over: Partial<BoxView>): BoxView => ({ uid: 1, col: 0, row: 0, w: 2, h: 1, clipped: false, picks: 0, candidates: [], sizeRelaxed: false, ...over })
const cand = (name: string, pct: number) => ({ itemId: 1, name, pct, icon: `data/icons/${name}.png` })

describe('boxDisplay', () => {
  it('shows the size of a box not yet picked', () => {
    expect(boxDisplay(box({}))).toEqual({ text: '2x1', pct: null, tone: 'idle', icon: null })
  })
  it('shows the icon when the top candidate rounds to 100%', () => {
    expect(boxDisplay(box({ picks: 1, candidates: [cand('PSU', 99.6), cand('X', 0.4)] })).icon).toBe('data/icons/PSU.png')
    expect(boxDisplay(box({ picks: 1, candidates: [cand('PSU', 100)] })).tone).toBe('sure')
  })
  it('shows name and percentage at 99%', () => {
    expect(boxDisplay(box({ picks: 1, candidates: [cand('Gold Cube', 99.2), cand('Y', 0.8)] }))).toEqual({ text: 'Gold Cube', pct: 99, tone: 'sure', icon: null })
  })
  it('is in doubt below 80%', () => {
    expect(boxDisplay(box({ picks: 1, candidates: [cand('A', 60), cand('B', 40)] })).tone).toBe('doubt')
  })
  it('shows ? when a picked box has no candidates', () => {
    expect(boxDisplay(box({ picks: 1 }))).toEqual({ text: '?', pct: null, tone: 'doubt', icon: null })
  })
})
