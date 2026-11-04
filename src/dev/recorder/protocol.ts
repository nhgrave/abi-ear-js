/** Mensagens entre a página e o worker de gravação de quadros. */

export type FramesIn =
  | { type: 'start'; readable: ReadableStream<VideoFrame>; dir: FileSystemDirectoryHandle; intervalMs: number; maxInFlight: number }
  | { type: 'stop' }

export type FramesOut =
  | { type: 'progress'; frames: number; skipped: number }
  | { type: 'stopped'; frames: number; skipped: number; error: string | null }
