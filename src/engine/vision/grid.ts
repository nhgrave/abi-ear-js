/** Detecção do grid do vendedor e das caixas, independente de resolução (abi_ear/vision/grid.py).
 *
 * Porte linha a linha, sem opencv: as máscaras são Uint8Array (0/1) do tamanho da imagem, e os recortes
 * seguem o fatiamento do numpy (índice negativo conta a partir do fim, limites presos à imagem). */
import { crop, type Gray } from './image'
import { cellAt, cellKey, cellOrigin, pyRound, type BoxRect, type GridGeometry, type GridScan, type Rect } from './types'

export * from './types'

export const BRIGHT = 40 // bordas de caixa: cinza acima disso = linha/texto; fundo das caixas fica em ~10-30
export const LINE_MIN = 25 // reticulado: cinza mínimo de uma linha
// reticulado: quanto a linha é mais clara que o fundo ao lado. Divisória entre células vazias ~40 sobre ~3
// (no limite de BRIGHT), borda de caixa ~67 sobre ~18; linhas internas apagadas de uma caixa (~22 sobre ~18)
// não contam
export const LINE_CONTRAST = 15
export const MIN_PITCH = 20
export const MAX_PITCH = 300
export const LATTICE_TOL = 3 // px de tolerância para uma linha "cair" no reticulado
export const MAX_LINE_GAP = 3 // caixas de até 3 células escondem até 2 linhas internas
export const EDGE_FILL = 0.6 // fração da borda coberta por linha para considerá-la presente
export const EMPTY_STD = 6.0 // desvio-padrão abaixo disso = célula vazia
export const MIN_COLS = 4
export const OVERLAY_BRIGHT = 110 // cantoneiras do tooltip (~130-180); linhas do grid não passam de ~90
export const TOOLTIP_MAX_W = 6 // tamanho máximo do tooltip, em células
export const TOOLTIP_MAX_H = 3
export const TOOLTIP_W = 3.5 // tamanho típico (rótulo longo), para um tooltip cortado pela imagem
export const TOOLTIP_H = 1.5
export const TOOLTIP_DARK = 10 // fundo do tooltip é quase preto (mediana ~3); caixas ~20, desenho de item revelado mais
export const TRACK_PITCH = 0.1 // com o vendedor já conhecido, procura primeiro um grid com a célula dele (±10%)...
export const TRACK_X = 0.25 // ...que comece na mesma coluna da tela (fração de célula)
export const PITCH_TOL = 2.0 // px de erro por célula ao explicar um vão entre linhas
export const MULTIPLE_SHARE = 0.75 // candidato maior que explica esta fração dos vãos do melhor é o pitch real

type Mask = Uint8Array
type Span = [number, number] // [início, fim) já resolvido

// ---------------------------------------------------------------------------------------------------------
// semântica do Python/numpy

/** Fatia `a[start:stop]` de um eixo de tamanho `len`, como o Python: negativo conta do fim, limites presos. */
function pySlice(start: number, stop: number, len: number): Span {
  const fix = (i: number) => (i < 0 ? Math.max(0, i + len) : Math.min(i, len))
  const a = fix(start)
  return [a, Math.max(a, fix(stop))]
}

/** `a % m` do Python para floats (resultado com o sinal de m). */
function pyMod(a: number, m: number): number {
  const r = a % m
  return r !== 0 && r < 0 !== m < 0 ? r + m : r
}

/** Soma em pares do numpy (np.add.reduce em float64), para que np.mean dê o mesmo último bit. */
function pairwiseSum(a: number[], lo: number, n: number): number {
  if (n < 8) {
    let res = 0
    for (let i = 0; i < n; i++) res += a[lo + i]
    return res
  }
  if (n <= 128) {
    const r = a.slice(lo, lo + 8)
    let i = 8
    for (; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] += a[lo + i + j]
    let res = (r[0] + r[1] + (r[2] + r[3])) + (r[4] + r[5] + (r[6] + r[7]))
    for (; i < n; i++) res += a[lo + i]
    return res
  }
  let n2 = Math.floor(n / 2)
  n2 -= n2 % 8
  return pairwiseSum(a, lo, n2) + pairwiseSum(a, lo + n2, n - n2)
}

