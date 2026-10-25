/** 生成短随机 id（crypto.randomUUID 优先） */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().slice(0, 13).replace(/-/g, '')
  }
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
}
