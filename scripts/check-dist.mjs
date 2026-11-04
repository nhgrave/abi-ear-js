#!/usr/bin/env node
// Verifica se o diretório de build (dist/) contém resquícios do módulo de gravação ou do spike.
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RECORDER_MARKERS = [
  'abi-ear-dev-recorder',
  'showDirectoryPicker',
  'Gravação (modo local)',
]

const PATH_MARKERS = ['recorder', 'spike', 'frames.worker']

/** Procura sinais do gravador em caminhos e no conteúdo dos arquivos. Os nomes em `data/` (base, sons e ícones do
 * jogo) ficam fora da busca por caminho: o jogo tem um item "Portable Recorder". */
export function findLeaks(files) {
  const leaks = []
  for (const file of files) {
    const gameData = file.path.startsWith('data/')
    for (const marker of PATH_MARKERS) {
      if (!gameData && file.path.toLowerCase().includes(marker)) leaks.push(`${file.path}: ${marker}`)
    }
    for (const marker of RECORDER_MARKERS) {
      if (file.text.includes(marker)) leaks.push(`${file.path}: ${marker}`)
    }
  }
  return leaks
}

/** Lê recursivamente todos os arquivos de um diretório como texto UTF-8. */
async function collectFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const parent = entry.parentPath ?? entry.path
    const fullPath = join(parent, entry.name)
    const relPath = relative(dir, fullPath).split('\\').join('/')
    const text = await readFile(fullPath, 'utf8')
    files.push({ path: relPath, text })
  }
  return files
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? 'dist')
  const files = await collectFiles(dir)
  const leaks = findLeaks(files)
  if (leaks.length > 0) {
    for (const leak of leaks) console.error(leak)
    process.exit(1)
  }
  console.log('check-dist: ok')
}
