import { describe, expect, it } from 'vitest'
import { boxDisplay, RARITY_COLORS } from './format'
import type { BoxView } from '../engine/view'

const box = (over: Partial<BoxView>): BoxView => ({ uid: 1, col: 0, row: 0, w: 2, h: 1, clipped: false, label: null, picks: 0, candidates: [], sizeRelaxed: false, ...over })
const cand = (name: string, pct: number, rarity = 5) => ({ itemId: 1, name, pct, rarity, icon: `data/icons/${name}.png` })

describe('boxDisplay', () => {
  it('shows the category of a box not yet picked, with no rarity color', () => {
    // o tamanho já está no desenho do grid; a categoria diz mais
    expect(boxDisplay(box({ label: 'Mystery Cargo' }))).toEqual({ text: 'Mystery Cargo', pct: null, count: 0, color: null, icon: null, hint: true })
  })
  it('leaves a box not yet picked and without a category blank', () => {
    expect(boxDisplay(box({}))).toEqual({ text: '', pct: null, count: 0, color: null, icon: null, hint: true })
  })
  it('paints the rarity of the most likely item', () => {
    const d = boxDisplay(box({ picks: 1, candidates: [cand('A', 60, 6), cand('B', 40, 3)] }))
    expect(d.color).toBe(RARITY_COLORS[6])
    expect(d.count).toBe(2)
    expect(d.icon).toBeNull()
  })
  it('shows the icon when the item is certain', () => {
    expect(boxDisplay(box({ picks: 1, candidates: [cand('PSU', 100, 4)] })).icon).toBe('data/icons/PSU.png')
    expect(boxDisplay(box({ picks: 1, candidates: [cand('PSU', 99.6), cand('X', 0.4)] })).icon).toBe('data/icons/PSU.png')
  })
  it('shows name and percentage at 99%', () => {
    expect(boxDisplay(box({ picks: 1, candidates: [cand('Gold Cube', 99.2, 6), cand('Y', 0.8)] }))).toEqual({ text: 'Gold Cube', pct: 99, count: 2, color: RARITY_COLORS[6], icon: null, hint: false })
  })
  it('shows ? when a picked box has no candidates', () => {
    expect(boxDisplay(box({ picks: 1 }))).toEqual({ text: '?', pct: null, count: 0, color: null, icon: null, hint: false })
  })
  it('has no green rarity color for the rarities in the base', () => {
    expect(Object.keys(RARITY_COLORS).map(Number)).toEqual([1, 3, 4, 5, 6])
  })
})
