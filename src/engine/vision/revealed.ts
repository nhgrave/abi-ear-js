/** Caixas reveladas: quando o jogo revela o conteúdo de caixas do vendedor ("Reveladas para você: 4 cargas
 * misteriosas de qualidade Roxa"), a caixa ganha o fundo da cor da raridade e a imagem do item, desenhada com 80% do
 * tamanho da caixa e centralizada (medido na gravação 2026-11-07-160851). A imagem é comparada com os ícones dos itens
 * possíveis: o que bate com folga é o item da caixa. */
import { cellOrigin, type BoxRect, type GridGeometry } from './types'
import type { Rgba } from './vendor-tab'

export const SIG_CELL = 48 // px por célula na comparação (a 32 a folga entre o item certo e o segundo cai um pouco)
export const ICON_FILL = 0.8 // fração da caixa que a imagem do item ocupa (no lado que limita)
export const REVEALED_TINT = 8 // fundo com canais diferentes por isso: colorido pela raridade (o comum é cinza ~15,17,17)
export const MIN_SCORE = 0.6 // item certo ~0,74–0,92; o melhor ícone numa caixa comum fica abaixo de 0,5
export const MIN_MARGIN = 0.15 // folga sobre o segundo ícone (na gravação, o segundo ficou abaixo de 0,45)

/** Imagem RGBA (ícone do item ou caixa reamostrada). */
export type IconSource = { w: number; h: number; data: Uint8ClampedArray | Uint8Array }
/** Caixa ou ícone na escala da comparação: (w células x SIG_CELL) por (h células x SIG_CELL), RGBA. */
export type BoxImage = { w: number; h: number; rgba: Uint8ClampedArray }

const at = (img: Rgba, x: number, y: number) => (y * img.w + x - (img.x0 ?? 0)) * 4

/** Diferença entre o maior e o menor canal da cor média do fundo, nos dois cantos de baixo da caixa (longe da imagem
 * do item, que fica no centro). */
export function backgroundTint(img: Rgba, geom: GridGeometry, box: BoxRect): number {
  const [ox, oy] = cellOrigin(geom, box.col, box.row)
  const bw = Math.round(box.w * geom.pitch)
  const bh = Math.round(box.h * geom.pitch)
  const x0 = img.x0 ?? 0
  const sum = [0, 0, 0]
  let n = 0
  for (const left of [3, bw - 9]) {
    for (let y = bh - 8; y < bh - 3; y++) {
      for (let x = left; x < left + 6; x++) {
        const sx = Math.round(ox) + x
        const sy = Math.round(oy) + y
        if (sx < x0 || sx >= x0 + img.w || sy < 0 || sy >= img.h) continue
        const i = at(img, sx, sy)
        sum[0] += img.data[i]
        sum[1] += img.data[i + 1]
        sum[2] += img.data[i + 2]
        n++
      }
    }
  }
  if (n === 0) return 0
  const avg = sum.map((v) => v / n)
  return Math.max(...avg) - Math.min(...avg)
}

/** Média de área de um retângulo da fonte em cada pixel do destino; o que cai fora da fonte conta como transparente. */
function resample(src: IconSource, sx: number, sy: number, sw: number, sh: number, tw: number, th: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(tw * th * 4)
  for (let y = 0; y < th; y++) {
    const ya = sy + (y * sh) / th
    const yb = sy + ((y + 1) * sh) / th
    for (let x = 0; x < tw; x++) {
      const xa = sx + (x * sw) / tw
      const xb = sx + ((x + 1) * sw) / tw
      const acc = [0, 0, 0, 0]
      let n = 0
      for (let yy = Math.floor(ya); yy < Math.ceil(yb); yy++) {
        for (let xx = Math.floor(xa); xx < Math.ceil(xb); xx++) {
          n++
          if (xx < 0 || yy < 0 || xx >= src.w || yy >= src.h) continue
          const i = (yy * src.w + xx) * 4
          for (let c = 0; c < 4; c++) acc[c] += src.data[i + c]
        }
      }
      const o = (y * tw + x) * 4
      for (let c = 0; c < 4; c++) out[o + c] = n ? acc[c] / n : 0
    }
  }
  return out
}

/** A caixa da tela na escala da comparação. */
export function boxImage(img: Rgba, geom: GridGeometry, box: BoxRect): BoxImage {
  const [ox, oy] = cellOrigin(geom, box.col, box.row)
  const x0 = img.x0 ?? 0
  const w = box.w * SIG_CELL
  const h = box.h * SIG_CELL
  // coordenadas da tela; a fonte começa em x0 (o worker lê só a metade direita)
  const rgba = resample(img, ox - x0, oy, box.w * geom.pitch, box.h * geom.pitch, w, h)
  return { w, h, rgba }
}

/** O ícone do item como o jogo o desenha numa caixa de w x h células: 80% da caixa no lado que limita, centralizado,
 * com o fundo transparente. */
export function iconImage(icon: IconSource, cellsW: number, cellsH: number): BoxImage {
  const w = cellsW * SIG_CELL
  const h = cellsH * SIG_CELL
  const k = Math.min((ICON_FILL * w) / icon.w, (ICON_FILL * h) / icon.h)
  const ix = (w - icon.w * k) / 2
  const iy = (h - icon.h * k) / 2
  const rgba = resample(icon, -ix / k, -iy / k, w / k, h / k, w, h)
  return { w, h, rgba }
}

/** Correlação normalizada entre a caixa e o ícone, nos três canais, só nos pixels do ícone (alfa de pelo menos metade). */
export function iconScore(box: BoxImage, icon: BoxImage): number {
  let n = 0
  let sm = 0
  let st = 0
  let smm = 0
  let stt = 0
  let smt = 0
  for (let i = 0; i < icon.rgba.length; i += 4) {
    if (icon.rgba[i + 3] < 128) continue
    for (let c = 0; c < 3; c++) {
      const m = box.rgba[i + c]
      const v = icon.rgba[i + c]
      sm += m
      st += v
      smm += m * m
      stt += v * v
      smt += m * v
      n++
    }
  }
  if (n === 0) return 0
  const vm = smm - (sm * sm) / n
  const vt = stt - (st * st) / n
  return vm > 0 && vt > 0 ? (smt - (sm * st) / n) / Math.sqrt(vm * vt) : 0
}

/** O item da caixa revelada entre os candidatos, ou null se nenhum bate o bastante ou dois batem parecido. */
export function identify(box: BoxImage, icons: { itemId: number; image: BoxImage }[]): { itemId: number; score: number } | null {
  let best = { itemId: -1, score: -Infinity }
  let second = 0
  for (const { itemId, image } of icons) {
    const score = iconScore(box, image)
    if (score > best.score) {
      second = Math.max(second, best.score)
      best = { itemId, score }
    } else if (score > second) second = score
  }
  return best.score >= MIN_SCORE && best.score - second >= MIN_MARGIN ? best : null
}

/** Caixa revelada achada num quadro, em células da tela, com a imagem dela para comparar com os ícones. */
export type RevealedBox = { col: number; row: number; w: number; h: number; image: BoxImage }

/** As caixas inteiras com imagem abaixo do rótulo (lit) e fundo colorido: as que o jogo revelou. */
export function revealedBoxes(img: Rgba, geom: GridGeometry, boxes: readonly BoxRect[]): RevealedBox[] {
  return boxes
    .filter((b) => b.lit && !b.clipped && backgroundTint(img, geom, b) >= REVEALED_TINT)
    .map((b) => ({ col: b.col, row: b.row, w: b.w, h: b.h, image: boxImage(img, geom, b) }))
}
