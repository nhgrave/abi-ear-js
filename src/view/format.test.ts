import { describe, expect, it } from 'vitest'
import { boxDisplay, RARITY_COLORS } from './format'
import type { BoxView } from '../engine/view'

const box = (over: Partial<BoxView>): BoxView => ({ uid: 1, col: 0, row: 0, w: 2, h: 1, clipped: false, label: null, picks: 0, candidates: [], sizeRelaxed: false, revealed: false, ...over })
const cand = (name: string, pct: number, rarity = 5) => ({ itemId: 1, name, pct, rarity, icon: `data/icons/${name}.png` })

describe('boxDisplay', () => {
  it('shows the category of a box not yet picked, with no rarity color', () => {
    // o tamanho já está no desenho do grid; a categoria diz mais
    expect(boxDisplay(box({ label: 'Mystery Cargo' }))).toEqual({ text: 'Mystery Cargo', pct: null, count: 0, color: null, edge: null, icon: null, hint: true })
  })
  it('leaves a box not yet picked and without a category blank', () => {
    expect(boxDisplay(box({}))).toEqual({ text: '', pct: null, count: 0, color: null, edge: null, icon: null, hint: true })
  })
  it('paints the rarity of the most likely item', () => {
    const d = boxDisplay(box({ picks: 1, candidates: [cand('A', 60, 6), cand('B', 40, 3)] }))
    expect(d.color).toBe(RARITY_COLORS[6])
    expect(d.count).toBe(2)
    expect(d.icon).toBeNull()
  })
  it('shows the icon only when a single item is left', () => {
    expect(boxDisplay(box({ picks: 1, candidates: [cand('PSU', 100, 4)] })).icon).toBe('data/icons/PSU.png')
  })
  it('shows name and percentage, not the icon, while another item is possible, however unlikely', () => {
    // um item raro com o mesmo som e tamanho não pode sumir atrás da imagem do comum
    expect(boxDisplay(box({ picks: 1, candidates: [cand('Car Battery', 99.95, 5), cand('Tablet', 0.05, 6)] }))).toEqual({
      text: 'Car Battery', pct: 99, count: 2, color: RARITY_COLORS[5], edge: { high: RARITY_COLORS[6], low: RARITY_COLORS[5] }, icon: null, hint: false,
    })
  })
  it('never shows 100% while another item is possible', () => {
    expect(boxDisplay(box({ picks: 1, candidates: [cand('A', 99.95), cand('B', 0.05)] })).pct).toBe(99)
    expect(boxDisplay(box({ picks: 1, candidates: [cand('A', 100)] })).pct).toBe(100)
  })
  it('splits the border between the highest and the lowest rarity among the candidates', () => {
    const d = boxDisplay(box({ picks: 1, candidates: [cand('Gungnir', 49, 5), cand('Metal Heart', 49, 5), cand('EEG', 0.6, 6), cand('Toolkit', 0.4, 4)] }))
    expect(d.edge).toEqual({ high: RARITY_COLORS[6], low: RARITY_COLORS[4] })
  })
  it('keeps a plain border when all candidates share one rarity', () => {
    expect(boxDisplay(box({ picks: 1, candidates: [cand('UPS', 50, 5), cand('Vector', 50, 5)] })).edge).toBeNull()
    expect(boxDisplay(box({ picks: 1, candidates: [cand('PSU', 100, 4)] })).edge).toBeNull()
  })
  it('shows the revealed item with its picture before any pickup', () => {
    // o jogo revelou a caixa (imagem do item dentro dela): o item aparece já, sem precisar pegar
    expect(boxDisplay(box({ label: 'Tools', revealed: true, candidates: [cand('Portable Jack', 100, 4)] }))).toMatchObject({
      text: 'Portable Jack', pct: 100, icon: 'data/icons/Portable Jack.png', color: RARITY_COLORS[4], hint: false,
    })
  })
  it('shows ? when a picked box has no candidates', () => {
    expect(boxDisplay(box({ picks: 1 }))).toEqual({ text: '?', pct: null, count: 0, color: null, edge: null, icon: null, hint: false })
  })
  it('has no green rarity color for the rarities in the base', () => {
    expect(Object.keys(RARITY_COLORS).map(Number)).toEqual([1, 3, 4, 5, 6])
  })
})