function npMean(a: number[]): number {
  return (0 + pairwiseSum(a, 0, a.length)) / a.length
}

/** np.median de um recorte de uint8, pelo histograma. */
function median(gray: Gray, rows: Span, cols: Span): number {
  const hist = new Uint32Array(256)
  const { w, data } = gray
  for (let y = rows[0]; y < rows[1]; y++) for (let i = y * w + cols[0], end = y * w + cols[1]; i < end; i++) hist[data[i]]++
  const n = (rows[1] - rows[0]) * (cols[1] - cols[0])
  const at = (rank: number) => {
    let acc = 0
    for (let v = 0; v < 256; v++) if ((acc += hist[v]) > rank) return v
    return 255
  }
  return n % 2 ? at(n >> 1) : (at(n / 2 - 1) + at(n / 2)) / 2
}

/** Desvio-padrão populacional (ndarray.std()) de um recorte. */
function std(gray: Gray, rows: Span, cols: Span): number {
  const { w, data } = gray
  const n = (rows[1] - rows[0]) * (cols[1] - cols[0])
  let sum = 0
  for (let y = rows[0]; y < rows[1]; y++) for (let i = y * w + cols[0], end = y * w + cols[1]; i < end; i++) sum += data[i]
  const mean = sum / n
  let sq = 0
  for (let y = rows[0]; y < rows[1]; y++) {
    for (let i = y * w + cols[0], end = y * w + cols[1]; i < end; i++) {
      const d = data[i] - mean
      sq += d * d
    }
  }
  return Math.sqrt(sq / n)
}

/** band.any(axis=1).mean(): fração das linhas do recorte com algum pixel aceso (-1 se o recorte é vazio). */
function rowsWithAny(mask: Mask, w: number, rows: Span, cols: Span): number {
  if (rows[1] <= rows[0] || cols[1] <= cols[0]) return -1
  let n = 0
  for (let y = rows[0]; y < rows[1]; y++) {
    for (let i = y * w + cols[0], end = y * w + cols[1]; i < end; i++) {
      if (mask[i]) {
        n++
        break
      }
    }
  }
  return n / (rows[1] - rows[0])
}

/** band.any(axis=0).mean(): fração das colunas do recorte com algum pixel aceso (-1 se o recorte é vazio). */
function colsWithAny(mask: Mask, w: number, rows: Span, cols: Span): number {
  if (rows[1] <= rows[0] || cols[1] <= cols[0]) return -1
  let n = 0
  for (let x = cols[0]; x < cols[1]; x++) {
    for (let y = rows[0]; y < rows[1]; y++) {
      if (mask[y * w + x]) {
        n++
        break
      }
    }
  }
  return n / (cols[1] - cols[0])
}

// ---------------------------------------------------------------------------------------------------------
// morfologia (no lugar de cv2.morphologyEx e cv2.erode)

/** cv2.morphologyEx(MORPH_OPEN) com retângulo 1×n ao longo de um eixo: erosão e depois dilatação, âncora em
 * a = n//2 (janela [i - a, i - a + n - 1] nas duas). Fora da imagem não conta: na erosão a borda vale o máximo,
 * na dilatação o mínimo.
 *
 * Feito por trechos acesos (as máscaras de linha são esparsas), com o mesmo resultado: num trecho máximo [s, e)
 * de uma linha de `len` pixels, a erosão acende i em [s + a, e + a - n] (sem o limite do lado em que o trecho
 * encosta na borda), e a dilatação acende [j - n + a + 1, j + a] para cada j da erosão. */
function openRun(dst: Mask, s: number, e: number, n: number, len: number, at: (i: number) => number): void {
  const a = n >> 1
  const eLo = s === 0 ? 0 : s + a
  const eHi = e === len ? len - 1 : Math.min(e - 1, e + a - n)
  if (eHi < Math.max(eLo, s)) return
  const lo = Math.max(0, Math.max(eLo, s) - n + a + 1)
  const hi = Math.min(len - 1, eHi + a)
  for (let i = lo; i <= hi; i++) dst[at(i)] = 1
}

