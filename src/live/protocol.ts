/** Mensagens entre a página e os workers. */
import type { ListenEvent } from '../engine/audio/listener'
import type { FrameResult } from '../engine/pipeline'
import type { GridGeometry } from '../engine/vision/types'

export type AudioIn =
  | { type: 'refs'; refs: { soundId: number; name: string; samples: Float32Array }[] }
  | { type: 'audio'; samples: Float32Array; tStartMs: number }
export type AudioOut = { type: 'ready' } | { type: 'events'; events: ListenEvent[] }

export type VisionIn = { type: 'frame'; bitmap: ImageBitmap; t: number; hint: GridGeometry | null }
export type VisionOut = { type: 'result'; result: FrameResult } | { type: 'error'; message: string }
