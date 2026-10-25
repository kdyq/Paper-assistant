/**
 * 全量数据备份（Step 16）：所有 store → 单个 JSON（PDF Blob 转 base64）；
 * 导入 = 清空后整库还原（破坏性，需确认）。
 */
import {
  dbClear,
  dbGetAll,
  dbPut,
  dbPutMany,
  type StoreName,
} from './db'

const STORES: StoreName[] = ['papers', 'pageTexts', 'extracts', 'chats', 'notes', 'settings', 'glossary']

export interface BackupFile {
  app: 'paper-study'
  schema: 2
  exportedAt: string
  data: Partial<Record<StoreName, unknown[]>>
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < buf.length; i += chunk) {
    s += String.fromCharCode(...buf.subarray(i, i + chunk))
  }
  return btoa(s)
}

function base64ToBlob(b64: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: 'application/pdf' })
}

export async function buildBackup(): Promise<BackupFile> {
  const data: Partial<Record<StoreName, unknown[]>> = {}
  for (const store of STORES) {
    const rows = (await dbGetAll<Record<string, unknown>>(store)) as unknown[]
    if (store === 'papers') {
      data.papers = await Promise.all(
        (rows as { pdfBlob?: Blob }[]).map(async (r) => {
          if (r.pdfBlob instanceof Blob) {
            return { ...r, pdfBlob: undefined, pdfBase64: await blobToBase64(r.pdfBlob) }
          }
          return r
        }),
      )
    } else {
      data[store] = rows
    }
  }
  return { app: 'paper-study', schema: 2, exportedAt: new Date().toISOString(), data }
}

export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `paper-study-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** 整库还原：清空所有 store 后写入备份内容。返回写入条数 */
export async function restoreBackup(file: BackupFile): Promise<number> {
  if (file?.app !== 'paper-study' || file.schema !== 2) {
    throw new Error('备份文件格式不正确（需要书斋 schema 2 的备份 JSON）。')
  }
  let count = 0
  for (const store of STORES) {
    await dbClear(store)
    const rows = file.data?.[store]
    if (!Array.isArray(rows)) continue
    if (store === 'papers') {
      const papers = (rows as { pdfBase64?: string; pdfBlob?: Blob }[]).map((r) => {
        const { pdfBase64, ...rest } = r
        return pdfBase64 ? { ...rest, pdfBlob: base64ToBlob(pdfBase64) } : rest
      })
      await dbPutMany('papers', papers)
    } else {
      await dbPutMany(store, rows)
    }
    count += rows.length
  }
  // settings 单例兜底（可能缺行）
  if (!(await dbGetAll('settings')).length) {
    await dbPut('settings', { key: 'app' })
  }
  return count
}