export function openHorizontal(src: Mask, w: number, h: number, n: number): Mask {
  const dst = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    const at = (i: number) => row + i
    let start = -1
    for (let x = 0; x < w; x++) {
      if (src[row + x]) {
        if (start < 0) start = x
      } else if (start >= 0) {
        openRun(dst, start, x, n, w, at)
        start = -1
      }
    }
    if (start >= 0) openRun(dst, start, w, n, w, at)
  }
  return dst
}

export function openVertical(src: Mask, w: number, h: number, n: number): Mask {
  const dst = new Uint8Array(w * h)
  const start = new Int32Array(w).fill(-1) // início do trecho aceso em andamento em cada coluna
  // linha a linha (acesso contínuo na memória); cada trecho vertical fecha quando a coluna apaga
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      if (src[row + x]) {
        if (start[x] < 0) start[x] = y
      } else if (start[x] >= 0) {
        openRun(dst, start[x], y, n, h, (i) => i * w + x)
        start[x] = -1
      }
    }
  }
  for (let x = 0; x < w; x++) if (start[x] >= 0) openRun(dst, start[x], h, n, h, (i) => i * w + x)
  return dst
}

// ---------------------------------------------------------------------------------------------------------
// reticulado

/** Pixels de linha com fundo mais escuro ao lado: [linhas verticais, linhas horizontais].
 *
 * bothSides=true exige fundo escuro dos dois lados: áreas claras preenchidas (abas, botões, tooltips) não
 * passam. Para checar bordas entre células usa-se false, porque o texto do rótulo pode encostar na linha de
 * um dos lados.
 *
 * contrast=true (achar o reticulado) compara com o vizinho: pega as divisórias fracas entre células vazias.
 * contrast=false (bordas das caixas) usa o brilho absoluto BRIGHT: o ícone do baú fica no centro da caixa,
 * em cima da divisória interna, e seus detalhes passariam por linha no critério de contraste. */
export function thinLineMasks(gray: Gray, bothSides = true, contrast = true): [Mask, Mask] {
  const { w, h, data: g } = gray
  const off = Math.max(3, pyRound(Math.min(h, w) / 360))
  const vert = new Uint8Array(w * h)
  const horiz = new Uint8Array(w * h)
  const min = contrast ? LINE_MIN : BRIGHT
  const offY = off * w
  for (let y = 0; y < h; y++) {
    const hasUp = y >= off
    const hasDown = y < h - off
    for (let x = 0, i = y * w; x < w; x++, i++) {
      const v = g[i]
      if (v <= min) continue
      const dim = contrast ? v - LINE_CONTRAST : BRIGHT // o vizinho precisa ficar abaixo disto
      const left = x >= off && g[i - off] <= dim
      const right = x < w - off && g[i + off] <= dim
      const up = hasUp && g[i - offY] <= dim
      const down = hasDown && g[i + offY] <= dim
      if (bothSides ? left && right : left || right) vert[i] = 1
      if (bothSides ? up && down : up || down) horiz[i] = 1
    }
  }
  return [vert, horiz]
}

/** mask.sum(axis=0): pixels acesos por coluna. */
function columnProfile(mask: Mask, w: number, h: number): Int32Array {
  const out = new Int32Array(w)
  for (let y = 0; y < h; y++) for (let x = 0, i = y * w; x < w; x++, i++) out[x] += mask[i]
  return out
}

/** mask[:, cols].sum(axis=1): pixels acesos por linha, só nas colunas dadas. */
function rowProfile(mask: Mask, w: number, h: number, cols: Span): Int32Array {
  const out = new Int32Array(h)
  for (let y = 0; y < h; y++) {
    let s = 0
    for (let i = y * w + cols[0], end = y * w + cols[1]; i < end; i++) s += mask[i]
    out[y] = s
  }
  return out
}

/** Linhas com pelo menos 2 segmentos mínimos e `relative` do comprimento da maior linha. */
function linePositions(profile: Int32Array, minLen: number, relative = 0.3): number[] {
  let max = 0
  for (const v of profile) if (v > max) max = v
  const threshold = Math.max(minLen * 2, relative * max)
  const groups: number[][] = []
  for (let i = 0; i < profile.length; i++) {
    if (profile[i] < threshold) continue
    const last = groups[groups.length - 1]
    if (last && i - last[last.length - 1] <= LATTICE_TOL) last.push(i)
    else groups.push([i])
  }
  return groups.map((g) => pyRound(npMean(g)))
}

