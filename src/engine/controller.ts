/** Junta visão, cursor e áudio na sessão do vendedor (abi_ear/controller.py sem OCR, tooltip nem calibração). */
import { attribute, CursorHistory, type Attribution } from './attribution'
import type { ListenEvent } from './audio/listener'
import { rank } from './candidates'
import type { Dataset } from './data/dataset'
import type { FrameResult } from './pipeline'
import { allProfileIds } from './profiles'
import { TrackedBox, VendorSession } from './session'
import type { SessionView } from './view'
import { boxCells, cellKey, type GridGeometry, type GridScan } from './vision/types'

export const MAX_LAYOUT_AGE_MS = 1500 // pegada só vale se o grid foi visto há pouco
export const OTHER_PITCH = 0.1 // célula deste tanto maior/menor que a do vendedor guardado: outra tela (inventário)

type Pickup = Extract<ListenEvent, { kind: 'pickup' }>
export type PickupOutcome =
  | { kind: 'assigned'; uid: number; event: Pickup }
  | { kind: 'unassigned'; reason: Extract<Attribution, { kind: 'none' }>['reason'] | 'no-vendor'; event: Pickup }

const NO_LABELS: ReadonlyMap<string, string | null> = new Map()

export class Controller {
  session = new VendorSession()
  profileId: number | null = null // null: todos os mapas
  vendorVisible = false
  lastArrowMs: number | null = null
  private history = new CursorHistory()
  private sizes: Set<string>

  constructor(public ds: Dataset) {
    this.sizes = new Set([...ds.items.values()].map((it) => [...it.size].sort((a, b) => a - b).join('x')))
  }

  profiles(): number[] {
    return this.profileId === null ? allProfileIds(this.ds) : [this.profileId]
  }

  setProfile(id: number | null): void {
    this.profileId = id
    for (const box of this.session.boxes.values()) if (box.picks) this.rerank(box)
  }

  clear(): void {
    this.session = new VendorSession()
  }

  /** Grid do vendedor para a visão procurar primeiro. */
  hint(): GridGeometry | null {
    return this.session.boxes.size > 0 ? this.session.geometry : null
  }

  onFrame(r: FrameResult): void {
    if (r.cursor) {
      this.history.add(r.cursor)
      this.lastArrowMs = r.t
    } else {
      this.history.add({ t: r.t, missing: true })
    }
    if (r.scan === undefined) return // sem varredura neste quadro
    if (r.scan === null || this.otherScreen(r.scan)) {
      this.vendorVisible = false // a sessão fica guardada: o vendedor pode ser reaberto
      return
    }
    if (this.session.isExpired(r.t) && this.session.boxes.size > 0 && !this.session.reopen(r.scan)) {
      this.session = new VendorSession() // outro vendedor, ou o estoque mudou demais
    }
    this.vendorVisible = true
    this.session.applyScan(this.plausible(r.scan), NO_LABELS, r.t)
  }

  onPickup(e: Pickup): PickupOutcome {
    const seen = this.session.lastSeen
    if (seen === null || e.t - seen > MAX_LAYOUT_AGE_MS) return { kind: 'unassigned', reason: 'no-vendor', event: e }
    const a = attribute(this.history, e.t, (x, y) => this.session.boxAtScreen(x, y))
    if (a.kind === 'none') return { kind: 'unassigned', reason: a.reason, event: e }
    const box = this.session.boxByUid(a.uid)!
    box.addHits(e.hits)
    this.rerank(box)
    return { kind: 'assigned', uid: box.uid, event: e }
  }

  view(): SessionView {
    const s = this.session
    return {
      geometry: s.geometry,
      rowOffset: s.rowOffset,
      extent: s.rowExtent(),
      boxes: [...s.boxes.values()].map((b) => ({
        uid: b.uid,
        col: b.col,
        row: b.row,
        w: b.w,
        h: b.h,
        clipped: b.clipped,
        picks: b.picks,
        sizeRelaxed: b.ranking?.sizeRelaxed ?? false,
        candidates: (b.ranking?.candidates ?? []).map((c) => ({
          itemId: c.item.id,
          name: c.item.name,
          pct: c.pct,
          icon: c.item.iconUrl ? `data/icons/${Math.trunc(c.item.id)}.png` : null,
        })),
      })),
    }
  }

  private rerank(box: TrackedBox): void {
    box.ranking = rank(this.ds, this.profiles(), null, null, box.hits(), box.size)
  }

  /** Grid que não pode ser o vendedor guardado: célula de outro tamanho (sem rótulos, só o tamanho decide). */
  private otherScreen(scan: GridScan): boolean {
    const geom = this.session.geometry
    if (this.session.boxes.size === 0 || geom === null) return false
    return Math.abs(scan.geometry.pitch - geom.pitch) > OTHER_PITCH * geom.pitch
  }

  /** Retângulo inteiro com tamanho que nenhum item tem = algo cobre o grid: vira célula incerta. */
  private plausible(scan: GridScan): GridScan {
    const bad = scan.boxes.filter((b) => this.sizes.size > 0 && !b.clipped && !this.sizes.has([b.w, b.h].sort((x, y) => x - y).join('x')))
    if (bad.length === 0) return scan
    const uncertain = new Set(scan.uncertain)
    for (const b of bad) for (const [c, r] of boxCells(b)) uncertain.add(cellKey(c, r))
    return { ...scan, boxes: scan.boxes.filter((b) => !bad.includes(b)), uncertain }
  }
}
