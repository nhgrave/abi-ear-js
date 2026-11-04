/** Pasta falsa com o mínimo do FileSystemDirectoryHandle que o histórico usa. Texto ou bytes viram arquivo; um objeto
 * vira subpasta. */
type Tree = { [name: string]: string | Uint8Array | Tree }

function notFound(name: string): DOMException {
  return new DOMException(`${name} não existe`, 'NotFoundError')
}

function fileHandle(name: string, content: string | Uint8Array) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
  return {
    kind: 'file' as const,
    name,
    async getFile() {
      return { size: bytes.length, text: async () => new TextDecoder().decode(bytes) }
    },
  }
}

function dirHandle(name: string, tree: Tree): unknown {
  const child = (n: string) => {
    const v = tree[n]
    return typeof v === 'string' || v instanceof Uint8Array ? fileHandle(n, v) : (dirHandle(n, v) as object)
  }
  return {
    kind: 'directory' as const,
    name,
    async *values() {
      for (const n of Object.keys(tree)) yield child(n)
    },
    async getDirectoryHandle(n: string) {
      const v = tree[n]
      if (v === undefined || typeof v === 'string' || v instanceof Uint8Array) throw notFound(n)
      return dirHandle(n, v)
    },
    async getFileHandle(n: string) {
      const v = tree[n]
      if (typeof v !== 'string' && !(v instanceof Uint8Array)) throw notFound(n)
      return fileHandle(n, v)
    },
  }
}

export function fakeDir(tree: Tree, name = 'root'): FileSystemDirectoryHandle {
  return dirHandle(name, tree) as FileSystemDirectoryHandle
}