/** Vãos que são 1..MAX_LINE_GAP células de `pitch`, convertidos para o tamanho de uma célula. */
function units(pitch: number, diffs: number[]): number[] {
  const out: number[] = []
  for (const d of diffs) {
    const k = pyRound(d / pitch)
    if (k >= 1 && k <= MAX_LINE_GAP && Math.abs(d / k - pitch) <= PITCH_TOL) out.push(d / k)
  }
  return out
}

/** Lado da célula que explica mais vãos entre linhas vizinhas nos dois eixos.
 *
 * O vão mais comum não serve: caixas altas ou largas escondem as linhas internas, e então quase todo vão
 * vizinho mede 2 células. Entre candidatos próximos fica o maior (metade do pitch explica os mesmos vãos). */
function pitchOf(xs: number[], ys: number[], lo = MIN_PITCH, hi = MAX_PITCH): number | null {
  const gaps = (ps: number[]) => ps.slice(1).map((b, i) => b - ps[i]).filter((d) => d >= MIN_PITCH)
  const dx = gaps(xs)
  const dy = gaps(ys)
  const candidates = new Set<number>()
  for (const d of [...dx, ...dy]) {
    for (let k = 1; k <= MAX_LINE_GAP; k++) if (lo <= d / k && d / k <= hi) candidates.add(d / k)
  }
  const scored: [number, number, number[]][] = []
  for (const c of candidates) {
    const ux = units(c, dx)
    const uy = units(c, dy)
    if (ux.length && uy.length) scored.push([ux.length + uy.length, c, [...ux, ...uy]])
  }
  if (!scored.length) return null
  // linhas soltas (bordas de tooltip) a meia célula fazem a metade do pitch explicar um vão a mais: fica o
  // maior candidato que explica quase tantos vãos quanto o melhor
  const top = Math.max(...scored.map(([n]) => n))
  let best: [number, number, number[]] | null = null
  for (const s of scored) if (s[0] >= MULTIPLE_SHARE * top && (best === null || s[1] > best[1])) best = s
  return npMean(best![2])
}

/** Origem e nº de células do maior trecho de linhas que caem no reticulado. */
function fit(positions: number[], pitch: number): [number, number] {
  // Counter(...).most_common(1): a fase mais frequente, a primeira vista no empate
  const counts = new Map<number, number>()
  for (const p of positions) {
    const ph = pyRound(pyMod(p, pitch))
    counts.set(ph, (counts.get(ph) ?? 0) + 1)
  }
  let phase = 0
  let most = 0
  for (const [ph, n] of counts) {
    if (n > most) {
      phase = ph
      most = n
    }
  }
  const off = (p: number) => {
    const d = pyMod(p - phase, pitch)
    return Math.min(d, pitch - d)
  }
  const idx = [...new Set(positions.filter((p) => off(p) <= LATTICE_TOL).map((p) => pyRound((p - phase) / pitch)))].sort((a, b) => a - b)
  let [bestA, bestB] = [idx[0], idx[0]]
  let curA = idx[0]
  let curB = idx[0]
  for (const i of idx.slice(1)) {
    if (i - curB <= MAX_LINE_GAP) curB = i
    else curA = curB = i
    if (curB - curA > bestB - bestA) [bestA, bestB] = [curA, curB]
  }
  return [phase + bestA * pitch, bestB - bestA]
}

/** Uma linha do grid tem divisórias verticais no reticulado; cabeçalhos e barras não têm. */
function rowHasCells(vert: Mask, w: number, h: number, x0: number, pitch: number, cols: number, yTop: number): boolean {
  const ya = Math.trunc(yTop + 0.2 * pitch)
  const yb = Math.trunc(yTop + 0.8 * pitch)
  const rows = pySlice(Math.max(0, ya), Math.max(0, yb), h)
  let hits = 0
  for (let c = 0; c <= cols; c++) {
    const x = pyRound(x0 + c * pitch)
    if (rowsWithAny(vert, w, rows, pySlice(Math.max(0, x - 2), x + 3, w)) > EDGE_FILL) hits++
  }
  return hits >= Math.max(2, 0.3 * (cols + 1))
}

