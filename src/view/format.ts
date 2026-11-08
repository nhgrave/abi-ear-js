/** Como cada caixa aparece no grid espelhado (spec 8.6). */
import type { BoxView } from '../engine/view'

/** Cores de raridade do jogo, as mesmas do app desktop. A base do Merchant não tem itens de raridade 2 (verde). */
export const RARITY_COLORS: Record<number, string> = { 1: '#9e9e9e', 3: '#2196f3', 4: '#9c27b0', 5: '#ffb300', 6: '#e53935' }
const UNKNOWN_RARITY = '#5a5a5a'

export type BoxDisplay = {
  text: string
  pct: number | null
  count: number // candidatos: mais de um vira o selo "+N"
  color: string | null // raridade do item mais provável; null antes de pegar
  edge: { high: string; low: string } | null // candidatos de raridades diferentes: caixa cortada na diagonal, a maior no canto superior esquerdo e a menor no inferior direito
  icon: string | null // só sobrou um item: a imagem no lugar do texto
  hint: boolean // ainda não pega: o texto é a categoria lida (apagado), não um item
}

const color = (rarity: number) => RARITY_COLORS[rarity] ?? UNKNOWN_RARITY

export function boxDisplay(b: BoxView): BoxDisplay {
  // o tamanho já está no desenho do grid; antes de pegar, a categoria lida é o que diz mais
  // a caixa revelada pelo jogo já tem o item: aparece como uma caixa pega
  if (b.picks === 0 && !b.revealed) return { text: b.label ?? '', pct: null, count: 0, color: null, edge: null, icon: null, hint: true }
  const top = b.candidates[0]
  if (!top) return { text: '?', pct: null, count: 0, color: null, edge: null, icon: null, hint: false }
  const rarities = b.candidates.map((c) => c.rarity)
  const [hi, lo] = [Math.max(...rarities), Math.min(...rarities)]
  return {
    text: top.name,
    // 100% só com um item: com outro possível, arredondar para 100 esconderia que ele existe
    pct: b.candidates.length > 1 ? Math.min(99, Math.round(top.pct)) : Math.round(top.pct),
    count: b.candidates.length,
    color: color(top.rarity),
    edge: hi !== lo ? { high: color(hi), low: color(lo) } : null,
    // a imagem diz "é este": só quando não sobrou outro item, por menor que seja a chance dele
    icon: b.candidates.length === 1 ? top.icon : null,
    hint: false,
  }
}
