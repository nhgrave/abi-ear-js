import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LABEL_MODELS_URLS, loadLabelModels, mergeLabelModels } from './label-data'

const VALID = { version: 1 as const, textLevel: 110, minScore: 0.5, margin: 0.15, models: [{ label: 'Collectibles', w: 1, mask: 'AAAA' }] }
const PT = { version: 1 as const, textLevel: 110, minScore: 0.5, margin: 0.15, models: [{ label: 'Paper', w: 1, mask: 'BBBB' }] }

/** O arquivo em inglês responde `body`; o em português, 404 (ou `pt`, se dado). */
function fetchReturning(status: number, body: unknown, pt?: { status: number; body: unknown }): typeof fetch {
  const res = (st: number, b: unknown) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status: st })
  return (async (url: string) => (url.endsWith('/pt.json') ? res(pt?.status ?? 404, pt?.body ?? 'not found') : res(status, body))) as unknown as typeof fetch
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

  it('loads the English and the Portuguese models together', async () => {
    expect(LABEL_MODELS_URLS).toEqual(['data/labels/en.json', 'data/labels/pt.json'])
    expect(await loadLabelModels(fetchReturning(200, VALID, { status: 200, body: PT }))).toEqual({ ...VALID, models: [...VALID.models, ...PT.models] })
  })

  it('reads with the Portuguese models alone when the English file fails', async () => {
    expect(await loadLabelModels(fetchReturning(404, 'x', { status: 200, body: PT }))).toEqual(PT)
  })

  it('accepts the shipped public/data/labels/pt.json', async () => {
    const shipped = readFileSync(new URL('../../public/data/labels/pt.json', import.meta.url), 'utf8')
    const models = await loadLabelModels(fetchReturning(404, 'x', { status: 200, body: shipped }))
    expect(models?.models.length).toBeGreaterThan(0)
  })

  it('returns null when the fields are missing or of the wrong type', async () => {
    expect(await loadLabelModels(fetchReturning(200, { version: 1 }))).toBeNull()
    expect(await loadLabelModels(fetchReturning(200, { ...VALID, models: 'x' }))).toBeNull()
    expect(await loadLabelModels(fetchReturning(200, { ...VALID, models: [{ label: 'A', w: '1', mask: 'x' }] }))).toBeNull()
    expect(await loadLabelModels(fetchReturning(200, { ...VALID, minScore: null }))).toBeNull()
  })
})

describe('mergeLabelModels', () => {
  it('keeps the thresholds of the first file and all the models', () => {
    expect(mergeLabelModels([VALID, PT])).toEqual({ ...VALID, models: [...VALID.models, ...PT.models] })
  })
  it('keeps the minimum score of each file on its own models', () => {
    expect(mergeLabelModels([VALID, { ...PT, minScore: 0.9 }])!.models).toEqual([...VALID.models, { ...PT.models[0], minScore: 0.9 }])
  })
  it('leaves out a file made with another text level, whose masks would not compare', () => {
    expect(mergeLabelModels([VALID, { ...PT, textLevel: 90 }])).toEqual(VALID)
  })
  it('is null with no files', () => {
    expect(mergeLabelModels([])).toBeNull()
  })
})
