/** Mensagens entre a página e os workers. */
import type { ListenEvent } from '../engine/audio/listener'
import type { FrameResult } from '../engine/pipeline'
import type { LabelModels } from '../engine/vision/label-reader'
import type { GridGeometry } from '../engine/vision/types'

export type AudioIn =
  | { type: 'refs'; refs: { soundId: number; name: string; samples: Float32Array }[] }
  | { type: 'audio'; samples: Float32Array; tStartMs: number }
export type AudioOut = { type: 'ready' } | { type: 'events'; events: ListenEvent[] }

/** `stream`: os quadros chegam direto no worker (sem timer da página, que o Chrome desacelera com o jogo na frente).
 * `frame`: alternativa para navegadores sem MediaStreamTrackProcessor. `originMs` é o performance.timeOrigin da
 * página: o worker devolve os tempos na base de tempo dela. `models`: modelos dos rótulos, antes dos quadros. `hint`: grid
 * do vendedor para procurar primeiro. */
export type VisionIn =
  | { type: 'stream'; readable: ReadableStream<VideoFrame>; originMs: number; intervalMs: number }
  | { type: 'frame'; bitmap: ImageBitmap; t: number }
  | { type: 'models'; models: LabelModels }
  | { type: 'hint'; hint: GridGeometry | null }
export type VisionOut = { type: 'result'; result: FrameResult; size: [number, number] } | { type: 'error'; message: string }
