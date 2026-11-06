import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Dataset } from '../engine/data/dataset'
import { boxDisplay } from '../view/format'
import { exampleView } from './example'

// a base publicada (public/data), a mesma que o exemplo usa em produção
const view = exampleView(new Dataset(JSON.parse(readFileSync('public/data/merchant.json', 'utf8'))))
const at = (col: number, row: number) => view.boxes.find((b) => b.col === col && b.row === row)!
const names = (col: number, row: number) => at(col, row).candidates.map((c) => c.name)

describe('exampleView', () => {
  it('shows the Antique Teapot and the Deluxe Tea Set as the only possible item, with their picture', () => {
    expect(names(1, 3)).toEqual(['Antique Teapot'])
    expect(names(3, 3)).toEqual(['Deluxe Tea Set'])
    expect(boxDisplay(at(1, 3)).icon).not.toBeNull()
  })
  it('keeps a single Studio Monitor', () => {
    expect(view.boxes.filter((b) => b.candidates[0]?.name === 'Studio Monitor')).toHaveLength(1)
  })
  it('has the Skyhook Synchronized Array Mirror as the most likely item of a 1x2 box, sharing it with a lower rarity', () => {
    const b = at(3, 1)
    expect([b.w, b.h]).toEqual([1, 2])
    expect(b.candidates[0].name).toBe('Skyhook Synchronized Array Mirror')
    expect(boxDisplay(b).edge).not.toBeNull()
  })
})
