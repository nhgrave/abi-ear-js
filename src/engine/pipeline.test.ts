import { describe, expect, it } from 'vitest'
import { FramePipeline, SCAN_INTERVAL_MS, scanVendor } from './pipeline'
import { hasFixtures, readGray, fixturePath, readJson } from '../test-utils/fixtures'
import type { GridGeometry } from './vision/types'

describe.skipIf(!hasFixtures('frames', 'live_vendor_backpack.json'))('pipeline', () => {
  it('vendor search stays in the right half', () => {
    const gray = readGray('live_vendor_backpack')
    const wrong: GridGeometry = { x0: 193, y0: 190, pitch: 64, cols: 9, rows: 10 }
    for (const hint of [null, wrong]) {
      const found = scanVendor(gray, hint)
      expect(found).not.toBeNull()
      expect(found!.geometry.x0).toBeGreaterThanOrEqual(gray.w / 2)
    }
  })

  it('vendor search with the right hint keeps the hinted grid', () => {
    const gray = readGray('live_vendor_backpack')
    const right = readJson<{ right: { geometry: GridGeometry } }>(fixturePath('frames', 'live_vendor_backpack.json')).right.geometry
    const found = scanVendor(gray, right)!
    expect(Math.abs(found.geometry.x0 - right.x0)).toBeLessThanOrEqual(1)
    expect(Math.abs(found.geometry.pitch - right.pitch)).toBeLessThanOrEqual(1)
  })

  it('pipeline scans at most every 350 ms and looks for the cursor every frame', () => {
    const gray = readGray('live_vendor_backpack')
    const p = new FramePipeline()
    const results = [0, 100, 200, 300, 350, 400].map((t) => p.process(gray, t, null))
    expect(results.map((r) => r.scan !== undefined)).toEqual([true, false, false, false, true, false])
    expect(SCAN_INTERVAL_MS).toBe(350)
    expect(results.every((r) => r.mean > 0 && 'cursor' in r)).toBe(true)
  })
})
