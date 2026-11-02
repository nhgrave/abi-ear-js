import { describe, expect, it } from 'vitest'
import { messages } from './i18n'

describe('app', () => {
  it('declares the app title in both languages', () => {
    expect(messages.pt.title).toBe('abi-ear')
    expect(messages.en.title).toBe('abi-ear')
  })
})
