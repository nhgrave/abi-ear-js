import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error script em JS puro, sem tipos
import { parseDataset, validate } from './sync-assets.mjs'
import { fixturePath, hasFixtures } from '../src/test-utils/fixtures'

describe.skipIf(!hasFixtures('merchant.html'))('sync-assets', () => {
  it('parses the merchant payload from the saved page', () => {
    const ds = parseDataset(readFileSync(fixturePath('merchant.html'), 'utf8'))
    expect(ds.items.length).toBe(189)
    expect(ds.profiles.length).toBe(10)
    expect(ds.sounds.length).toBe(38)
  })
})

it('rejects a sound name with a path', () => {
  const ds = { items: [], pools: [], types: [], profiles: [], sounds: [{ id: 1, pickup: '../x', drop: 'y' }] }
  expect(() => validate(ds)).toThrow()
})
