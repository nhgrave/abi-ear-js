import { describe, expect, it } from 'vitest'
import { createIconLookup } from './icons'
import { SIG_CELL, type IconSource } from '../engine/vision/revealed'

const ICON: IconSource = { w: 2, h: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]) }
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('icon lookup', () => {
  it('returns null while the icon loads, then the icon at the comparison scale', async () => {
    const asked: number[] = []
    const lookup = createIconLookup(async (id) => (asked.push(id), ICON))
    expect(lookup(7, 2, 1)).toBeNull()
    await flush()
    const img = lookup(7, 2, 1)!
    expect([img.w, img.h]).toEqual([2 * SIG_CELL, SIG_CELL])
    expect(lookup(7, 2, 1)).toBe(img) // guardado
    expect(asked).toEqual([7]) // baixado uma vez só
  })

  it('gives an empty icon when the file fails, so the other candidates can still decide', async () => {
    const lookup = createIconLookup(async () => null)
    lookup(9, 1, 1)
    await flush()
    const img = lookup(9, 1, 1)!
    expect(img.rgba.every((v) => v === 0)).toBe(true)
  })
})
