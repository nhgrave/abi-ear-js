/** Compartilhamento de tela com áudio do sistema (mesmas opções do gravador do protótipo). */
import type { MessageKey } from '../i18n'
import { SAMPLE_RATE } from '../engine/audio/filter'

export const DISPLAY_MEDIA_OPTIONS = {
  video: { frameRate: 30 },
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    suppressLocalAudioPlayback: false,
  },
  systemAudio: 'include',
  monitorTypeSurfaces: 'include',
  // janela compartilhada: pede só o áudio dela (sem o Discord e outros sons do sistema), onde o Chrome suporta
  windowAudio: 'window',
} as DisplayMediaStreamOptions & { systemAudio?: string; monitorTypeSurfaces?: string; windowAudio?: string }

/** Problemas que impedem seguir. Vale a tela inteira (com o áudio do sistema) ou a janela do jogo com o áudio dela;
 * aba do navegador não. */
export function streamProblemKeys(s: { audioTracks: number; displaySurface?: string }): MessageKey[] {
  if (s.displaySurface === 'browser') return ['problem.notMonitor']
  if (s.audioTracks < 1) return [s.displaySurface === 'window' ? 'problem.noWindowAudio' : 'problem.noAudio']
  return []
}

/** Instante (ms de performance.now) da amostra `frame` do AudioContext, pelo par de getOutputTimestamp.
 * É o epochOfFrame do gravador sem o timeOrigin: a mesma base de tempo em que a janela foi validada. */
export function audioTimeMs(frame: number, ts: { contextTime: number; performanceTime: number }): number {
  return ts.performanceTime + (frame / SAMPLE_RATE - ts.contextTime) * 1000
}

/** Par (contextTime, performanceTime) do AudioContext. Antes de a saída começar, o Chrome devolve zeros: aí vale o
 * relógio atual, como no gravador. */
export function outputTimestamp(ctx: AudioContext): { contextTime: number; performanceTime: number } {
  const ts = ctx.getOutputTimestamp()
  const ok = (v: number | undefined): v is number => typeof v === 'number' && !Number.isNaN(v) && v > 0
  if (ok(ts.contextTime) && ok(ts.performanceTime)) return { contextTime: ts.contextTime, performanceTime: ts.performanceTime }
  return { contextTime: ctx.currentTime, performanceTime: performance.now() }
}
