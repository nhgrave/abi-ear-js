/** Prévia do modo local (npm run dev, `?preview`): a tela com um vendedor de verdade, sem o jogo. Roda o motor de
 * verdade (Controller) com o estoque da gravação 2026-11-03-220143 e pegadas com os sons dela, para ajustar o layout.
 * Nunca entra no build publicado. */
import { Controller } from '../engine/controller'
import type { Dataset } from '../engine/data/dataset'
import type { FrameResult, LabelReading } from '../engine/pipeline'
import type { SessionView } from '../engine/view'
import type { BoxRect, GridGeometry, GridScan } from '../engine/vision/types'

const GEOM: GridGeometry = { x0: 1255, y0: 190, pitch: 64, cols: 9, rows: 11 }

type Spec = [col: number, row: number, w: number, h: number, label: string | null, sound?: string]

// estoque do Field Merchant na gravação 220143 (categoria lida e, nas caixas pegas, o som ouvido)
const STOCK: Spec[] = [
  [0, 0, 1, 1, 'Uncommon Mystery Cargo'],
  [1, 0, 1, 1, 'Collectibles', 'Item_Misc_Med_Statue_Up'],
  [2, 0, 1, 1, 'Instruments', 'Item_Misc_ElectronicDevice_Up'],
  [3, 0, 1, 1, 'Instruments'],
  [4, 0, 1, 1, 'Mystery Cargo', 'Item_Misc_Small_Metal_Blunt_Up'],
  [5, 0, 1, 1, 'Mystery Cargo'],
  [6, 0, 1, 1, 'Electronics'],
  [7, 0, 1, 1, null],
  [8, 0, 1, 1, 'Collectibles'],
  [0, 1, 2, 1, 'Mystery Cargo'],
  [2, 1, 1, 2, 'Mystery Cargo', 'Item_Misc_Big_Blunt_Up'],
  [3, 1, 1, 2, 'Mystery Cargo'],
  [4, 1, 1, 2, 'Mystery Cargo'],
  [5, 1, 1, 2, 'Uncommon Collectibles', 'Item_Misc_Med_Statue_Up'],
  [6, 1, 1, 2, 'Mystery Cargo'],
  [7, 1, 2, 1, 'Mystery Cargo'],
  [0, 2, 1, 2, 'Military Items'],
  [7, 2, 2, 2, 'Computer Parts', 'Item_Misc_Big_Wood_Up'],
  [1, 3, 2, 2, 'Mystery Cargo', 'Item_Misc_Big_Wood_Up'],
  [3, 3, 2, 2, 'Computer Parts', 'Item_Misc_Big_Wood_Up'],
  [5, 3, 2, 2, 'Mystery Cargo', 'Item_Misc_Small_Metal_Crisp_Up'],
  [7, 4, 2, 2, null, 'Item_Misc_ElectronicDevice_Up'],
  [0, 5, 2, 2, 'Mystery Cargo', 'Item_Misc_Small_Metal_Blunt_Up'],
  [2, 5, 2, 2, 'Computer Parts', 'Prop_Acc_Tech_Small_UP'],
  [4, 5, 2, 2, 'Uncommon Mystery Cargo', 'Item_Misc_Med_Paper_Up'],
  [6, 6, 3, 2, 'Uncommon Mystery Cargo', 'Item_Misc_ElectronicDevice_Up'],
  [0, 7, 2, 3, 'Uncommon Mystery Cargo', 'Item_Misc_Med_Metal_Blunt_Up'],
  [2, 7, 2, 3, 'Mystery Cargo', 'Item_Misc_Med_Metal_Crisp_Up'],
  [4, 8, 3, 2, 'Mystery Cargo', 'Item_Misc_Med_Metal_Crisp_Up'],
]

const center = ([c, r, w, h]: Spec): [number, number] => [GEOM.x0 + (c + w / 2) * GEOM.pitch, GEOM.y0 + (r + h / 2) * GEOM.pitch]

/** O retrato da sessão depois de ver o estoque e pegar as caixas que têm som. */
export function previewView(ds: Dataset): SessionView {
  const c = new Controller(ds)
  c.setProfile('auto')
  const rects: BoxRect[] = STOCK.map(([col, row, w, h]) => ({ col, row, w, h, clipped: false }))
  const scan: GridScan = { geometry: GEOM, boxes: rects, uncertain: new Set(), overlays: [] }
  const labels: LabelReading[] = STOCK.map(([col, row, w, h, label]) => ({ col, row, w, h, label, hasText: true }))
  const frame = (t: number, withScan: boolean, cursor: [number, number] | null): FrameResult => ({
    t,
    cursor: cursor ? { t, x: cursor[0], y: cursor[1], score: 0.95 } : null,
    scan: withScan ? scan : undefined,
    mean: 40,
    labels: withScan ? labels : [],
    tab: withScan ? 'purchase' : undefined,
  })
  c.onFrame(frame(1000, true, null))
  c.onFrame(frame(1400, true, null)) // segunda leitura: as categorias valem
  const soundIds = new Map([...ds.sounds.values()].map((s) => [s.pickup, s.id]))
  let t = 3000
  for (const spec of STOCK) {
    const id = spec[5] !== undefined ? soundIds.get(spec[5]) : undefined
    if (id === undefined) continue
    for (const dt of [380, 280, 180]) c.onFrame(frame(t - dt, dt === 380, center(spec)))
    c.onPickup({ kind: 'pickup', t, soundId: id, score: 0.9, hits: [{ soundId: id, score: 0.9 }] })
    t += 1000
  }
  return c.view()
}
