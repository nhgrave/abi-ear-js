import { expect, it } from 'vitest'
import { TrackedBox, VendorSession } from './session'
import { cellKey, type BoxRect, type GridGeometry, type GridScan } from './vision/types'

const GEOM: GridGeometry = { x0: 0, y0: 0, pitch: 64, cols: 9, rows: 6 }

const makeScan = (boxes: BoxRect[], uncertain: [number, number][] = [], geometry = GEOM): GridScan => ({
  geometry,
  boxes,
  uncertain: new Set(uncertain.map(([c, r]) => cellKey(c, r))),
  overlays: [],
})

const box = (col: number, row: number, w: number, h: number, clipped = false): BoxRect => ({ col, row, w, h, clipped })
const A = box(0, 0, 2, 2)
const B = box(2, 0, 1, 2)
const C = box(3, 1, 3, 2)
const D = box(0, 3, 1, 1)
const E = box(6, 2, 2, 3)
const LAYOUT = [A, B, C, D, E]
const labelMap = (entries: [number, number, string][]) => new Map<string, string | null>(entries.map(([c, r, l]) => [cellKey(c, r), l]))
const LABELS = labelMap([[0, 0, 'Computer Parts'], [2, 0, 'Collectibles'], [3, 1, 'Mystery Cargo'], [0, 3, 'Electronics'], [6, 2, 'Tools']])
const NONE = new Map<string, string | null>()
const shifted = (boxes: BoxRect[], k: number) => boxes.map((b) => ({ ...b, row: b.row + k }))
const hit = (soundId: number, score: number) => ({ soundId, score })
const get = (s: VendorSession, key: string) => s.boxes.get(key)!

it('click just past the side edge counts in the edge column', () => {
  const s = new VendorSession()
  s.applyScan(makeScan([box(0, 0, 1, 1), box(8, 0, 1, 1)]), NONE, 0)
  expect(s.boxAtScreen(9 * 64 + 2, 10)!.key).toBe('8,0') // x0 lido 2 px à esquerda do real
  expect(s.boxAtScreen(-2, 10)!.key).toBe('0,0')
  expect(s.boxAtScreen(9 * 64 + 20, 10)).toBeNull() // já é a barra de rolagem
})

it('first scan adds boxes with labels', () => {
  const s = new VendorSession()
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  expect(new Set(s.boxes.keys())).toEqual(new Set(['0,0', '2,0', '3,1', '0,3', '6,2']))
  expect(get(s, '0,0').label).toBe('Computer Parts')
  expect(get(s, '0,0').size).toEqual([2, 2])
})

it('click lookup', () => {
  // o preço (set_price_at) não existe na v0.1: só a busca por clique
  const s = new VendorSession()
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  expect(s.boxAtScreen(100, 100)!.key).toBe('0,0') // célula (1, 1) pertence à caixa A
  expect(s.boxAtScreen(9 * 64 + 5, 5)).toBeNull()
})

it('scroll keeps results and grows grid', () => {
  const s = new VendorSession()
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  get(s, '0,3').addHits([hit(10, 0.9)])
  // usuário rolou 2 linhas para baixo: tudo sobe 2 linhas na tela; uma caixa nova aparece embaixo
  const newBottom = box(4, 4, 2, 2)
  const curr = [...shifted(LAYOUT, -2).filter((b) => b.row >= 0), newBottom]
  const labels = new Map<string, string | null>(curr.map((b) => [cellKey(b.col, b.row), LABELS.get(cellKey(b.col, b.row + 2)) ?? null]))
  s.applyScan(makeScan(curr), labels, 500)
  expect(s.rowOffset).toBe(2)
  expect(get(s, '0,3').picks).toBe(1) // resultado preservado
  expect(s.boxes.has('4,6')).toBe(true) // caixa nova em linha de conteúdo 6
  expect(s.boxes.has('0,0')).toBe(true) // caixa fora de vista continua guardada
  expect(s.rowExtent()).toEqual([0, 8])
})

it('moved box carries its result', () => {
  const s = new VendorSession()
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  get(s, '0,0').addHits([hit(12, 0.95)])
  const moved = box(0, 4, 2, 2) // A foi arrastada para baixo
  s.applyScan(makeScan([B, C, D, E, moved]), new Map([...LABELS, [cellKey(0, 4), 'Computer Parts']]), 500)
  expect(s.boxes.has('0,0')).toBe(false)
  expect(get(s, '0,4').picks).toBe(1)
  expect(get(s, '0,4').hits()[0].soundId).toBe(12)
})

