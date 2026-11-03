import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadLabelModels } from './label-data'

const VALID = { version: 1, textLevel: 110, minScore: 0.5, margin: 0.15, models: [{ label: 'Collectibles', w: 1, mask: 'AAAA' }] }

function fetchReturning(status: number, body: unknown): typeof fetch {
  return (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as typeof fetch
}

describe('loadLabelModels', () => {
  it('returns the models from a valid file', async () => {
    expect(await loadLabelModels(fetchReturning(200, VALID))).toEqual(VALID)
  })

  it('accepts the shipped public/data/labels/en.json', async () => {
    const shipped = readFileSync(new URL('../../public/data/labels/en.json', import.meta.url), 'utf8')
    const models = await loadLabelModels(fetchReturning(200, shipped))
    expect(models?.models.length).toBeGreaterThan(0)
  })

  it('returns null on an HTTP error', async () => {
    expect(await loadLabelModels(fetchReturning(404, 'not found'))).toBeNull()
  })

  it('returns null when the request fails', async () => {
    const failing = (async () => {
      throw new TypeError('network')
    }) as typeof fetch
    expect(await loadLabelModels(failing)).toBeNull()
  })

  it('returns null on invalid JSON', async () => {
    expect(await loadLabelModels(fetchReturning(200, '{oops'))).toBeNull()
  })

  it('returns null for a version it does not know', async () => {
    expect(await loadLabelModels(fetchReturning(200, { ...VALID, version: 2 }))).toBeNull()
  })

  it('returns null when the fields are missing or of the wrong type', async () => {
    expect(await loadLabelModels(fetchReturning(200, { version: 1 }))).toBeNull()
    expect(await loadLabelModels(fetchReturning(200, { ...VALID, models: 'x' }))).toBeNull()
    expect(await loadLabelModels(fetchReturning(200, { ...VALID, models: [{ label: 'A', w: '1', mask: 'x' }] }))).toBeNull()
    expect(await loadLabelModels(fetchReturning(200, { ...VALID, minScore: null }))).toBeNull()
  })
})