export function detectGrid(gray: Gray, pitchRange: [number, number] = [MIN_PITCH, MAX_PITCH]): GridGeometry | null {
  const { w, h } = gray
  const minLen = Math.max(20, Math.floor(Math.min(h, w) / 30))
  const [thinV, thinH] = thinLineMasks(gray)
  const horiz = openHorizontal(thinH, w, h, minLen)
  const vert = openVertical(thinV, w, h, minLen)
  const xs = linePositions(columnProfile(vert, w, h), minLen)
  let ys = linePositions(rowProfile(horiz, w, h, [0, w]), minLen)
  const pitch = pitchOf(xs, ys, ...pitchRange)
  if (pitch === null) return null
  const [x0, cols] = fit(xs, pitch)
  // linhas horizontais só dentro da largura do grid: fora dele há barras da interface bem mais longas, e
  // dentro dele uma linha pode cruzar só 2 colunas (o resto fica escondido por caixas grandes)
  const inside = pySlice(Math.max(0, Math.trunc(x0)), Math.max(0, pyRound(x0 + cols * pitch)), w)
  const ysInside = linePositions(rowProfile(horiz, w, h, inside), minLen, 0.0)
  if (ysInside.length) ys = ysInside
  let [y0, rows] = fit(ys, pitch)
  const has = (yTop: number) => rowHasCells(vert, w, h, x0, pitch, cols, yTop)
  while (rows > 0 && !has(y0)) [y0, rows] = [y0 + pitch, rows - 1]
  while (rows > 0 && !has(y0 + (rows - 1) * pitch)) rows -= 1
  // linhas horizontais escondidas por caixas grandes (ou apagadas pelo realce do mouse) cortam o
  // reticulado; as divisórias verticais dizem onde o grid realmente continua
  if (rows > 0) {
    while (has(y0 + rows * pitch)) rows += 1
    while (has(y0 - pitch)) [y0, rows] = [y0 - pitch, rows + 1]
  }
  if (cols < MIN_COLS || rows < 1) return null
  return { x0, y0, pitch, cols, rows }
}

// ---------------------------------------------------------------------------------------------------------
// caixas

function verticalEdge(mask: Mask, gray: Gray, geom: GridGeometry, xLine: number, row: number): boolean {
  const ya = Math.trunc(geom.y0 + row * geom.pitch + geom.pitch * 0.2)
  const yb = Math.trunc(geom.y0 + row * geom.pitch + geom.pitch * 0.8)
  const hw = Math.max(2, pyRound(geom.pitch / 32)) // meia-largura da faixa onde a linha deve estar
  return rowsWithAny(mask, gray.w, pySlice(ya, yb, gray.h), pySlice(Math.max(0, xLine - hw), xLine + hw + 1, gray.w)) > EDGE_FILL
}

function horizontalEdge(mask: Mask, gray: Gray, geom: GridGeometry, yLine: number, col: number): boolean {
  const xa = Math.trunc(geom.x0 + col * geom.pitch + geom.pitch * 0.2)
  const xb = Math.trunc(geom.x0 + col * geom.pitch + geom.pitch * 0.8)
  const hw = Math.max(2, pyRound(geom.pitch / 32))
  return colsWithAny(mask, gray.w, pySlice(Math.max(0, yLine - hw), yLine + hw + 1, gray.h), pySlice(xa, xb, gray.w)) > EDGE_FILL
}

/** Retângulos de tooltip [x0, y0, x1, y1] sobre o grid: cantoneiras claras e finas em "L" no canto superior
 * esquerdo e no inferior direito. O tooltip esconde as divisórias e faria células vizinhas parecerem uma
 * caixa só. */
