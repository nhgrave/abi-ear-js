/** Junta visão, cursor, rótulos e áudio na sessão do vendedor (abi_ear/controller.py sem tooltip nem calibração). */
import { attribute, CursorHistory, type Attribution } from './attribution'
import type { ListenEvent } from './audio/listener'
import { rank } from './candidates'
import type { Dataset } from './data/dataset'
import type { FrameResult, LabelReading } from './pipeline'
import { allProfileIds, profilesForLabels, type ProfileChoice } from './profiles'
import { TrackedBox, VendorSession } from './session'
import type { SessionView } from './view'
import { boxCells, cellKey, type GridGeometry, type GridScan } from './vision/types'

export const MAX_LAYOUT_AGE_MS = 1500 // pegada só vale se o grid foi visto há pouco
export const OTHER_PITCH = 0.1 // célula deste tanto maior/menor que a do vendedor guardado: outra tela (inventário)
export const MIN_TEXTS_TO_REJECT = 3 // outro grid do jogo: tantas caixas com texto e nenhum é rótulo de caixa
const VOTES_TO_ACCEPT = 2 // leituras iguais, em quadros diferentes, para a categoria valer

type Pickup = Extract<ListenEvent, { kind: 'pickup' }>
export type PickupOutcome =
  | { kind: 'assigned'; uid: number; event: Pickup }
  | { kind: 'unassigned'; reason: Extract<Attribution, { kind: 'none' }>['reason'] | 'no-vendor'; event: Pickup }

const NO_LABELS: ReadonlyMap<string, string | null> = new Map()

