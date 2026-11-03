import { describe, expect, it } from 'vitest'
import { normalizeLabel, sequenceRatio, type LabelTable } from './labels'

// abi_ear/labels/en.json: texto exibido no jogo -> nome do tipo na base
const NAMES = [
  'Flammables', 'Building Materials', 'Computer Parts', 'Energy Items', 'Tools', 'Household Items', 'Medical Supplies',
  'Rare Medical Supplies', 'Collectibles', 'Uncommon Collectibles', 'Rare Collectibles', 'Paper', 'Instruments',
  'Military Items', 'Uncommon Military Items', 'Electronics', 'Mystery Cargo', 'Uncommon Mystery Cargo', 'Rare Mystery Cargo',
]
const LABELS: LabelTable = new Map(NAMES.map((n) => [n, n]))

describe('normalizeLabel', () => {
  it('normalize_label_handles_wraps_and_typos', () => {
    expect(normalizeLabel('Uncommo n Mystery Cargo', LABELS)).toBe('Uncommon Mystery Cargo')
    expect(normalizeLabel('Collectible s', LABELS)).toBe('Collectibles')
    expect(normalizeLabel('Computer Parls', LABELS)).toBe('Computer Parts')
    expect(normalizeLabel('Uncommon Collectibles', LABELS)).toBe('Uncommon Collectibles')
    expect(normalizeLabel('xyz', LABELS)).toBeNull()
    expect(normalizeLabel('', LABELS)).toBeNull()
  })

  it('normalize_label_matches_python_difflib', () => {
    expect(normalizeLabel('Uncommo n Mystery', LABELS)).toBe('Uncommon Mystery Cargo')
    expect(normalizeLabel('Mystery Carg', LABELS)).toBe('Mystery Cargo')
    expect(normalizeLabel('Rare Mystery Carg0', LABELS)).toBe('Rare Mystery Cargo')
    expect(normalizeLabel('Energy ltems', LABELS)).toBe('Energy Items')
    expect(normalizeLabel('Medical', LABELS)).toBeNull()
    expect(normalizeLabel('Pape r', LABELS)).toBe('Paper')
  })

  it('sequence_ratio_matches_python', () => {
    expect(sequenceRatio('computerparls', 'computerparts')).toBeCloseTo(0.923077, 6)
    expect(sequenceRatio('uncommonmystery', 'uncommonmysterycargo')).toBeCloseTo(0.857143, 6)
    expect(sequenceRatio('mysterycargo', 'raremysterycargo')).toBeCloseTo(0.857143, 6)
    expect(sequenceRatio('abcd', 'bcda')).toBeCloseTo(0.75, 6)
    expect(sequenceRatio('energyltems', 'energyitems')).toBeCloseTo(0.909091, 6)
  })
})