it('clipped box becomes full and keeps data', () => {
  const s = new VendorSession()
  const clipped = box(0, 5, 3, 1, true)
  s.applyScan(makeScan([...LAYOUT, clipped]), new Map([...LABELS, [cellKey(0, 5), 'Mystery Cargo']]), 0)
  expect(get(s, '0,5').size).toBeNull()
  get(s, '0,5').addHits([hit(1, 0.8)])
  // rolou 1 linha: a caixa aparece inteira (3x2) nas linhas de tela 4-5
  const curr = [...shifted(LAYOUT, -1).filter((b) => b.row >= 0), box(0, 4, 3, 2)]
  s.applyScan(makeScan(curr), labelMap([[0, 4, 'Mystery Cargo']]), 500)
  const full = get(s, '0,5')
  expect(full.size).toEqual([3, 2])
  expect(full.picks).toBe(1)
})

it('clipped view of known box does not replace it', () => {
  const s = new VendorSession()
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  get(s, '6,2').addHits([hit(18, 0.9)])
  // rolou 3 linhas: E (linhas 2-4) aparece cortada no topo (linhas de tela 0-1)
  const curr = [box(6, 0, 2, 2, true), box(0, 0, 1, 1), box(3, 2, 2, 2), box(5, 3, 2, 1)]
  s['prevScan'] = null // layout novo demais para estimar; fixa o deslocamento conhecido
  s.rowOffset = 3
  s.applyScan(makeScan(curr), NONE, 500)
  expect(get(s, '6,2').picks).toBe(1)
  expect(get(s, '6,2').size).toEqual([2, 3])
})

it('box under tooltip is not dropped', () => {
  const s = new VendorSession()
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  get(s, '3,1').addHits([hit(1, 0.9)])
  const covered: [number, number][] = [[3, 1], [4, 1], [5, 1], [3, 2], [4, 2], [5, 2], [6, 2]]
  s.applyScan(makeScan([A, B, D], covered), LABELS, 500)
  expect(get(s, '3,1').picks).toBe(1)
})

it('box that disappears is removed', () => {
  const s = new VendorSession()
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  s.applyScan(makeScan([A, B, C, E]), LABELS, 500) // D foi comprada/vendida
  s.applyScan(makeScan([A, B, C, E]), LABELS, 3000)
  expect(s.boxes.has('0,3')).toBe(false)
})

it('box missing while dragged keeps its result', () => {
  // sem o botão do mouse não dá para pausar a leitura durante o arrasto: a caixa pega some por um instante
  const s = new VendorSession()
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  get(s, '0,3').addHits([hit(1, 0.9)])
  s.applyScan(makeScan([A, B, C, E]), LABELS, 500)
  expect(s.boxAtScreen(10, 3 * 64 + 10)).toBe(get(s, '0,3'))
  s.applyScan(makeScan(LAYOUT), NONE, 1000) // devolvida ao lugar
  expect(get(s, '0,3').picks).toBe(1)
})

it('missing box whose place is taken is removed at once', () => {
  const s = new VendorSession()
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  s.applyScan(makeScan([A, B, C, E, box(0, 3, 2, 1)]), NONE, 500)
  expect(get(s, '0,3').w).toBe(2)
})

it('expiry', () => {
  const s = new VendorSession()
  expect(s.isExpired(100000)).toBe(false)
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  expect(s.isExpired(9900)).toBe(false)
  expect(s.isExpired(10100)).toBe(true)
})

it('tracked box hits average', () => {
  const b = new TrackedBox(0, 0, 1, 1)
  b.addHits([hit(1, 0.8), hit(2, 0.7)])
  b.addHits([hit(1, 0.9)])
  b.addHits([])
  expect(b.picks).toBe(3)
  expect(b.hits().map((h) => [h.soundId, Math.round(h.score * 100) / 100])).toEqual([[1, 0.85], [2, 0.7]])
})

it('new twin does not steal result of box still in place', () => {
  const geom = { x0: 0, y0: 0, pitch: 64, cols: 9, rows: 4 }
  const s = new VendorSession()
  const layout = [box(0, 0, 1, 2), box(1, 0, 2, 1), box(3, 0, 1, 1), box(4, 1, 2, 2), box(0, 2, 1, 1)]
  const labels = labelMap([[0, 0, 'Mystery Cargo'], [1, 0, 'Tools'], [3, 0, 'Paper'], [4, 1, 'Computer Parts'], [0, 2, 'Paper']])
  s.applyScan(makeScan(layout, [], geom), labels, 0)
  get(s, '0,0').addHits([hit(31, 0.9)])
  // rolou 2 linhas para cima: aparece no topo outra "Mystery Cargo" 1x2, nunca vista
  const up = [box(7, 0, 1, 2), ...layout.filter((b) => b.row + 2 + b.h <= 4).map((b) => ({ ...b, row: b.row + 2 }))]
  const upLabels = new Map<string, string | null>([[cellKey(7, 0), 'Mystery Cargo']])
  for (const [k, v] of labels) {
    const [c, r] = k.split(',').map(Number)
    upLabels.set(cellKey(c, r + 2), v)
  }
  s.applyScan(makeScan(up, [], geom), upLabels, 500)
  expect(s.rowOffset).toBe(-2)
  expect(get(s, '0,0').picks).toBe(1)
  expect(get(s, '7,-2').picks).toBe(0)
})

