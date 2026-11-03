/** Estado de uma visita ao vendedor: caixas em coordenadas de conteúdo e seus resultados.
 * Sem `pending` nem preço (v0.1 não tem tooltip): a pegada já chega com o áudio pronto. */
import type { Ranking, SoundHit } from './candidates'
import { align, readingOrder } from './reflow'
import { estimateRowShift } from './vision/scroll'
import { boxCells, cellAt, cellKey, parseCellKey, type BoxRect, type GridGeometry, type GridScan } from './vision/types'

export const SESSION_TIMEOUT_MS = 10000 // vendedor sumido por mais que isso: ao reaparecer, confere se o layout ainda bate
export const MIN_BOXES_FOR_JUMP = 3 // caixas inteiras necessárias para concluir que a vista pulou para conteúdo novo
export const MAX_ANCHOR_CONFLICTS = 0.25 // no encaixe com o layout guardado: até 1 caixa divergente para 4 iguais
export const VANISH_GRACE_MS = 2000 // caixa que some com o lugar vazio (sendo arrastada) é mantida por este tempo
export const PHASE_TOL = 0.15 // grid deslocado mais que esta fração de célula saiu do reticulado anterior
export const PITCH_TOL = 0.1 // célula com tamanho diferente deste tanto: leitura errada (ex.: meia célula na rolagem)
export const RESTORE_WINDOW_MS = 60000 // caixa removida com resultado: volta a ele se reaparecer igual no mesmo lugar
export const REFLOW_MIN_CONFLICTS = 2 // caixas vistas sobre caixas guardadas diferentes: o estoque se reorganizou
export const REFLOW_MAX_SIZE_CHANGE = 0.2 // o estoque é ordenado por tamanho: rolar muda os tamanhos à vista, uma
// compra quase não (até 2 caixas ou esta fração delas)
export const EDGE_TOL = 0.1 // clique até esta fração de célula além da borda esquerda/direita conta na coluna da borda

let nextUid = 1

export type Labels = ReadonlyMap<string, string | null> // "c,r" de tela -> nome do tipo

export type TrackedBoxInit = {
  label?: string | null
  soundScores?: Map<number, number[]>
  picks?: number
  ranking?: Ranking | null
  seenAt?: number
  stale?: boolean
}

export class TrackedBox {
  label: string | null // nome do tipo na base (ex.: "Computer Parts")
  soundScores: Map<number, number[]>
  picks: number
  ranking: Ranking | null
  uid: number // identidade que acompanha a caixa movida
  seenAt: number // último scan em que apareceu
  stale: boolean // fora da vista quando o estoque se reorganizou: a posição pode ter mudado

  constructor(
    public col: number,
    public row: number, // linha de conteúdo (não muda com a rolagem)
    public w: number,
    public h: number,
    public clipped = false,
    init: TrackedBoxInit = {},
  ) {
    this.label = init.label ?? null
    this.soundScores = init.soundScores ?? new Map()
    this.picks = init.picks ?? 0
    this.ranking = init.ranking ?? null
    this.uid = nextUid++
    this.seenAt = init.seenAt ?? 0
    this.stale = init.stale ?? false
  }

  get key(): string {
    return cellKey(this.col, this.row)
  }

  get size(): [number, number] | null {
    return this.clipped ? null : [this.w, this.h]
  }

  /** Células cobertas, como chaves "c,r". */
  cells(): Set<string> {
    return new Set(boxCells(this).map(([c, r]) => cellKey(c, r)))
  }

  get hasData(): boolean {
    return this.picks > 0
  }

  addHits(hits: readonly SoundHit[]): void {
    this.picks += 1
    for (const hit of hits) {
      const scores = this.soundScores.get(hit.soundId)
      if (scores) scores.push(hit.score)
      else this.soundScores.set(hit.soundId, [hit.score])
    }
  }

  /** Média dos scores de cada som entre as vezes em que a caixa foi pega. */
  hits(): SoundHit[] {
    const avg: SoundHit[] = []
    for (const [soundId, v] of this.soundScores) {
      if (v.length > 0) avg.push({ soundId, score: v.reduce((a, b) => a + b, 0) / v.length })
    }
    return avg.sort((a, b) => b.score - a.score)
  }

