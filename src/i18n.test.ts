import { expect, it } from 'vitest'
import { messages, t } from './i18n'

it('every message key exists in both languages', () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.pt).sort())
  for (const lang of ['pt', 'en'] as const) for (const v of Object.values(messages[lang])) expect(v.trim().length).toBeGreaterThan(0)
})

it('t fills placeholders', () => {
  expect(t('pickup.unassigned', 'pt', { sound: 'X', score: '0.91', reason: t('reason.moving', 'pt') })).toContain('X')
})