// Conteúdo pseudoaleatório fixo com caixas 1x1, 1x2, 2x1 e 2x2 (sem periodicidade): gerado pelo
// _content() do teste Python (random.Random(3), 30 linhas, 9 colunas), já que o Mersenne Twister não existe no JS.
const CONTENT: [number, number, number, number][] = [[0,0,1,2],[1,0,1,2],[2,0,2,1],[4,0,2,2],[6,0,1,1],[7,0,1,1],[8,0,1,1],[2,1,2,1],[6,1,1,2],[7,1,1,2],[8,1,1,1],[0,2,2,2],[2,2,2,2],[4,2,1,2],[5,2,1,2],[8,2,1,2],[6,3,2,2],[0,4,1,1],[1,4,1,1],[2,4,1,2],[3,4,1,1],[4,4,2,1],[8,4,1,1],[0,5,2,1],[3,5,2,2],[5,5,2,2],[7,5,2,2],[0,6,2,2],[2,6,1,1],[2,7,1,2],[3,7,2,1],[5,7,1,1],[6,7,1,1],[7,7,1,2],[8,7,1,1],[0,8,1,2],[1,8,1,1],[3,8,2,2],[5,8,2,1],[8,8,1,1],[1,9,2,2],[5,9,2,1],[7,9,2,2],[0,10,1,2],[3,10,2,1],[5,10,1,1],[6,10,1,1],[1,11,1,2],[2,11,2,1],[4,11,1,1],[5,11,1,2],[6,11,2,1],[8,11,1,1],[0,12,1,1],[2,12,1,1],[3,12,2,2],[6,12,2,2],[8,12,1,1],[0,13,2,1],[2,13,1,1],[5,13,1,1],[8,13,1,2],[0,14,1,1],[1,14,2,1],[3,14,2,2],[5,14,2,2],[7,14,1,1],[0,15,1,1],[1,15,1,1],[2,15,1,1],[7,15,2,1],[0,16,2,1],[2,16,1,2],[3,16,1,1],[4,16,2,1],[6,16,1,1],[7,16,1,1],[8,16,1,1],[0,17,1,1],[1,17,1,2],[3,17,2,2],[5,17,2,1],[7,17,2,1],[0,18,1,2],[2,18,1,1],[5,18,2,1],[7,18,2,1],[1,19,2,1],[3,19,1,2],[4,19,2,2],[6,19,2,2],[8,19,1,1],[0,20,2,2],[2,20,1,1],[8,20,1,1],[2,21,2,2],[4,21,1,2],[5,21,2,1],[7,21,2,2],[0,22,2,1],[5,22,2,1],[0,23,2,1],[2,23,1,1],[3,23,2,2],[5,23,2,1],[7,23,1,1],[8,23,1,1],[0,24,1,2],[1,24,1,1],[2,24,1,1],[5,24,2,2],[7,24,2,1],[1,25,2,1],[3,25,2,1],[7,25,2,2],[0,26,1,1],[1,26,1,1],[2,26,1,1],[3,26,2,1],[5,26,2,1],[0,27,2,2],[2,27,2,1],[4,27,2,1],[6,27,1,2],[7,27,2,1],[2,28,1,2],[3,28,2,1],[5,28,1,1],[7,28,2,1],[0,29,2,1],[3,29,2,2],[5,29,1,1],[6,29,1,1],[7,29,1,2],[8,29,1,1]]

function view(content: [number, number, number, number][], top: number, rows = 10): GridScan {
  const boxes: BoxRect[] = []
  for (const [c, r, w, h] of content) {
    const a = Math.max(r, top)
    const b = Math.min(r + h, top + rows)
    if (a < b) boxes.push({ col: c, row: a - top, w, h: b - a, clipped: a !== r || b !== r + h })
  }
  boxes.sort((x, y) => x.row - y.row || x.col - y.col)
  return { geometry: { x0: 0, y0: 0, pitch: 64, cols: 9, rows }, boxes, uncertain: new Set(), overlays: [] }
}