export function findOverlays(gray: Gray, geom: GridGeometry): Rect[] {
  const pitch = geom.pitch
  const { w, h } = gray
  // o tooltip nasce abaixo e à direita do cursor: sobre as últimas colunas/linhas, o canto inferior direito
  // fica além do grid
  const xa0 = Math.max(0, Math.trunc(geom.x0 - pitch))
  const ya0 = Math.max(0, Math.trunc(geom.y0 - pitch))
  const xb0 = Math.min(w, Math.trunc(geom.x0 + (geom.cols + TOOLTIP_MAX_W) * pitch))
  const yb0 = Math.min(h, Math.trunc(geom.y0 + (geom.rows + TOOLTIP_MAX_H) * pitch))
  const [sx0, sx1] = pySlice(xa0, xb0, w)
  const [sy0, sy1] = pySlice(ya0, yb0, h)
  const bw = sx1 - sx0
  const bh = sy1 - sy0
  if (bw <= 0 || bh <= 0) return []
  const bright = new Uint8Array(bw * bh)
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) bright[y * bw + x] = gray.data[(y + sy0) * w + x + sx0] > OVERLAY_BRIGHT ? 1 : 0
  const n = Math.max(6, pyRound(0.12 * pitch))
  const k = Math.max(2, pyRound(pitch / 32)) // o "L" é fino: o pixel na diagonal, para dentro do tooltip, é escuro
  // n pixels acesos seguidos a partir de (x, y) num sentido (fora da imagem conta como apagado), conferido só
  // nos candidatos a canto
  const run = (x: number, y: number, dx: number, dy: number): boolean => {
    const xe = x + dx * (n - 1)
    const ye = y + dy * (n - 1)
    if (xe < 0 || xe >= bw || ye < 0 || ye >= bh) return false
    for (let k = 0, i = y * bw + x, step = dy * bw + dx; k < n; k++, i += step) if (!bright[i]) return false
    return true
  }
  const tl: [number, number][] = [] // (y, x) na ordem de np.nonzero, só os 100 primeiros
  const br: [number, number][] = []
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = y * bw + x
      if (!bright[i]) continue
      if (tl.length < 100 && y < bh - k && x < bw - k && !bright[i + k * bw + k] && run(x, y, 1, 0) && run(x, y, 0, 1)) tl.push([y, x])
      if (br.length < 100 && y >= k && x >= k && !bright[i - k * bw - k] && run(x, y, -1, 0) && run(x, y, 0, -1)) br.push([y, x])
    }
  }

  // o todo e os cantos: um retângulo cortado pela imagem pode ser escuro só por cair fora do grid; a caixa
  // revelada (item à mostra sobre fundo roxo) tem borda clara com os mesmos cantos do tooltip, e o desenho
  // do item tem cantos claros que formariam um retângulo maior
  const darkMemo = new Map<string, boolean>()
  const dark = ([xa, ya, xb, yb]: Rect): boolean => {
    const key = `${xa},${ya},${xb},${yb}`
    let res = darkMemo.get(key)
    if (res === undefined) {
      const q = Math.trunc(pitch / 2)
      const parts: [Span, Span][] = [
        [pySlice(ya + 4, yb - 3, h), pySlice(xa + 4, xb - 3, w)],
        [pySlice(ya + 4, ya + 4 + q, h), pySlice(xa + 4, xa + 4 + q, w)],
        [pySlice(Math.max(0, yb - 3 - q), yb - 3, h), pySlice(Math.max(0, xb - 3 - q), xb - 3, w)],
      ]
      res = parts.every(([rows, cols]) => rows[1] > rows[0] && cols[1] > cols[0] && median(gray, rows, cols) <= TOOLTIP_DARK)
      darkMemo.set(key, res)
    }
    return res
  }

  const rects: Rect[] = []
  const cut: [number, number][] = []
  const same = (a: Rect, b: Rect) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
  for (const [ya, xa] of tl) {
    let best: [number, Rect] | null = null
    for (const [yb, xb] of br) {
      const rw = xb - xa
      const rh = yb - ya
      const rect: Rect = [xa + sx0, ya + sy0, xb + sx0, yb + sy0]
      if (1.2 * pitch <= rw && rw <= TOOLTIP_MAX_W * pitch && 0.7 * pitch <= rh && rh <= TOOLTIP_MAX_H * pitch &&
        (best === null || rw * rh > best[0]) && dark(rect)) {
        best = [rw * rh, rect]
      }
    }
    if (best !== null) {
      const rect = best[1]
      if (!rects.some((r) => same(r, rect))) rects.push(rect)
    } else {
      const x = xa + sx0
      const y = ya + sy0
      if (cellAt(geom, x, y) !== null && (x + TOOLTIP_W * pitch > w || y + TOOLTIP_H * pitch > h)) {
        cut.push([x, y]) // cortado pela borda da imagem (recorte): o canto de baixo não aparece
      }
    }
  }
  for (const [x, y] of cut) {
    const rect: Rect = [x, y, Math.min(w, Math.trunc(x + TOOLTIP_W * pitch)), Math.min(h, Math.trunc(y + TOOLTIP_H * pitch))]
    if (!rects.some(([xa, ya, xb, yb]) => xa <= x && x <= xb && ya <= y && y <= yb) && dark(rect)) {
      rects.push(rect) // (fora das letras do próprio tooltip)
    }
  }
  return rects
}

