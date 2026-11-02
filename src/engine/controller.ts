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
  private sizes: [number, number][]

  constructor(public ds: Dataset) {
    const seen = new Set<string>()
    this.sizes = []
    for (const it of ds.items.values()) {
      for (const [w, h] of [it.size, [it.size[1], it.size[0]] as [number, number]]) {
        if (!seen.has(`${w}x${h}`)) seen.add(`${w}x${h}`) && this.sizes.push([w, h])
      }
    }
  }

  /** Algum item cabe: inteira, com o tamanho exato (girado ou não); cortada na borda de cima ou de baixo, com a
   * mesma largura e altura de pelo menos a parte visível. */
  private possible(b: { w: number; h: number; clipped: boolean }): boolean {
    return this.sizes.some(([w, h]) => w === b.w && (b.clipped ? h >= b.h : h === b.h))
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
          rarity: c.item.rarity,
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

  /** Caixa com tamanho que nenhum item tem = algo cobre o grid (ou células vazias juntadas na borda): vira célula
   * incerta. O Python só olha as caixas inteiras; aqui as cortadas também, pela largura, que o corte não muda. */
  private plausible(scan: GridScan): GridScan {
    const bad = scan.boxes.filter((b) => this.sizes.length > 0 && !this.possible(b))
    if (bad.length === 0) return scan
    const uncertain = new Set(scan.uncertain)
    for (const b of bad) for (const [c, r] of boxCells(b)) uncertain.add(cellKey(c, r))
    return { ...scan, boxes: scan.boxes.filter((b) => !bad.includes(b)), uncertain }
  }
}
