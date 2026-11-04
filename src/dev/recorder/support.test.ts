import { describe, expect, it } from 'vitest'
import { isChrome, supportProblem } from './support'

const ok = { chrome: true, secure: true, picker: true, processor: true }

describe('isChrome', () => {
  it('accepts Google Chrome', () => {
    expect(isChrome([{ brand: 'Not)A;Brand' }, { brand: 'Chromium' }, { brand: 'Google Chrome' }])).toBe(true)
  })

  it('rejects Brave, which reports the same user agent as Chrome', () => {
    expect(isChrome([{ brand: 'Not)A;Brand' }, { brand: 'Chromium' }, { brand: 'Brave' }])).toBe(false)
  })

  it('rejects Edge', () => {
    expect(isChrome([{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }])).toBe(false)
  })

  it('rejects a browser without client hints (Firefox, Safari)', () => {
    expect(isChrome(undefined)).toBe(false)
  })
})

describe('supportProblem', () => {
  it('is null when everything is there', () => {
    expect(supportProblem(ok)).toBeNull()
  })

  it('asks for Chrome first', () => {
    expect(supportProblem({ chrome: false, secure: false, picker: false, processor: false })).toMatch(/Google Chrome/)
  })

  it('names the insecure address in Chrome, since it also hides the folder picker', () => {
    expect(supportProblem({ ...ok, secure: false, picker: false })).toMatch(/localhost:5173/)
  })

  it('names the missing folder picker in a secure page', () => {
    expect(supportProblem({ ...ok, picker: false })).toMatch(/File System Access/)
  })

  it('names the missing track processor', () => {
    expect(supportProblem({ ...ok, processor: false })).toMatch(/MediaStreamTrackProcessor/)
  })
})
