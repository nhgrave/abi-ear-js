import { beforeAll, describe, expect, it } from 'vitest'
import { Dataset } from './data/dataset'
import { allProfileIds, profileOptions } from './profiles'
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
