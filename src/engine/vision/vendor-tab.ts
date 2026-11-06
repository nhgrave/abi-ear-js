/** A aba ativa do vendedor, pela cor: só a tela do vendedor tem, logo acima do grid, a barra "Purchase | Sell" com a
 * aba ativa em marrom-alaranjado (a inativa é cinza escuro). Não depende do idioma: é a posição e a cor da aba. O
 * armazém, o saque e o inventário não têm essa barra; o Sell (Recycling Station) tem a aba da direita ativa. */
import type { GridGeometry } from './types'

export type VendorTab = 'purchase' | 'sell' | null
/** Quadro em cores. `x0`: coluna da tela onde a imagem começa (o worker lê só a metade direita); `w` é a largura
 * da imagem, não a da tela. */
export type Rgba = { w: number; h: number; data: Uint8ClampedArray | Uint8Array; x0?: number }

// a barra fica entre o grid e até um cabeçalho de uma linha acima dele (o "Mysterious Supplies" do Field Merchant)
const BAND_TOP = 1.6 // células acima do topo do grid
const BAND_BOTTOM = 0.1
const ACTIVE = 0.8 // fração mínima de pixels quentes numa linha da metade ativa (a aba é lisa)
const INACTIVE = 0.2 // fração máxima na outra metade, na mesma linha

/** Marrom-alaranjado da aba ativa (40/21/11 no Purchase e no Sell); o cinza da inativa é 15/17/17. O verde acima do
 * azul separa do vermelho dos fundos de arma do armazém (32/9/15); o vermelho bem acima do verde, do dourado dos
 * fundos de raridade (45/36/17). */
export function warm(r: number, g: number, b: number): boolean {
  return r >= 25 && r >= 1.5 * g && g >= 1.4 * b
}

/** Fração de pixels quentes em cada metade da largura do grid, linha a linha na faixa acima dele. */
export function tabRows(img: Rgba, g: GridGeometry): { y: number; left: number; right: number }[] {
  const p = g.pitch
  const mid = g.x0 + (g.cols * p) / 2
  const halves: [number, number][] = [
    [g.x0 + 0.6 * p, mid - 0.4 * p],
    [mid + 0.4 * p, g.x0 + g.cols * p - 0.6 * p],
  ]
  const ox = img.x0 ?? 0
  const rows: { y: number; left: number; right: number }[] = []
  const ya = Math.max(0, Math.round(g.y0 - BAND_TOP * p))
  const yb = Math.min(img.h, Math.round(g.y0 - BAND_BOTTOM * p))
  for (let y = ya; y < yb; y++) {
    const [left, right] = halves.map(([xa, xb]) => {
      const a = Math.max(ox, Math.round(xa))
      const b = Math.min(ox + img.w, Math.round(xb))
      let n = 0
      for (let x = a; x < b; x++) {
        const i = (y * img.w + x - ox) * 4
        if (warm(img.data[i], img.data[i + 1], img.data[i + 2])) n++
      }
      return b > a ? n / (b - a) : 0
    })
    rows.push({ y, left, right })
  }
  return rows
}

/** 'purchase' ou 'sell' quando alguma linha acima do grid tem uma metade quente e a outra não; senão null. */
export function vendorTab(img: Rgba, g: GridGeometry): VendorTab {
  let purchase = 0
  let sell = 0
  for (const r of tabRows(img, g)) {
    if (r.left >= ACTIVE && r.right <= INACTIVE) purchase++
    else if (r.right >= ACTIVE && r.left <= INACTIVE) sell++
  }
  const min = Math.max(2, Math.round(0.1 * g.pitch)) // algumas linhas, não um traço solto
  if (purchase >= min && purchase > sell) return 'purchase'
  if (sell >= min && sell > purchase) return 'sell'
  return null
}
