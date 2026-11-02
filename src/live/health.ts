/** Estado dos indicadores do topo (Áudio, Tela, Vendedor, Cursor) a partir do que a página observa. */

export type Level = 'green' | 'yellow' | 'red' | 'gray'
export type Health = { level: Level; reason: string } // reason: chave de mensagem em src/i18n.ts

const AUDIO_SILENT_MS = 2000 // sem bloco do worklet há isto: a faixa parou
const LOW_SCORE = 0.8 // mediana das últimas pegadas abaixo disto: volume de efeitos baixo (spec 8.2)
const LAST_SCORES = 5
const NEAR_MISS_WINDOW_MS = 60_000
const NEAR_MISS_COUNT = 3
const BLACK_MEAN = 8 // média de cinza abaixo disto: quadro preto (tela cheia exclusiva)
const BLACK_WINDOW_MS = 2000
const VENDOR_FRESH_MS = 1500 // o mesmo MAX_LAYOUT_AGE do controller
const WRONG_SCREEN_MS = 30_000
const ARROW_FRESH_MS = 2000

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function audioHealth(s: { sharing: boolean; hasTrack: boolean; lastChunkMs: number | null; now: number; scores: number[]; nearMisses: number[] }): Health {
  if (!s.sharing) return { level: 'gray', reason: 'screen.off' }
  if (!s.hasTrack) return { level: 'red', reason: 'audio.noTrack' }
  if (s.lastChunkMs === null || s.now - s.lastChunkMs > AUDIO_SILENT_MS) return { level: 'red', reason: 'audio.stalled' }
  const recent = s.scores.slice(-LAST_SCORES)
  const misses = s.nearMisses.filter((t) => s.now - t <= NEAR_MISS_WINDOW_MS).length
  if ((recent.length > 0 && median(recent) < LOW_SCORE) || misses >= NEAR_MISS_COUNT) return { level: 'yellow', reason: 'audio.low' }
  return { level: 'green', reason: 'audio.ok' }
}

/** means: [instante do quadro, média de cinza]. */
export function screenHealth(s: { sharing: boolean; lastFrameMs: number | null; now: number; means: [number, number][] }): Health {
  if (!s.sharing) return { level: 'gray', reason: 'screen.off' }
  if (s.lastFrameMs === null || s.now - s.lastFrameMs > 2000) return { level: 'red', reason: 'screen.stalled' }
  const recent = s.means.filter(([t]) => s.now - t <= BLACK_WINDOW_MS)
  if (recent.length > 0 && recent.every(([, m]) => m < BLACK_MEAN)) return { level: 'yellow', reason: 'screen.black' }
  return { level: 'green', reason: 'screen.ok' }
}

export function vendorHealth(s: { lastSeen: number | null; now: number; sharingSinceMs: number | null }): Health {
  if (s.lastSeen !== null && s.now - s.lastSeen <= VENDOR_FRESH_MS) return { level: 'green', reason: 'vendor.ok' }
  if (s.lastSeen === null && s.sharingSinceMs !== null && s.now - s.sharingSinceMs > WRONG_SCREEN_MS) {
    return { level: 'yellow', reason: 'vendor.wrongScreen' }
  }
  return { level: 'gray', reason: 'vendor.none' }
}

const NO_CURSOR_RECENT_MS = 30_000 // pegada recente que não achou o cursor: o aviso vale

/** A seta só é procurada perto do grid do vendedor: ela sumir é normal (o mouse está em outro lugar). O aviso
 * aparece quando uma pegada recente não achou o cursor (lastNoCursorMs) e a seta continua sumida. */
export function cursorHealth(s: { vendorVisible: boolean; lastArrowMs: number | null; now: number; lastNoCursorMs: number | null }): Health {
  if (!s.vendorVisible) return { level: 'gray', reason: 'cursor.idle' }
  if (s.lastArrowMs !== null && s.now - s.lastArrowMs <= ARROW_FRESH_MS) return { level: 'green', reason: 'cursor.ok' }
  if (s.lastNoCursorMs !== null && s.now - s.lastNoCursorMs <= NO_CURSOR_RECENT_MS) return { level: 'yellow', reason: 'cursor.missing' }
  return { level: 'gray', reason: 'cursor.idle' }
}
