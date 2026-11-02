/** Reorganização do estoque: quando alguém compra uma caixa, o vendedor reempacota a lista.
 *
 * O jogo arruma o estoque como uma lista em ordem fixa, cada caixa no primeiro lugar livre em que cabe,
 * linha a linha. Sair uma caixa faz as seguintes andarem para trás. Entre caixas do mesmo tamanho a
 * ordem de leitura é a ordem da lista e não muda, então cada tamanho é alinhado separadamente: a
 * sequência guardada contra a sequência vista agora, casando rótulos.
 *
 * Quando mais de um alinhamento explica a tela igualmente bem (duas "Mystery Cargo" 1x1 seguidas e
 * uma delas foi comprada), não há como saber qual caixa é qual: a caixa fica sem origem. */

export const EDGE_ROWS = 1 // uma compra empurra as caixas pouco: só sai por cima a da 1ª linha e só entra por baixo
// a que chega até a penúltima

const HEAD = 0 // antes do primeiro casamento
const MID = 1 // entre casamentos
const TAIL = 2 // depois do último
const INF = 10 ** 9

export type Placed = { col: number; row: number; h: number; label: string | null }

export function readingOrder(a: Placed, b: Placed): number {
  return a.row - b.row || a.col - b.col
}

function compatible(old: Placed, nw: Placed): boolean {
  return old.label === null || nw.label === null || old.label === nw.label
}

/** Para cada caixa de `nw`, o índice da caixa de `old` de onde ela veio, ou null.
 *
 * `old` e `nw` têm caixas de um só tamanho, em ordem de leitura. `top`/`bottom` são as linhas de
 * conteúdo visíveis agora (`nw` está todo dentro delas; `old` pode ter caixas fora). Custo de um
 * alinhamento: caixa guardada que estava à vista e sumiu (comprada) e caixa nova sem origem. Não
 * custam nada as caixas fora da vista nas pontas, a que sai pela 1ª linha (se havia o que rolar
 * acima) e a que entra por baixo. Vale a origem que é a mesma em todos os alinhamentos de custo
 * mínimo. */
export function align(old: readonly Placed[], nw: readonly Placed[], top: number, bottom: number, canLeaveTop: boolean): (number | null)[] {
  const m = old.length
  const n = nw.length

  const skipOld = (phase: number, box: Placed): number => {
    const inside = top <= box.row && box.row + box.h <= bottom
    if (phase === HEAD) {
      if (box.row < top) return 0 // já estava acima da vista
      return inside && canLeaveTop && box.row < top + EDGE_ROWS ? 0 : 1
    }
    if (phase === TAIL) return box.row >= bottom || (!inside && box.row >= top) ? 0 : 1 // continua abaixo
    return 1 // sumiu do meio da sequência: foi comprada
  }

  const skipNew = (phase: number, box: Placed): number =>
    // depois do último casamento, embaixo: veio de baixo, nunca vista
    phase === TAIL && box.row + box.h >= bottom - EDGE_ROWS ? 0 : 1

  const table = () => Array.from({ length: 3 }, () => Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(INF)))

  const fwd = table()
  fwd[HEAD][0][0] = 0
  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      fwd[TAIL][i][j] = Math.min(fwd[TAIL][i][j], fwd[HEAD][i][j], fwd[MID][i][j])
      for (let p = 0; p < 3; p++) {
        const c = fwd[p][i][j]
        if (c >= INF) continue
        if (i < m) fwd[p][i + 1][j] = Math.min(fwd[p][i + 1][j], c + skipOld(p, old[i]))
        if (j < n) fwd[p][i][j + 1] = Math.min(fwd[p][i][j + 1], c + skipNew(p, nw[j]))
        if (p !== TAIL && i < m && j < n && compatible(old[i], nw[j])) fwd[MID][i + 1][j + 1] = Math.min(fwd[MID][i + 1][j + 1], c)
      }
    }
  }

  const bwd = table()
  for (let i = m; i >= 0; i--) {
    for (let j = n; j >= 0; j--) {
      for (const p of [TAIL, MID, HEAD]) {
        let best = i === m && j === n ? 0 : INF
        if (i < m) best = Math.min(best, skipOld(p, old[i]) + bwd[p][i + 1][j])
        if (j < n) best = Math.min(best, skipNew(p, nw[j]) + bwd[p][i][j + 1])
        if (p !== TAIL) {
          best = Math.min(best, bwd[TAIL][i][j])
          if (i < m && j < n && compatible(old[i], nw[j])) best = Math.min(best, bwd[MID][i + 1][j + 1])
        }
        bwd[p][i][j] = best
      }
    }
  }

  const opt = fwd[TAIL][m][n]
  const result: (number | null)[] = []
  for (let j = 0; j < n; j++) {
    const sources: number[] = []
    for (let i = 0; i < m; i++) {
      if (compatible(old[i], nw[j]) && Math.min(fwd[HEAD][i][j], fwd[MID][i][j]) + bwd[MID][i + 1][j + 1] === opt) sources.push(i)
    }
    let unmatched = false
    for (let p = 0; p < 3 && !unmatched; p++) {
      for (let i = 0; i <= m; i++) {
        if (fwd[p][i][j] + skipNew(p, nw[j]) + bwd[p][i][j + 1] === opt) {
          unmatched = true
          break
        }
      }
    }
    result.push(sources.length === 1 && !unmatched ? sources[0] : null)
  }
  return result
}
