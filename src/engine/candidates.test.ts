import { beforeAll, describe, expect, it } from 'vitest'
import { Dataset } from './data/dataset'
import { fits, priors, rank, type Ranking } from './candidates'
import { fixturePath, hasFixtures, readJson } from '../test-utils/fixtures'

const PROFILE = 5 // Northridge/TV Station/Airport Forbidden — o mapa do vídeo
const names = (r: Ranking) => r.candidates.map((c) => c.item.name)
const sum = (xs: Iterable<number>) => [...xs].reduce((a, b) => a + b, 0)

it('fits needs the item standing as the vendor shows it', () => {
  // o vendedor não gira os itens: nas 1122 pegadas do log do app desktop, 86 só cabiam no tamanho do item como está
  // na base e 1 só girado
  expect(fits([1, 2], [1, 2])).toBe(true)
  expect(fits([1, 2], [2, 1])).toBe(false)
  expect(fits([2, 2], [1, 2])).toBe(false)
})

it('zero weights and missing profile do not crash', () => {
  const small = new Dataset({
    profiles: [{ id: 1, label: 'p', groupWeightTotal: 0 }],
    types: [{ id: 7, name: 'Tools' }],
    sounds: [{ id: 3, pickup: 'a', drop: 'b' }],
    items: [{ id: 1, name: 'Wrench', size: [1, 1], soundId: 3, rarity: 1, categoryName: 'Tools' }],
    pools: [
      { id: 1, profile: 1, typeId: 7, price: 10, weight: 5, weightTotal: 0, items: [{ id: 1, weight: 0 }] },
      { id: 2, profile: 1, typeId: 7, price: 10, weight: 5, weightTotal: 4, items: [{ id: 1, weight: 4 }] },
    ],
  })
  expect(names(rank(small, [1], 7, 10, [{ soundId: 3, score: 0.9 }], [1, 1]))).toEqual(['Wrench'])
  expect(rank(small, [99], 7, 10, [{ soundId: 3, score: 0.9 }], [1, 1]).candidates).toEqual([])
})

describe.skipIf(!hasFixtures('merchant.json'))('with the merchant data', () => {
  let ds: Dataset
  const type = (name: string) => ds.typeIds.get(name)!
  beforeAll(() => {
    ds = new Dataset(readJson(fixturePath('merchant.json')))
  })

  it('priors sum to one for a single pool', () => {
    const pool = ds.poolsFor(PROFILE)[0]
    const p = priors(ds, [PROFILE], pool.typeId, pool.price)
    const expected = pool.weight / ds.profiles.get(PROFILE)!.groupWeightTotal
    expect(Math.abs(sum(p.values()) - expected) / expected).toBeLessThan(0.05)
  })

  it('computer parts 2x2 tech small is PSU', () => {
    const r = rank(ds, [PROFILE], type('Computer Parts'), null, [{ soundId: 12, score: 0.97 }], [2, 2])
    expect(names(r)).toEqual(['PSU'])
    expect(r.candidates[0].pct).toBeCloseTo(100, 6)
  })

  it('uncommon collectibles 1x2 clock is desk clock', () => {
    const r = rank(ds, [PROFILE], type('Uncommon Collectibles'), 250000, [{ soundId: 31, score: 0.95 }], [1, 2])
    expect(names(r)).toEqual(['Desk Clock'])
  })

  it('box lying down does not match an item standing up', () => {
    // Titanium Alloy Plate é 2x3: aparecia também nas caixas 3x2 com o mesmo som
    const standing = rank(ds, [PROFILE], null, null, [{ soundId: 6, score: 0.9 }], [2, 3])
    const lying = rank(ds, [PROFILE], null, null, [{ soundId: 6, score: 0.9 }], [3, 2])
    expect(names(standing)).toContain('Titanium Alloy Plate')
    expect(names(lying)).not.toContain('Titanium Alloy Plate')
    expect(lying.sizeRelaxed).toBe(false)
  })

  it('box no item fits in its orientation falls back to any size', () => {
    const r = rank(ds, [PROFILE], type('Uncommon Collectibles'), 250000, [{ soundId: 31, score: 0.95 }], [2, 1])
    expect(names(r)).toEqual(['Desk Clock'])
    expect(r.sizeRelaxed).toBe(true)
  })

  it('ambiguous result lists all and sums 100', () => {
    const r = rank(ds, [PROFILE], type('Computer Parts'), null, [{ soundId: 10, score: 0.9 }], null)
    expect(r.candidates.length).toBeGreaterThanOrEqual(2)
    expect(sum(r.candidates.map((c) => c.pct))).toBeCloseTo(100, 6)
    const pcts = r.candidates.map((c) => c.pct)
    expect(pcts).toEqual([...pcts].sort((a, b) => b - a))
  })

  it('unknown label searches all types', () => {
    expect(names(rank(ds, [PROFILE], null, null, [{ soundId: 31, score: 0.9 }], [1, 2]))).toContain('Desk Clock')
  })

  it('misread price falls back to all prices', () => {
    const r = rank(ds, [PROFILE], type('Uncommon Collectibles'), 123, [{ soundId: 31, score: 0.95 }], [1, 2])
    expect(names(r)).toEqual(['Desk Clock'])
  })

  it('wrong size is relaxed instead of empty', () => {
    const r = rank(ds, [PROFILE], type('Uncommon Collectibles'), 250000, [{ soundId: 31, score: 0.95 }], [3, 2])
    expect(names(r)).toEqual(['Desk Clock'])
    expect(r.sizeRelaxed).toBe(true)
  })

  it('no hits ranks by prior and size', () => {
    const r = rank(ds, [PROFILE], type('Computer Parts'), null, [], [2, 2])
    expect(names(r)).toContain('PSU')
    expect(r.candidates.every((c) => c.item.size[0] === 2 && c.item.size[1] === 2)).toBe(true)
  })

  it('tied sounds weight by score', () => {
    const r = rank(ds, [PROFILE], type('Computer Parts'), null,
      [{ soundId: 12, score: 0.9 }, { soundId: 10, score: 0.88 }], null)
    expect(new Set(r.candidates.map((c) => c.item.soundId))).toEqual(new Set([10, 12]))
  })

  it('impossible combination returns empty', () => {
    expect(rank(ds, [PROFILE], type('Computer Parts'), null, [{ soundId: 31, score: 0.9 }], [1, 2]).candidates).toEqual([])
  })

  it('family ranking keeps items of every profile', () => {
    const family = [1, 2, 3, 7, 8]
    const combos = new Set(ds.pools.filter((p) => family.includes(p.profile)).map((p) => `${p.typeId}|${p.price}`))
    for (const key of combos) {
      const [t, price] = key.split('|').map(Number)
      const union = new Set<number>()
      for (const pid of family) for (const id of priors(ds, [pid], t, price).keys()) union.add(id)
      expect(new Set(priors(ds, family, t, price).keys())).toEqual(union)
    }
  })
})
