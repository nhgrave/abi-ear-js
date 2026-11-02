import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Gray } from '../engine/vision/image'

const ROOT = resolve(import.meta.dirname, '../../tests/fixtures')

/** Caminho de um fixture gerado por `abi-ear/tools/export_golden.py`. */
export function fixturePath(...parts: string[]): string {
  return join(ROOT, ...parts)
}

export function hasFixtures(...parts: string[]): boolean {
  return existsSync(fixturePath(...parts))
}

export function readF32(path: string): Float32Array {
  const buf = readFileSync(path)
  const out = new Float32Array(buf.byteLength / 4)
  new Uint8Array(out.buffer).set(buf)
  return out
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

/** Quadro `frames/<name>.gray` com as dimensões de `frames/<name>.json`. */
export function readGray(name: string): Gray {
  const meta = readJson<{ w: number; h: number }>(fixturePath('frames', `${name}.json`))
  return readRawGray(fixturePath('frames', `${name}.gray`), meta.w, meta.h)
}

export function readRawGray(path: string, w: number, h: number): Gray {
  const data = new Uint8Array(readFileSync(path))
  if (data.length !== w * h) throw new Error(`${path}: ${data.length} bytes, esperado ${w * h}`)
  return { w, h, data }
}
