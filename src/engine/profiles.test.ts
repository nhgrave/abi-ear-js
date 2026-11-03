import { beforeAll, describe, expect, it } from 'vitest'
import { Dataset } from './data/dataset'
import { allProfileIds, parseProfileChoice, profileChoiceValue, profileOptions, profilesForLabels, type ProfileChoice } from './profiles'
import { fixturePath, hasFixtures, readJson } from '../test-utils/fixtures'

describe.skipIf(!hasFixtures('merchant.json'))('profiles', () => {
  let ds: Dataset
  beforeAll(() => {
    ds = new Dataset(readJson(fixturePath('merchant.json')))
  })

  it('profileOptions has one entry per map and mode and none for unknown profiles', () => {
    const opts = profileOptions(ds)
    expect(opts).toContainEqual({ profileId: 4, label: 'Airport Lockdown' })
    expect(opts.some((o) => o.label.startsWith('Unknown'))).toBe(false)
    expect(opts.map((o) => o.label)).toEqual([...opts.map((o) => o.label)].sort())
    expect(new Set(opts.map((o) => o.label)).size).toBe(opts.length)
  })

  it('allProfileIds lists the 10 profiles', () => {
    expect(allProfileIds(ds)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})

describe.skipIf(!hasFixtures('merchant.json'))('profilesForLabels', () => {
  let ds: Dataset
  beforeAll(() => {
    ds = new Dataset(readJson(fixturePath('merchant.json')))
  })

  // porte de test_candidates.py::test_labels_tell_the_map_family (o fixture é o mesmo merchant.json)
  it('labels_tell_the_map_family', () => {
    expect(profilesForLabels(ds, [])).toEqual(allProfileIds(ds))
    expect(profilesForLabels(ds, ['Mystery Cargo'])).toEqual(allProfileIds(ds))
    expect(profilesForLabels(ds, ['Mystery Cargo', 'Paper'])).toEqual([1, 2, 3, 7, 8])
    expect(profilesForLabels(ds, ['Computer Parts', 'Uncommon Mystery Cargo'])).toEqual([4, 5, 6, 9, 10])
    expect(profilesForLabels(ds, ['Paper', 'Tools', 'Computer Parts'])).toEqual([1, 2, 3, 7, 8])
  })
})

describe('profilesForLabels without fixtures', () => {
  const tiny = new Dataset({
    items: [],
    types: [{ id: 1, name: 'Paper' }, { id: 2, name: 'Tools' }],
    pools: [
      { id: 1, profile: 1, typeId: 1, price: 0, weight: 1, weightTotal: 1, items: [] },
      { id: 2, profile: 2, typeId: 2, price: 0, weight: 1, weightTotal: 1, items: [] },
    ],
    sounds: [],
    profiles: [{ id: 1, label: 'a', groupWeightTotal: 1 }, { id: 2, label: 'b', groupWeightTotal: 1 }],
  })

  it('never returns an empty list', () => {
    expect(profilesForLabels(tiny, [])).toEqual([1, 2])
    expect(profilesForLabels(tiny, ['Rare Collectibles'])).toEqual([1, 2])
    expect(profilesForLabels(tiny, ['Tools'])).toEqual([2])
  })
})

describe.skipIf(!hasFixtures('merchant.json'))('profile choice', () => {
  let ds: Dataset
  beforeAll(() => {
    ds = new Dataset(readJson(fixturePath('merchant.json')))
  })

  it('saved_profile_choice_from_v0_1_is_kept', () => {
    expect(parseProfileChoice('all', ds)).toBe('all')
    expect(parseProfileChoice('5', ds)).toBe(5)
    expect(parseProfileChoice(null, ds)).toBe('auto')
    expect(parseProfileChoice('auto', ds)).toBe('auto')
    expect(parseProfileChoice('999', ds)).toBe('auto') // perfil que a base não tem mais
    expect(parseProfileChoice('xyz', ds)).toBe('auto')
  })

  it('profile_choice_round_trips', () => {
    for (const c of ['auto', 'all', 5] as ProfileChoice[]) expect(parseProfileChoice(profileChoiceValue(c), ds)).toBe(c)
  })
})
