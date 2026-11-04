/** Um quadro da tela vira cursor (todo quadro) e grid do vendedor (no máximo a cada SCAN_INTERVAL_MS). */
import { CursorTracker, type CursorSample } from './vision/cursor'
import { meanGray, type Gray } from './vision/image'
import { scan } from './vision/grid'
import type { GridGeometry, GridScan } from './vision/types'
import { readLabels, type LabelModels } from './vision/label-reader'
import { vendorTab, type Rgba, type VendorTab } from './vision/vendor-tab'

export const SCAN_INTERVAL_MS = 350 // o mesmo intervalo de varredura do app desktop

/** Leitura do rótulo de uma caixa inteira, em células da tela. `label` já normalizado (nome do tipo na base) ou null;
 * `hasText`: havia texto na faixa do rótulo (rótulo ou não). */
export type LabelReading = { col: number; row: number; w: number; h: number; label: string | null; hasText: boolean }

export type FrameResult = {
  t: number
  cursor: CursorSample | null
  scan: GridScan | null | undefined // undefined: sem varredura neste quadro
  mean: number // média de cinza (quadro preto)
  labels: LabelReading[] // vazio sem varredura ou sem leitor
  labelMs?: number // tempo da leitura dos rótulos neste quadro (medido no replay)
  /** Aba ativa do vendedor acima do grid achado; undefined sem varredura, sem grid ou sem o quadro em cores. */
  tab?: VendorTab
}

/** O vendedor fica na metade direita da tela: sem OCR, é o que separa o grid dele do inventário. */
export function scanVendor(gray: Gray, hint: GridGeometry | null): GridScan | null {
  const half = Math.floor(gray.w / 2)
  return scan(gray, [half, 0, gray.w - half, gray.h], hint)
}

export class FramePipeline {
  private cursor = new CursorTracker()
  private lastScanT: number | null = null
  private lastGrid: GridGeometry | null = null

  constructor(private models: LabelModels | null = null) {}

  /** `rgba`: o mesmo quadro em cores, para conferir a aba do vendedor (sem ele, todo grid vale, como antes). */
  process(gray: Gray, t: number, hint: GridGeometry | null, rgba?: Rgba): FrameResult {
    let found: GridScan | null | undefined
    let labels: LabelReading[] = []
    let labelMs: number | undefined
    let tab: VendorTab | undefined
    if (this.lastScanT === null || t - this.lastScanT >= SCAN_INTERVAL_MS) {
      found = scanVendor(gray, hint)
      this.lastScanT = t
      this.lastGrid = found ? found.geometry : null
      if (found && rgba) tab = vendorTab(rgba, found.geometry)
      if (found && this.models) {
        const t0 = performance.now()
        labels = readLabels(gray, found.geometry, found.boxes, this.models)
        labelMs = performance.now() - t0
      }
    }
    const cursor = this.cursor.find(gray, t, this.lastGrid ?? hint)
    return { t, cursor, scan: found, mean: meanGray(gray), labels, ...(labelMs !== undefined && { labelMs }), ...(tab !== undefined && { tab }) }
  }
}
