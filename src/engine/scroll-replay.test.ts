/** Rolagem real gravada no vendedor (scans golden dos recortes 630x750 da tela 1080p). */
import { describe, expect, it } from 'vitest'
import { VendorSession } from './session'
import { goldenScan } from './golden-scan'
import { hasFixtures } from '../test-utils/fixtures'

const frame = (i: number) => goldenScan(`scroll_${i}`)

function layout(s: VendorSession) {
  return [...s.boxes.values()]
    .filter((b) => !b.clipped)
    .map((b) => [b.col, b.row, b.w, b.h])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3])
}

describe.skipIf(!hasFixtures('frames', 'scroll_105.json'))('real scroll recording', () => {
  it('scroll down and back keeps the layout', () => {
    const s = new VendorSession()
    s.applyScan(frame(105), new Map(), 0)
    const top = layout(s)
    s.applyScan(frame(106), new Map(), 500) // rolou 3 linhas
    expect(s.rowOffset).toBe(3)
    s.applyScan(frame(110), new Map(), 1000) // de volta ao topo
    expect(s.rowOffset).toBe(0)
    expect(layout(s)).toEqual(top)
  })

  it('a frame in the middle of the scroll animation is not applied', () => {
    const s = new VendorSession()
    s.applyScan(frame(105), new Map(), 0)
    s.applyScan(frame(106), new Map(), 500)
    const afterScroll = layout(s)
    s.applyScan(frame(109), new Map(), 1000) // lista meia linha fora do reticulado (animação)
    expect(layout(s)).toEqual(afterScroll)
    expect(s.rowOffset).toBe(3)
    expect(s.lastSeen).toBe(1000) // o vendedor continua visível
    s.applyScan(frame(110), new Map(), 1500)
    expect(s.rowOffset).toBe(0)
  })

  it('a panel pushed down by a notification is accepted on the next scan', () => {
    // um aviso no topo da tela empurra o painel 37 px; não é rolagem e continua assim
    const s = new VendorSession()
    s.applyScan(frame(113), new Map(), 0)
    s.applyScan(frame(114), new Map(), 500)
    s.applyScan(frame(115), new Map(), 1000)
    expect(s.rowOffset).toBe(0)
    expect(s.geometry!.y0).toBe(frame(115).geometry.y0)
  })
})