  takeDataFrom(other: TrackedBox): void {
    this.label = this.label || other.label
    this.soundScores = new Map([...other.soundScores].map(([k, v]) => [k, [...v]]))
    this.picks = other.picks
    this.ranking = other.ranking
    this.uid = other.uid
  }
}

const intersects = (a: Set<string>, b: Set<string>): boolean => {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a]
  for (const x of small) if (big.has(x)) return true
  return false
}

const rowOfKey = (key: string): number => parseCellKey(key)[1]

function sameSizes(a: readonly BoxRect[], b: readonly BoxRect[]): boolean {
  const count = (xs: readonly BoxRect[]) => {
    const m = new Map<string, number>()
    for (const x of xs) m.set(`${x.w},${x.h}`, (m.get(`${x.w},${x.h}`) ?? 0) + 1)
    return m
  }
  const ca = count(a)
  const cb = count(b)
  let changed = 0
  for (const k of new Set([...ca.keys(), ...cb.keys()])) changed += Math.abs((ca.get(k) ?? 0) - (cb.get(k) ?? 0))
  return changed <= Math.max(2, REFLOW_MAX_SIZE_CHANGE * Math.max(a.length, b.length))
}

export class VendorSession {
  boxes = new Map<string, TrackedBox>()
  rowOffset = 0 // linha de conteúdo exibida na linha 0 da tela
  geometry: GridGeometry | null = null
  lastSeen: number | null = null
  private prevScan: GridScan | null = null
  private pendingGeometry: GridGeometry | null = null // grid fora do reticulado aguardando confirmação
  private removed = new Map<string, [number, TrackedBox]>() // chave -> (quando, caixa)
  private pendingLayout: string | null = null // reorganização aguardando confirmação

  // ----- consultas

  /** Linhas de conteúdo à vista: [início, fim). */
  visibleRows(): [number, number] {
    const rows = this.geometry ? this.geometry.rows : 0
    return [this.rowOffset, this.rowOffset + rows]
  }

  rowExtent(): [number, number] {
    const [a, b] = this.visibleRows()
    let lo = Infinity
    let hi = -Infinity
    for (const box of this.boxes.values()) {
      for (const key of box.cells()) {
        const r = rowOfKey(key)
        lo = Math.min(lo, r)
        hi = Math.max(hi, r)
      }
    }
    if (b > a) {
      lo = Math.min(lo, a)
      hi = Math.max(hi, b - 1)
    }
    return lo === Infinity ? [0, 0] : [lo, hi + 1]
  }

  boxContaining(col: number, row: number): TrackedBox | null {
    const key = cellKey(col, row)
    for (const box of this.boxes.values()) if (box.cells().has(key)) return box
    return null
  }

  boxByUid(uid: number): TrackedBox | null {
    for (const b of this.boxes.values()) if (b.uid === uid) return b
    return null
  }

  boxAtScreen(x: number, y: number): TrackedBox | null {
    const g = this.geometry
    if (g === null) return null
    const right = g.x0 + g.cols * g.pitch
    if (g.x0 - EDGE_TOL * g.pitch <= x && x < right + EDGE_TOL * g.pitch) {
      x = Math.min(Math.max(x, g.x0), right - 1) // x0 lido com 1–2 px de erro não perde o clique na borda da caixa
    }
    const cell = cellAt(g, x, y)
    if (cell === null) return null
    return this.boxContaining(cell[0], cell[1] + this.rowOffset)
  }

  isExpired(nowMs: number, timeoutMs = SESSION_TIMEOUT_MS): boolean {
    return this.lastSeen !== null && nowMs - this.lastSeen > timeoutMs
  }

  // ----- atualizações

  /** Outra caixa do mesmo tamanho no lugar de `old` (a leitura do rótulo mostrou outra categoria): caixa nova, sem os
   * dados da antiga. */
  replaceBox(old: TrackedBox, label: string, nowMs: number): TrackedBox {
    const box = new TrackedBox(old.col, old.row, old.w, old.h, old.clipped, { label, seenAt: nowMs })
    this.boxes.set(old.key, box)
    return box
  }