function coveredCells(geom: GridGeometry, rects: Rect[]): Set<string> {
  const cells = new Set<string>()
  for (const [xa, ya, xb, yb] of rects) {
    for (let c = 0; c < geom.cols; c++) {
      for (let r = 0; r < geom.rows; r++) {
        const x = geom.x0 + c * geom.pitch
        const y = geom.y0 + r * geom.pitch
        if (x < xb && xa < x + geom.pitch && y < yb && ya < y + geom.pitch) cells.add(cellKey(c, r))
      }
    }
  }
  return cells
}

/** Recorte do miolo de um retângulo de células (6 px para dentro); true se vazio ou liso. */
function innerIsEmpty(gray: Gray, geom: GridGeometry, col: number, row: number, wCells: number, hCells: number): boolean {
  const [xa, ya] = cellOrigin(geom, col, row)
  const rows = pySlice(ya + 6, Math.trunc(ya + hCells * geom.pitch) - 6, gray.h)
  const cols = pySlice(xa + 6, Math.trunc(xa + wCells * geom.pitch) - 6, gray.w)
  return rows[1] <= rows[0] || cols[1] <= cols[0] || std(gray, rows, cols) < EMPTY_STD
}

function cellIsEmpty(gray: Gray, geom: GridGeometry, col: number, row: number): boolean {
  return innerIsEmpty(gray, geom, col, row, 1, 1)
}

export function extractBoxes(gray: Gray, geom: GridGeometry): GridScan {
  const [thinV, thinH] = thinLineMasks(gray, false, false)
  const p = geom.pitch
  const { cols: nc, rows: nr } = geom
  const overlays = findOverlays(gray, geom)
  const covered = coveredCells(geom, overlays)
  const isCovered = (c: number, r: number) => covered.has(cellKey(c, r))
  const parent = new Int32Array(nc * nr).map((_, i) => i) // célula (c, r) no índice c * rows + r
  const find = (a: number) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }

  for (let c = 0; c < nc; c++) {
    for (let r = 0; r < nr; r++) {
      if (isCovered(c, r)) continue // sob o tooltip a borda está escondida: não junta com nada
      if (c + 1 < nc && !isCovered(c + 1, r) && !verticalEdge(thinV, gray, geom, pyRound(geom.x0 + (c + 1) * p), r)) {
        parent[find((c + 1) * nr + r)] = find(c * nr + r)
      }
      if (r + 1 < nr && !isCovered(c, r + 1) && !horizontalEdge(thinH, gray, geom, pyRound(geom.y0 + (r + 1) * p), c)) {
        parent[find(c * nr + r + 1)] = find(c * nr + r)
      }
    }
  }

  // vizinhas do tooltip: a borda dele pode cair sobre uma divisória e parecer borda de caixa, ou a caixa pode
  // continuar por baixo; nenhuma leitura delas é confiável enquanto o tooltip estiver ali
  const leaks = new Set<string>()
  for (const key of covered) {
    const [c, r] = key.split(',').map(Number)
    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const k = cellKey(c + dc, r + dr)
      if (!covered.has(k)) leaks.add(k)
    }
  }

  const groups = new Map<number, [number, number][]>()
  for (let i = 0; i < nc * nr; i++) {
    const root = find(i)
    let g = groups.get(root)
    if (!g) groups.set(root, (g = []))
    g.push([Math.floor(i / nr), i % nr])
  }

  const boxes: BoxRect[] = []
  const uncertain = new Set<string>()
  const allEmpty = (cells: [number, number][]) => cells.every(([c, r]) => cellIsEmpty(gray, geom, c, r))
  for (const cells of groups.values()) {
    const cs = cells.map(([c]) => c)
    const rs = cells.map(([, r]) => r)
    const col = Math.min(...cs)
    const row = Math.min(...rs)
    const w = Math.max(...cs) - col + 1
    const h = Math.max(...rs) - row + 1
    const keys = cells.map(([c, r]) => cellKey(c, r))
    if (keys.some((k) => covered.has(k))) {
      // sob o tooltip
      for (const k of keys) uncertain.add(k)
      continue
    }
    if (keys.some((k) => leaks.has(k))) {
      // encostada no tooltip (células vazias não contam)
      if (!allEmpty(cells)) for (const k of keys) uncertain.add(k)
      continue
    }
    if (cells.length !== w * h) {
      // células vazias vizinhas têm divisórias fracas e se juntam em formas irregulares: só é "algo cobrindo
      // o grid" se alguma tiver conteúdo (toda caixa tem rótulo no canto)
      if (!allEmpty(cells)) for (const k of keys) uncertain.add(k)
      continue
    }
    if (innerIsEmpty(gray, geom, col, row, w, h)) continue // célula vazia
    const edges = (y: number) => {
      for (let c = col; c < col + w; c++) if (!horizontalEdge(thinH, gray, geom, y, c)) return false
      return true
    }
    const topOpen = row === 0 && !edges(pyRound(geom.y0))
    const bottomOpen = row + h === nr && !edges(pyRound(geom.y0 + nr * p))
    boxes.push({ col, row, w, h, clipped: topOpen || bottomOpen })
  }
  boxes.sort((a, b) => a.row - b.row || a.col - b.col)
  return { geometry: geom, boxes, uncertain, overlays }
}

