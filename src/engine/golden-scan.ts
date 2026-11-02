/** Converte o campo `full`/`right` de um golden `frames/*.json` em GridScan (os testes usam os scans no lugar dos PNG). */
import { cellKey, type GridScan, type Rect } from './vision/types'
import { fixturePath, readJson } from '../test-utils/fixtures'

type GoldenScan = {
  geometry: { x0: number; y0: number; pitch: number; cols: number; rows: number }
  boxes: [number, number, number, number, boolean][]
  uncertain: [number, number][]
  overlays: Rect[]
}

export function goldenScan(name: string, field: 'full' | 'right' = 'full'): GridScan {
  const g = readJson<Record<string, GoldenScan>>(fixturePath('frames', `${name}.json`))[field]
  return {
    geometry: g.geometry,
    boxes: g.boxes.map(([col, row, w, h, clipped]) => ({ col, row, w, h, clipped })),
    uncertain: new Set(g.uncertain.map(([c, r]) => cellKey(c, r))),
    overlays: g.overlays,
  }
}