it('big jump back to seen rows is anchored on stored layout', () => {
  const s = new VendorSession()
  for (const top of [0, 3, 6, 9, 10]) s.applyScan(view(CONTENT, top), NONE, top * 1000) // rolagem suave: cada passo é rastreado
  expect(s.rowOffset).toBe(10)
  for (const b of s.boxes.values()) b.addHits([hit(1, 0.9)])
  s.applyScan(view(CONTENT, 0), NONE, 20000) // arrastou a barra até o topo: sem scans no meio
  expect(s.rowOffset).toBe(0)
  const full = CONTENT.filter(([, r, , h]) => r + h <= 20).map(([c, r]) => cellKey(c, r))
  expect(full.every((k) => s.boxes.get(k)!.picks === 1)).toBe(true)
})

it('big jump to unseen rows keeps stored results', () => {
  const s = new VendorSession()
  s.applyScan(view(CONTENT, 0), NONE, 0)
  for (const b of s.boxes.values()) b.addHits([hit(1, 0.9)])
  const known = [...s.boxes].filter(([, b]) => !b.clipped).map(([k]) => k)
  s.applyScan(view(CONTENT, 12), NONE, 500) // pulou 12 linhas para conteúdo nunca visto
  expect(known.every((k) => s.boxes.has(k) && s.boxes.get(k)!.picks === 1)).toBe(true)
  expect(s.rowOffset).toBeGreaterThanOrEqual(10)
  expect(s.boxAtScreen(5, 5)).not.toBeNull()
  expect(s.boxAtScreen(5, 5)!.picks).toBe(0)
})

it('big jump partly overlapping seen rows lands on true offset', () => {
  for (const jump of [6, 8]) {
    const s = new VendorSession()
    s.applyScan(view(CONTENT, 0), NONE, 0)
    for (const b of s.boxes.values()) b.addHits([hit(1, 0.9)])
    s.applyScan(view(CONTENT, jump), NONE, 500)
    expect(s.rowOffset).toBe(jump)
    const full = CONTENT.filter(([, r, , h]) => r + h <= 10).map(([c, r]) => cellKey(c, r))
    expect(full.every((k) => s.boxes.get(k)!.picks === 1)).toBe(true)
  }
})

it('box back after a long drag gets its result back', () => {
  const s = new VendorSession()
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  get(s, '0,3').addHits([hit(1, 0.9)])
  s.applyScan(makeScan([A, B, C, E]), LABELS, 500)
  s.applyScan(makeScan([A, B, C, E]), LABELS, 6000) // segurou a caixa por segundos
  expect(s.boxes.has('0,3')).toBe(false)
  s.applyScan(makeScan(LAYOUT), LABELS, 8000) // devolvida ao lugar
  expect(get(s, '0,3').picks).toBe(1)
})

it('result is not restored onto a different box', () => {
  const s = new VendorSession()
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  get(s, '0,3').addHits([hit(1, 0.9)])
  s.applyScan(makeScan([A, B, C, E]), LABELS, 6000)
  const other = new Map([...LABELS, [cellKey(0, 3), 'Tools']]) // outra caixa no lugar (estoque mudou)
  s.applyScan(makeScan(LAYOUT), other, 8000)
  expect(get(s, '0,3').picks).toBe(0)
})

it('box long under tooltip still gets the drag grace', () => {
  const s = new VendorSession()
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  for (const t of [500, 1000, 1500, 2000, 2500, 3000]) s.applyScan(makeScan([A, B, C, E], [[0, 3]]), LABELS, t) // mouse parado sobre D: tooltip por 3 s
  s.applyScan(makeScan([A, B, C, E]), LABELS, 3500) // pegou D: o lugar fica vazio
  expect(s.boxes.has('0,3')).toBe(true)
})

it('scan read with half cells is not applied', () => {
  // no meio da rolagem o grid foi lido com meia célula: as linhas viram o dobro e o deslocamento pula
  const s = new VendorSession()
  s.applyScan(makeScan(LAYOUT), LABELS, 0)
  const half = { x0: 0, y0: 0, pitch: 32, cols: 18, rows: 12 }
  s.applyScan(makeScan([box(0, 10, 4, 4), box(4, 10, 4, 4)], [], half), NONE, 500)
  expect(s.rowOffset).toBe(0)
  expect(s.geometry!.pitch).toBe(64)
  const sortKeys = (xs: [number, number][]) => xs.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  expect(sortKeys([...s.boxes.values()].map((b): [number, number] => [b.col, b.row]))).toEqual(sortKeys(LAYOUT.map((b): [number, number] => [b.col, b.row])))
  s.applyScan(makeScan(LAYOUT), LABELS, 1000)
  expect(s.rowOffset).toBe(0)
  expect(get(s, '0,0').label).toBe('Computer Parts')
})