export class Controller {
  session = new VendorSession()
  profileChoice: ProfileChoice = 'auto'
  vendorVisible = false
  /** Algum rótulo já foi confirmado desde que a página abriu: o jogo está num idioma que a página lê. Só então valem
   * as regras que dependem de rótulo (outra tela pelo texto, dica de busca); antes, tudo como na v0.1. */
  labelsSeen = false
  lastArrowMs: number | null = null
  private history = new CursorHistory()
  private votes = new Map<number, { label: string; n: number }>() // uid da caixa -> leitura e quantas vezes seguidas
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
    const c = this.profileChoice
    if (c === 'all') return allProfileIds(this.ds)
    if (c === 'auto') return profilesForLabels(this.ds, this.seenLabels())
    return [c]
  }

  setProfile(choice: ProfileChoice): void {
    this.profileChoice = choice
    this.rerankPicked()
  }

  clear(): void {
    this.newSession()
  }

  /** Grid do vendedor para a visão procurar primeiro. Depois que a página leu rótulos, só com algum rótulo lido nele
   * (um grid de inventário guardado por engano não pode prender a busca). */
  hint(): GridGeometry | null {
    const boxes = [...this.session.boxes.values()]
    if (boxes.length === 0) return null
    if (this.labelsSeen && !boxes.some((b) => b.label !== null)) return null
    return this.session.geometry
  }

  onFrame(r: FrameResult): void {
    if (r.cursor) {
      this.history.add(r.cursor)
      this.lastArrowMs = r.t
    } else {
      this.history.add({ t: r.t, missing: true })
    }
    if (r.scan === undefined) return // sem varredura neste quadro
    // só o vendedor tem a aba Purchase ativa acima do grid: armazém, saque, chão e a aba Sell não são o vendedor
    if (r.scan !== null && r.tab !== undefined && r.tab !== 'purchase') {
      this.vendorVisible = false // a sessão fica guardada
      return
    }
    const readings = r.labels
    const anyLabel = readings.some((x) => x.label !== null)
    if (r.scan === null || this.rejectedByText(r.scan, readings, anyLabel) || this.otherScreen(r.scan, readings, anyLabel, r.t)) {
      this.vendorVisible = false // a sessão fica guardada: o vendedor pode ser reaberto
      return
    }
    if (this.session.isExpired(r.t) && this.session.boxes.size > 0 && !this.session.reopen(r.scan)) {
      this.newSession() // outro vendedor, ou o estoque mudou demais
    }
    this.vendorVisible = true
    // só vota quando a sessão aplicou o scan: aguardando confirmação, as posições guardadas são as do layout anterior
    if (this.session.applyScan(this.plausible(r.scan), NO_LABELS, r.t)) this.vote(readings, r.t)
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
        label: b.label,
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
    const typeId = box.label !== null ? (this.ds.typeIds.get(box.label) ?? null) : null
    box.ranking = rank(this.ds, this.profiles(), typeId, null, box.hits(), box.size)
  }

  private rerankPicked(): void {
    for (const box of this.session.boxes.values()) if (box.picks) this.rerank(box)
  }

  private newSession(): void {
    this.session = new VendorSession()
    this.votes.clear()
  }

  private seenLabels(): string[] {
    return [...this.session.boxes.values()].flatMap((b) => (b.label !== null ? [b.label] : []))
  }

  /** O grid do scan é o do vendedor guardado: mesma célula e mesmas colunas (a rolagem só muda a altura). */
  private sameVendorGrid(scan: GridScan): boolean {
    const g = this.session.geometry
    if (g === null || this.session.boxes.size === 0) return false
    const s = scan.geometry
    return Math.abs(s.pitch - g.pitch) <= OTHER_PITCH * g.pitch && Math.abs(s.x0 - g.x0) <= 0.5 * g.pitch
  }

  /** Outra tela com grid (ex.: Recycling Station): tantas caixas com texto e nenhum rótulo de vendedor. Não vale no
   * grid do vendedor guardado: lá, texto sem rótulo é categoria sem modelo (Medical Supplies...), não outra tela. */
  private rejectedByText(scan: GridScan, readings: LabelReading[], anyLabel: boolean): boolean {
    return this.labelsSeen && !anyLabel && readings.filter((x) => x.hasText).length >= MIN_TEXTS_TO_REJECT && !this.sameVendorGrid(scan)
  }

  /** Grid que não pode ser o vendedor guardado: célula de outro tamanho (mesmo com rótulo: o leitor lê em qualquer
   * escala) ou, depois que a página leu rótulos, grid com texto e sem rótulo em outro lugar quando o vendedor sumiu
   * há tempo (a sessão seria trocada por ele). */
  private otherScreen(scan: GridScan, readings: LabelReading[], anyLabel: boolean, t: number): boolean {
    const geom = this.session.geometry
    if (this.session.boxes.size === 0 || geom === null) return false
    if (Math.abs(scan.geometry.pitch - geom.pitch) > OTHER_PITCH * geom.pitch) return true
    if (anyLabel || this.sameVendorGrid(scan)) return false
    return this.labelsSeen && readings.some((x) => x.hasText) && this.session.isExpired(t)
  }

  /** Cada leitura vota na caixa da sessão que ocupa o mesmo retângulo da tela. Os votos ficam na identidade da caixa
   * (uid), que acompanha rolagem e reorganização, e leitura diferente recomeça a contagem. Caixa sem categoria ganha a
   * lida duas vezes seguidas. Caixa com categoria não muda de categoria: lida duas vezes seguidas como outra, é outra
   * caixa no mesmo lugar (o estoque mudou e a sessão a confundiu com a antiga), e entra como caixa nova. */
  private vote(readings: LabelReading[], t: number): void {
    const off = this.session.rowOffset
    let changed = false
    for (const r of readings) {
      if (r.label === null) continue
      const box = this.session.boxContaining(r.col, r.row + off)
      if (!box || box.col !== r.col || box.row !== r.row + off || box.w !== r.w || box.h !== r.h) continue
      if (box.label === r.label) {
        this.votes.delete(box.uid) // leitura que confirma: zera uma contestação em curso
        continue
      }
      const v = this.votes.get(box.uid)
      const n = v && v.label === r.label ? v.n + 1 : 1
      this.votes.set(box.uid, { label: r.label, n })
      if (n < VOTES_TO_ACCEPT) continue
      this.votes.delete(box.uid)
      if (box.label === null) box.label = r.label
      else this.session.replaceBox(box, r.label, t)
      this.labelsSeen = true
      changed = true
    }
    if (changed) this.rerankPicked() // os perfis do automático podem ter mudado
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
