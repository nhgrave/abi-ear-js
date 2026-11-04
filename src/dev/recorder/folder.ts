/** A pasta das gravações: escolhida uma vez e lembrada no IndexedDB desta origem (o handle é clonável). */

type Permission = 'granted' | 'denied' | 'prompt'
type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: 'readwrite' }): Promise<Permission>
  requestPermission(o: { mode: 'readwrite' }): Promise<Permission>
}
type PickerWindow = Window & { showDirectoryPicker?(o: { mode: 'readwrite'; id?: string }): Promise<FileSystemDirectoryHandle> }

const DB = 'abi-ear-dev'
const STORE = 'folder'
const KEY = 'root'

export function hasFolderPicker(): boolean {
  return typeof (window as PickerWindow).showDirectoryPicker === 'function'
}

/** O seletor de pasta do Chrome; null se o usuário cancelar. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (window as PickerWindow).showDirectoryPicker!({ mode: 'readwrite', id: 'abi-ear-recordings' })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function saveFolder(h: FileSystemDirectoryHandle): Promise<void> {
  await withStore('readwrite', (s) => s.put(h, KEY))
}

/** A pasta lembrada, ou null (nada salvo, IndexedDB indisponível ou qualquer erro). */
export async function loadFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const h = await withStore<unknown>('readonly', (s) => s.get(KEY))
    return h instanceof FileSystemDirectoryHandle ? h : null
  } catch {
    return null
  }
}

/** Se a página pode ler e escrever na pasta. Com `request`, pede a permissão (precisa de um clique do usuário). */
export async function folderAccess(h: FileSystemDirectoryHandle, request: boolean): Promise<boolean> {
  const p = h as PermissionHandle
  try {
    if ((await p.queryPermission({ mode: 'readwrite' })) === 'granted') return true
    return request && (await p.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}