  /** Deslocamento de linhas que encaixa o layout do scan no layout guardado, ou null. */
  private anchorOffset(scan: GridScan): number | null {
    const curr = scan.boxes.filter((b) => !b.clipped)
    const full = [...this.boxes.values()].filter((b) => !b.clipped)
    const stored = new Set(full.map((b) => `${b.col},${b.row},${b.w},${b.h}`))
    const occupied = new Set<string>()
    for (const b of full) for (const cell of b.cells()) occupied.add(cell)
    if (curr.length === 0 || stored.size === 0) return null
    const [lo, hi] = this.rowExtent()
    let bestOff: number | null = null
    let bestN = 0
    const offs: number[] = []
    for (let o = lo - scan.geometry.rows; o <= hi; o++) offs.push(o)
    offs.sort((a, b) => Math.abs(a - this.rowOffset) - Math.abs(b - this.rowOffset))
    for (const off of offs) {
      let matches = 0
      let conflicts = 0
      for (const { col, row, w, h } of curr) {
        if (stored.has(`${col},${row + off},${w},${h}`)) matches++
        else if (boxCells({ col, row: row + off, w, h }).some(([c, r]) => occupied.has(cellKey(c, r)))) conflicts++ // cai sobre caixas guardadas diferentes dela
      }
      if (matches >= 2 && conflicts <= MAX_ANCHOR_CONFLICTS * matches && matches > bestN) {
        bestOff = off
        bestN = matches
      }
    }
    return bestOff
  }

  /** Vendedor visto de novo depois de um tempo fechado: retoma se o layout bate com o guardado. */
  reopen(scan: GridScan): boolean {
    const off = this.anchorOffset(scan)
    if (off === null) return false
    this.rowOffset = off
    this.prevScan = null // a rolagem desde o último scan não conta: o encaixe já deu a posição
    return true
  }

  /** A rolagem entre dois scans não foi medida (pulo grande, ex.: arrastar a barra de rolagem).
   *
   * Procura o deslocamento que encaixa o layout atual no layout guardado da sessão. Se nada encaixa e
   * há caixas suficientes para afirmar que a vista mudou, trata como conteúdo nunca visto e o coloca
   * abaixo de tudo o que já foi visto, sem apagar nenhum resultado guardado. */
  private relocate(scan: GridScan, prevScan: GridScan): void {
    const curr = scan.boxes.filter((b) => !b.clipped)
    const prev = prevScan.boxes.filter((b) => !b.clipped)
    if (curr.length === 0 || ![...this.boxes.values()].some((b) => !b.clipped)) return
    const bestOff = this.anchorOffset(scan)
    if (bestOff !== null) {
      this.rowOffset = bestOff
    } else if (sameSizes(prev, curr)) {
      // a vista não mudou: o estoque se reorganizou (alguém comprou) e o realinhamento resolve
    } else if (curr.length >= MIN_BOXES_FOR_JUMP && prev.length >= MIN_BOXES_FOR_JUMP) {
      this.rowOffset = this.rowExtent()[1]
    }
  }

  /** Remove a caixa, guardando o resultado: ela pode voltar (arrasto longo, leitura ruim). */
  private forget(key: string, nowMs: number): void {
    const box = this.boxes.get(key)
    this.boxes.delete(key)
    if (box !== undefined && box.hasData) this.removed.set(key, [nowMs, box])
  }

  private restore(nw: TrackedBox, nowMs: number): void {
    const entry = this.removed.get(nw.key)
    if (entry === undefined) return
    const [when, old] = entry
    if (nowMs - when > RESTORE_WINDOW_MS) return
    if (old.w === nw.w && old.h === nw.h && old.clipped === nw.clipped && (nw.label === null || nw.label === old.label)) {
      nw.takeDataFrom(old)
      this.removed.delete(nw.key)
    }
  }

  private offLattice(geom: GridGeometry): boolean {
    if (this.geometry === null) return false
    if (Math.abs(geom.pitch - this.geometry.pitch) > PITCH_TOL * this.geometry.pitch) return true
    const p = geom.pitch
    const d = (((geom.y0 - this.geometry.y0) % p) + p) % p // módulo do Python (sempre >= 0)
    return Math.min(d, p - d) > PHASE_TOL * p
  }

