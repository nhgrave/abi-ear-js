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
} as DisplayMediaStreamOptions & { systemAudio?: string; monitorTypeSurfaces?: string }

/** Problemas que impedem seguir (equivalente ao streamProblems do gravador, em chaves de mensagem). */
export function streamProblemKeys(s: { audioTracks: number; displaySurface?: string }): MessageKey[] {
  const problems: MessageKey[] = []
  if (s.displaySurface && s.displaySurface !== 'monitor') problems.push('problem.notMonitor')
  if (s.audioTracks < 1) problems.push('problem.noAudio')
  return problems
}

/** Instante (ms de performance.now) da amostra `frame` do AudioContext, pelo par de getOutputTimestamp.
 * É o epochOfFrame do gravador sem o timeOrigin: a mesma base de tempo em que a janela foi validada. */
export function audioTimeMs(frame: number, ts: { contextTime: number; performanceTime: number }): number {
  return ts.performanceTime + (frame / SAMPLE_RATE - ts.contextTime) * 1000
}

export function outputTimestamp(ctx: AudioContext): { contextTime: number; performanceTime: number } {
  const ts = ctx.getOutputTimestamp()
  return {
    contextTime: typeof ts.contextTime === 'number' && !Number.isNaN(ts.contextTime) ? ts.contextTime : ctx.currentTime,
    performanceTime: typeof ts.performanceTime === 'number' && !Number.isNaN(ts.performanceTime) ? ts.performanceTime : performance.now(),
  }
}
