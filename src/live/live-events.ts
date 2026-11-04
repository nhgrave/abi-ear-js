/** O que a análise ao vivo fez, para quem quiser registrar (o gravador do modo local salva no events.jsonl de cada
 * gravação). Os instantes são epoch ms no relógio da página, o mesmo dos quadros e do áudio gravados. */
import type { PickupOutcome } from '../engine/controller'

type BoxInfo = { col: number; row: number; w: number; h: number; label: string | null }
type HealthMap = Record<string, { level: string; reason: string }>

export type LiveEvent =
  | {
      type: 'pickup'
      t: number
      sound: string
      score: number
      outcome: PickupOutcome['kind']
      reason: string | null
      box: BoxInfo | null
    }
  | { type: 'near-miss'; t: number; sound: string; score: number }
  | { type: 'health'; t: number; health: HealthMap }
  | { type: 'problems'; t: number; problems: string[] }

/** `timeOrigin` converte o tempo da pegada (ms de performance.now) para epoch. */
export function pickupEvent(out: PickupOutcome, sound: string, box: BoxInfo | null, timeOrigin: number): LiveEvent {
  return {
    type: 'pickup',
    t: timeOrigin + out.event.t,
    sound,
    score: out.event.score,
    outcome: out.kind,
    reason: out.kind === 'unassigned' ? out.reason : null,
    box: box && { col: box.col, row: box.row, w: box.w, h: box.h, label: box.label },
  }
}

export class LiveEvents {
  private listeners = new Set<(e: LiveEvent) => void>()
  private health: { t: number; json: string; value: HealthMap } | null = null
  private problems: { t: number; json: string; value: string[] } | null = null

  /** Assina os eventos; quem chega recebe na hora a saúde e os avisos atuais. Devolve o cancelamento. */
  on(fn: (e: LiveEvent) => void): () => void {
    this.listeners.add(fn)
    if (this.health) fn({ type: 'health', t: this.health.t, health: this.health.value })
    if (this.problems) fn({ type: 'problems', t: this.problems.t, problems: this.problems.value })
    return () => void this.listeners.delete(fn)
  }

  emit(e: LiveEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(e)
      } catch {
        /* quem registra não derruba a análise */
      }
    }
  }

  /** Saúde e avisos como estão agora: viram evento só quando mudam. */
  state(t: number, health: HealthMap, problems: readonly string[]): void {
    const hj = JSON.stringify(health)
    if (hj !== this.health?.json) {
      this.health = { t, json: hj, value: JSON.parse(hj) }
      this.emit({ type: 'health', t, health: this.health.value })
    }
    const pj = JSON.stringify(problems)
    if (pj !== this.problems?.json) {
      this.problems = { t, json: pj, value: [...problems] }
      this.emit({ type: 'problems', t, problems: this.problems.value })
    }
  }
}