  /** Incorpora um scan. `labels` usa coordenadas de tela ("c,r") -> nome do tipo. Devolve false quando o scan fica
   * aguardando confirmação (grid fora do reticulado, reorganização) e as caixas guardadas não mudam. */
  applyScan(scan: GridScan, labels: Labels, nowMs: number): boolean {
    if (this.offLattice(scan.geometry)) {
      // a rolagem é animada: no meio dela o grid aparece fração de linha fora do lugar (ou é lido com
      // meia célula). Só vale se a próxima leitura confirmar (um aviso no topo da tela empurra o
      // painel e continua assim)
      const g = scan.geometry
      const pending = this.pendingGeometry
      const confirmed =
        pending !== null && Math.abs(pending.y0 - g.y0) <= PHASE_TOL * g.pitch && Math.abs(pending.pitch - g.pitch) <= PITCH_TOL * g.pitch
      if (!confirmed) {
        this.pendingGeometry = g
        this.lastSeen = nowMs
        return false
      }
    }
    this.pendingGeometry = null
    if (this.prevScan !== null) {
      const k = estimateRowShift(this.prevScan.boxes, scan.boxes)
      if (k !== null) this.rowOffset -= k
      else this.relocate(scan, this.prevScan)
    }
    this.prevScan = scan
    this.geometry = scan.geometry
    this.lastSeen = nowMs

    const off = this.rowOffset
    const top = off
    const bottom = off + scan.geometry.rows
    const uncertain = new Set([...scan.uncertain].map((key) => {
      const [c, r] = parseCellKey(key)
      return cellKey(c, r + off)
    }))
    const inView = new Map<string, TrackedBox>()
    for (const [k, b] of this.boxes) {
      const cells = b.cells()
      if ([...cells].every((key) => top <= rowOfKey(key) && rowOfKey(key) < bottom) && !intersects(cells, uncertain)) inView.set(k, b)
    }
    const conflicts = this.conflicts(scan, inView)
    if (conflicts >= REFLOW_MIN_CONFLICTS) {
      // alguém comprou uma caixa e o vendedor reempacotou o estoque. Só se refaz com uma leitura
      // limpa (sem tooltip escondendo caixas) e confirmada pela seguinte
      const layout = scan.boxes
        .map((b) => `${b.col},${b.row},${b.w},${b.h},${b.clipped}`)
        .sort()
        .join(';')
      if (scan.uncertain.size > 0 || layout !== this.pendingLayout) {
        this.pendingLayout = scan.uncertain.size > 0 ? null : layout
        return false
      }
      this.pendingLayout = null
      this.realign(scan, labels, nowMs)
      return true
    }
    this.pendingLayout = null
    for (const b of this.boxes.values()) {
      if (intersects(b.cells(), uncertain)) b.seenAt = nowMs // coberta (tooltip, arrasto) conta como vista: não perde a tolerância
    }
    const keep = new Set<string>()
    const consumed = new Set<string>()
    const added: TrackedBox[] = []

    // 1ª passada: caixas que continuam no lugar. Só depois se procura de onde veio uma caixa nova,
    // para que uma caixa ainda no lugar nunca seja tomada como a "caixa movida".
    const fresh: TrackedBox[] = []
    for (const rect of scan.boxes) {
      const nw = new TrackedBox(rect.col, rect.row + off, rect.w, rect.h, rect.clipped, {
        label: labels.get(cellKey(rect.col, rect.row)) ?? null,
        seenAt: nowMs,
      })
      if (nw.clipped) {
        // vista parcial de uma caixa já conhecida inteira: mantém a conhecida
        const nwCells = nw.cells()
        let full: TrackedBox | undefined
        for (const b of this.boxes.values()) {
          if (!b.clipped && intersects(b.cells(), nwCells)) {
            full = b
            break
          }
        }
        if (full !== undefined) {
          full.seenAt = nowMs
          keep.add(full.key)
          continue
        }
      }
      const old = inView.get(nw.key)
      if (
        old !== undefined &&
        old.w === nw.w &&
        old.h === nw.h &&
        old.clipped === nw.clipped &&
        !(old.stale && old.label !== null && nw.label !== null && old.label !== nw.label)
      ) {
        old.label = old.label || nw.label
        old.seenAt = nowMs
        old.stale = false // de volta à vista, igual: a reorganização não a alcançou
        keep.add(old.key)
        continue
      }
      fresh.push(nw)
    }

    // 2ª passada: caixa nova herda os dados de uma caixa cortada ou de uma que sumiu do lugar
    for (const nw of fresh) {
      const nwCells = nw.cells()
      let donor: TrackedBox | undefined
      for (const b of this.boxes.values()) {
        if (b.clipped && !consumed.has(b.key) && !keep.has(b.key) && intersects(b.cells(), nwCells) && (b.label === null || nw.label === null || b.label === nw.label)) {
          donor = b
          break
        }
      }
      if (donor === undefined && nw.label !== null) {
        for (const [k, b] of inView) {
          if (!keep.has(k) && !consumed.has(k) && k !== nw.key && b.hasData && b.label === nw.label && b.w === nw.w && b.h === nw.h) {
            donor = b
            break
          }
        }
      }
      if (donor !== undefined) {
        nw.takeDataFrom(donor)
        consumed.add(donor.key)
      } else {
        this.restore(nw, nowMs)
      }
      added.push(nw)
    }

    // caixa sumida com o lugar vazio: provavelmente está sendo arrastada e vai voltar
    const occupied = new Set<string>()
    for (const r of scan.boxes) for (const [c, row] of boxCells(r)) occupied.add(cellKey(c, row + off))
    for (const [k, gone] of [...inView]) {
      if (keep.has(k)) continue
      if (!consumed.has(k) && !intersects(gone.cells(), occupied) && nowMs - gone.seenAt < VANISH_GRACE_MS) continue
      this.forget(k, nowMs)
    }
    for (const k of consumed) this.boxes.delete(k)
    for (const nw of added) {
      if (!nw.clipped) {
        const nwCells = nw.cells()
        for (const k of [...this.boxes.keys()]) {
          if (intersects(this.boxes.get(k)!.cells(), nwCells)) this.forget(k, nowMs)
        }
      }
      this.boxes.set(nw.key, nw)
    }
    return true
  }