// ---------------------------------------------------------------------------------------------------------

/** Detecta grid + caixas. `region` [x, y, w, h] restringe a busca; as coordenadas voltam na tela.
 *
 * `hint` é o grid do vendedor já conhecido: procura antes só na faixa de colunas dele (até onde o tooltip
 * pode ir) e com o mesmo tamanho de célula. Os outros grids da tela (bolso, mochila) e a metade da célula no
 * meio da rolagem não atrapalham, e a imagem menor sai mais rápido. Sem achar, procura na imagem toda (o
 * vendedor pode ter mudado de lugar). */
export function scan(gray: Gray, region: [number, number, number, number] | null = null, hint: GridGeometry | null = null): GridScan | null {
  if (hint !== null) {
    // com região (v0.1: metade direita da tela), a faixa do hint fica dentro dela e a busca nunca sai dela
    const [rx, ry, rw, rh] = region ?? [0, 0, gray.w, gray.h]
    const p = hint.pitch
    const xa = Math.max(rx, Math.trunc(hint.x0 - p))
    const xb = Math.min(rx + rw, Math.trunc(hint.x0 + (hint.cols + TOOLTIP_MAX_W) * p))
    if (xb - xa > MIN_COLS * p) {
      const found = scanRegion(gray, [xa, ry, xb - xa, rh], [p * (1 - TRACK_PITCH), p * (1 + TRACK_PITCH)])
      if (found !== null && Math.abs(found.geometry.x0 - hint.x0) <= TRACK_X * p) return found
    }
  }
  return scanRegion(gray, region)
}

function scanRegion(gray: Gray, region: [number, number, number, number] | null, pitchRange: [number, number] = [MIN_PITCH, MAX_PITCH]): GridScan | null {
  let ox = 0
  let oy = 0
  if (region !== null) {
    const [rx, ry, rw, rh] = region
    ox = rx
    oy = ry
    gray = crop(gray, rx, ry, rw, rh)
  }
  const geom = detectGrid(gray, pitchRange)
  if (geom === null) return null
  const result = extractBoxes(gray, geom)
  if (!ox && !oy) return result
  const g = result.geometry
  return {
    geometry: { x0: g.x0 + ox, y0: g.y0 + oy, pitch: g.pitch, cols: g.cols, rows: g.rows },
    boxes: result.boxes,
    uncertain: result.uncertain,
    overlays: result.overlays.map(([xa, ya, xb, yb]): Rect => [xa + ox, ya + oy, xb + ox, yb + oy]),
  }
}
