/**
 * IndexedDB 封装（库名 paper-study，版本 1；DEVELOPMENT.md §5）
 *
 * 历史踩坑：上一版把 IDBRequest 当 IDBTransaction 用导致写入挂起。
 * 约定：本文件是全项目唯一的 IndexedDB 入口，外部不得裸用原生 API；
 * 所有操作基于 request 的 success/error 事件包装成 Promise。
 */

const DB_NAME = 'paper-study'
const DB_VERSION = 1

export type StoreName = 'papers' | 'pageTexts' | 'extracts' | 'chats' | 'notes' | 'settings'

// Pinia/Vue 的 reactive Proxy 无法被结构化克隆（DataCloneError），落库前一律深度还原为原始对象
// 注意 toRaw 只解顶层：嵌套的代理（如 reactive 数组内的对象、赋给普通对象的数组字段）需递归处理
import { toRaw } from 'vue'

function deepToRaw(v: unknown): unknown {
  let cur = v
  for (let i = 0; i < 10; i++) {
    const raw = toRaw(cur)
    if (raw === cur) break
    cur = raw
  }
  if (Array.isArray(cur)) return cur.map(deepToRaw)
  if (cur !== null && typeof cur === 'object') {
    const proto = Object.getPrototypeOf(cur)
    // 非普通对象（Blob/Date/ArrayBuffer 等）原样保留
    if (proto !== Object.prototype && proto !== null) return cur
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(cur as Record<string, unknown>)) out[k] = deepToRaw(val)
    return out
  }
  return cur
}

function plain<T>(value: T): T {
  return deepToRaw(value) as T
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('papers')) {
        db.createObjectStore('papers', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('pageTexts')) {
        const s = db.createObjectStore('pageTexts', { keyPath: ['paperId', 'page'] })
        s.createIndex('by-paper', 'paperId', { unique: false })
      }
      if (!db.objectStoreNames.contains('extracts')) {
        db.createObjectStore('extracts', { keyPath: 'paperId' })
      }
      if (!db.objectStoreNames.contains('chats')) {
        db.createObjectStore('chats', { keyPath: 'paperId' })
      }
      if (!db.objectStoreNames.contains('notes')) {
        const s = db.createObjectStore('notes', { keyPath: 'id' })
        s.createIndex('by-paper', 'paperId', { unique: false })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
    }
    req.onsuccess = () => {
      const db = req.result
      db.onclose = () => {
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'))
  })
  return dbPromise
}

/** 包装单个 IDBRequest（注意：这是 request，不是 transaction） */
function toPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'))
  })
}

async function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb()
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const os = tx.objectStore(store)
    let request: IDBRequest<T> | void
    try {
      request = fn(os)
    } catch (e) {
      reject(e)
      return
    }
    tx.oncomplete = () => resolve(request && 'result' in request ? request.result : undefined)
    tx.onabort = () => reject(tx.error ?? new Error('事务中止'))
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'))
  })
}

export async function dbPut<T>(store: StoreName, value: T): Promise<void> {
  await run(store, 'readwrite', (s) => s.put(plain(value) as unknown as never))
}

/** 同一事务内批量写入（如逐页文本入库，避免 N 个事务） */
export async function dbPutMany<T>(store: StoreName, values: T[]): Promise<void> {
  if (!values.length) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    for (const v of values) os.put(plain(v) as unknown as never)
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('事务中止'))
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'))
  })
}

export async function dbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb()
  return toPromise<T | undefined>(db.transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>)
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  return toPromise<T[]>(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>)
}

export async function dbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  await run(store, 'readwrite', (s) => s.delete(key))
}

/** 按索引取全部匹配（如某文献的逐页文本/笔记） */
export async function dbGetAllByIndex<T>(
  store: StoreName,
  indexName: string,
  key: IDBValidKey,
): Promise<T[]> {
  const db = await openDb()
  const idx = db.transaction(store).objectStore(store).index(indexName)
  return toPromise<T[]>(idx.getAll(key) as IDBRequest<T[]>)
}

/** 删除某文献的全部关联数据（papers/pageTexts/extracts/chats/notes 级联） */
export async function dbDeletePaperCascade(paperId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['papers', 'pageTexts', 'extracts', 'chats', 'notes'], 'readwrite')
    tx.objectStore('papers').delete(paperId)
    tx.objectStore('extracts').delete(paperId)
    tx.objectStore('chats').delete(paperId)

    const ptIdx = tx.objectStore('pageTexts').index('by-paper')
    ptIdx.openCursor(paperId).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }
    const noteIdx = tx.objectStore('notes').index('by-paper')
    noteIdx.openCursor(paperId).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('事务中止'))
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'))
  })
}