  /** Caixas inteiras do scan que caem sobre caixas guardadas de outra forma ou em outro lugar. */
  private conflicts(scan: GridScan, inView: ReadonlyMap<string, TrackedBox>): number {
    const off = this.rowOffset
    const stored = [...inView.values()].filter((b) => !b.clipped).map((b) => b.cells())
    let n = 0
    for (const rect of scan.boxes) {
      if (rect.clipped) continue
      const old = inView.get(cellKey(rect.col, rect.row + off))
      if (old !== undefined && old.w === rect.w && old.h === rect.h) continue
      const cells = new Set(boxCells(rect).map(([c, r]) => cellKey(c, r + off)))
      if (stored.some((s) => intersects(s, cells))) n++
    }
    return n
  }

  /** Estoque reorganizado: cada caixa vista herda os dados da guardada de onde veio, se for certa.
   *
   * Caixas guardadas à vista que não acharam lugar foram compradas, ou ficaram ambíguas: saem. As de
   * fora da vista ficam, marcadas como de posição incerta até voltarem à vista. */
  private realign(scan: GridScan, labels: Labels, nowMs: number): void {
    const off = this.rowOffset
    const top = off
    const bottom = off + scan.geometry.rows
    const fresh = scan.boxes.map(
      (r) => new TrackedBox(r.col, r.row + off, r.w, r.h, r.clipped, { label: labels.get(cellKey(r.col, r.row)) ?? null, seenAt: nowMs }),
    )
    const whole = fresh.filter((b) => !b.clipped)
    const stored = [...this.boxes.values()].filter((b) => !b.clipped)
    const moved = new Set<number>()
    for (const size of new Set(whole.map((b) => `${b.w},${b.h}`))) {
      const nw = whole.filter((b) => `${b.w},${b.h}` === size).sort(readingOrder)
      const old = stored.filter((b) => `${b.w},${b.h}` === size).sort(readingOrder)
      const sources = align(old, nw, top, bottom, top > 0)
      nw.forEach((box, i) => {
        const src = sources[i]
        if (src !== null) {
          box.takeDataFrom(old[src])
          moved.add(old[src].uid)
        }
      })
    }

    const kept = new Map<string, TrackedBox>()
    for (const b of this.boxes.values()) {
      if (moved.has(b.uid) || [...b.cells()].every((key) => top <= rowOfKey(key) && rowOfKey(key) < bottom)) continue
      b.stale = true
      kept.set(b.key, b)
    }
    for (const nw of fresh) {
      const nwCells = nw.cells()
      if (nw.clipped && [...kept.values()].some((b) => intersects(b.cells(), nwCells))) continue // pedaço de uma caixa guardada que continua além da vista
      for (const [k, b] of [...kept]) if (intersects(b.cells(), nwCells)) kept.delete(k)
      kept.set(nw.key, nw)
    }
    this.boxes = kept
    this.removed.clear() // as posições mudaram: nada volta pelo lugar
  }
}
