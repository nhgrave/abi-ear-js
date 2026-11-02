import { describe, expect, it } from 'vitest'
import { attribute, CursorHistory } from './attribution'

const boxAt = (x: number, y: number) => (x < 100 ? { uid: 1 } : x < 200 && y < 100 ? { uid: 2 } : null)
const S = (t: number, x: number, score = 0.95) => ({ t, x, y: 10, score })

describe('attribute', () => {
  it('pickup with one steady sample in the window is assigned', () => {
    const h = new CursorHistory()
    h.add(S(700, 150))
    expect(attribute(h, 1000, boxAt)).toEqual({ kind: 'box', uid: 2 })
  })
  it('pickup while cursor moves between boxes is not assigned', () => {
    const h = new CursorHistory()
    h.add(S(620, 50))
    h.add(S(700, 150))
    expect(attribute(h, 1000, boxAt)).toEqual({ kind: 'none', reason: 'moving' })
  })
  it('pickup with low arrow score is not assigned', () => {
    const h = new CursorHistory()
    h.add(S(700, 150, 0.5))
    expect(attribute(h, 1000, boxAt)).toEqual({ kind: 'none', reason: 'no-cursor' })
  })
  it('pickup with a missing sample is not assigned', () => {
    const h = new CursorHistory()
    h.add({ t: 700, missing: true })
    expect(attribute(h, 1000, boxAt)).toEqual({ kind: 'none', reason: 'no-cursor' })
  })
  it('pickup with the cursor outside any box is not assigned', () => {
    const h = new CursorHistory()
    h.add(S(700, 300))
    expect(attribute(h, 1000, boxAt)).toEqual({ kind: 'none', reason: 'no-box' })
  })
  it('pickup with no sample in the window is not assigned', () => {
    const h = new CursorHistory()
    h.add(S(500, 150))
    h.add(S(900, 150))
    expect(attribute(h, 1000, boxAt)).toEqual({ kind: 'none', reason: 'no-frame' })
  })
  it('samples outside 150-400 ms before the sound are ignored', () => {
    const h = new CursorHistory()
    h.add(S(700, 150))
    h.add(S(900, 50)) // 100 ms antes, sobre outra caixa
    expect(attribute(h, 1000, boxAt)).toEqual({ kind: 'box', uid: 2 })
  })
  it('keeps only the last 3 s', () => {
    const h = new CursorHistory()
    h.add(S(0, 50))
    h.add(S(3500, 50))
    expect(h.between(0, 4000).map((s) => s.t)).toEqual([3500])
  })
})
