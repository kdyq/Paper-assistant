/**
 * 题录启发式（DEVELOPMENT.md Step 2）：
 * 从首页文本 + PDF 元数据预填 标题/作者/年份/venue/DOI，全部可在入库对话框中修改。
 * 尽力而为（best-effort），命中不了就留空。
 */

export interface MetaGuess {
  title?: string
  titleZh?: string
  authors: string[]
  year?: number
  venue?: string
  doi?: string
}

const VENUE_PATTERNS: RegExp[] = [
  /arxiv\s*(?:preprint)?\s*(?:\d{4}\.\d{4,5})?/i,
  /\b(?:CVPR|ICCV|ECCV|NeurIPS|NIPS|ICML|ICLR|AAAI|IJCAI|ACL|EMNLP|NAACL|SIGIR|KDD|WWW|ACM MM|MM)\s*(?:20\d{2})?/i,
  /\bIEEE\s+(?:Trans\.[^,;\n]{0,40}|CVPR|ICASSP)/i,
  /\b(?:Nature|Science|Cell|PNAS)\b/i,
  /\b(?:Int\.\s*J\.\s*Comput\.\s*Vis\.|Pattern\s*Recognit\.(?:\s*Lett\.)?|Neurocomputing|Expert\s*Syst\.\s*Appl\.)\b/i,
  /《[^》]{2,30}》/,
  /\b(?:计算机学报|软件学报|计算机研究与发展|自动化学报|电子学报|计算机工程与应用|计算机科学|中国图象图形学报)\b/,
]

const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/

function isNoiseLine(line: string): boolean {
  const s = line.trim()
  if (!s) return true
  if (/^(arxiv|doi|https?:|www\.|proceedings|copyright|©|license|creative commons)/i.test(s)) return true
  if (/^\d{1,3}$/.test(s)) return true
  if (s.length < 8 && !/[\u4e00-\u9fff]/.test(s)) return true
  return false
}

/** 标题候选：找首页前部较长、非噪声、非作者列表的行 */
function guessTitle(lines: string[], metadataTitle?: string): string | undefined {
  // 元数据标题优先，但过滤"文件名式"标题（含 .pdf / 下划线密集 / 过长无空格）
  if (metadataTitle) {
    const bad = /\.pdf/i.test(metadataTitle) || /_{2,}/.test(metadataTitle) || metadataTitle.length > 300
    if (!bad) return metadataTitle
  }
  const head = lines.slice(0, 30)
  // 标题区：摘要标记之前的行（摘要正文也是纯中文行，必须排除）
  const absIdx = head.findIndex((l) => /^(摘\s*要|摘\s*要|Abstract|ABSTRACT)/.test(l.trim()))
  const zone = absIdx >= 0 ? head.slice(0, absIdx) : head

  // 中文论文：先找《》书名号
  for (const l of zone) {
    const m = l.trim().match(/《([^》]{4,60})》/)
    if (m) return m[1]
  }
  // 纯中文行（不含数字/字母/邮箱，避免误抓作者上标行）
  const zhPure = zone.find((l) => {
    const s = l.trim()
    return (
      s.length >= 8 &&
      s.length <= 40 &&
      /^[\u4e00-\u9fff]/.test(s) &&
      !/[0-9A-Za-z@]/.test(s) &&
      !/^(关键词|中图分类号|收稿日期|基金项目|DOI)/.test(s)
    )
  })
  if (zhPure) return zhPure.trim()
  // 次选：允许夹带数字的中文行，但剥离行首"作者名+上标数字"前缀
  const zhLoose = zone.find((l) => /^[\u4e00-\u9fff][\u4e00-\u9fff\s，、：:·0-9A-Za-z-]{7,60}$/.test(l.trim()))
  if (zhLoose) return cleanupZhTitle(zhLoose)

  // 英文：跳过噪声，取首个 20~200 字符、含 ≥3 个空格（近似句子/标题）且不是 "Abstract" 的行
  for (const l of head) {
    const s = l.trim()
    if (isNoiseLine(s)) continue
    if (/^(abstract|keywords|received|accepted|submitted)/i.test(s)) break
    const letters = s.replace(/[^A-Za-z]/g, '')
    const spaces = (s.match(/\s/g) ?? []).length
    const upperWords = (s.match(/\b[A-Z]{2,}\b/g) ?? []).length
    const looksLikeAuthor =
      spaces >= 2 &&
      upperWords >= 1 &&
      s.split(/\s+/).length <= 12 &&
      /^[A-Z][a-z]+/.test(s) &&
      (/,&/.test(s) || /\d+\d*|university|institute|lab|college|academy|dept|center/i.test(s) ||
        /^([A-Z]\.\s?)+[A-Z][a-z]+/.test(s))
    if (looksLikeAuthor) continue
    if (s.length >= 20 && s.length <= 200 && spaces >= 2 && letters.length / s.length > 0.5) {
      return s
    }
  }
  // 兜底：首个非噪声行
  const first = head.find((l) => !isNoiseLine(l))
  return first?.trim()
}

/** 剥离中文标题行行首的"作者名+上标数字"前缀（如 "袁雪丰1 刘雪莉1 "） */
function cleanupZhTitle(s: string): string {
  let t = s.trim()
  for (;;) {
    const m = t.match(/^[\u4e00-\u9fff]{2,4}\d{0,2}[ \u3000]+/)
    if (!m) break
    if (t.length - m[0].length < 8) break // 避免把短标题剥没
    t = t.slice(m[0].length)
  }
  return t
}

function guessAuthors(lines: string[], titleLine: string | undefined): string[] {
  const head = lines.slice(0, 30)
  const absIdx = head.findIndex((l) => /^(摘\s*要|Abstract|ABSTRACT)/.test(l.trim()))
  const zone = absIdx >= 0 ? head.slice(0, absIdx) : head.slice(0, 12)

  // 中文作者行：整行都是 2-4 字姓名+可选上标数字（空格/顿号/逗号分隔），收集全部匹配行
  const zhNames: string[] = []
  for (const l of zone) {
    const s = l.trim().replace(/^(by|作者[:：]|members:)\s*/i, '')
    if (!s || !/^[\u4e00-\u9fff]/.test(s)) continue
    const tokens = s.split(/[ \u3000，,、]+/)
    if (!tokens.length) continue
    const nameTokens = tokens.filter((t) => /^[\u4e00-\u9fff]{2,4}\d{0,2}$/.test(t))
    // 整行至少 2/3 是姓名 token 才算作者行（防误抓正文）
    if (nameTokens.length >= Math.max(1, Math.ceil(tokens.length * (2 / 3))) && nameTokens.length >= 1) {
      for (const t of nameTokens) {
        const name = t.replace(/\d+$/, '')
        if (!zhNames.includes(name)) zhNames.push(name)
      }
    }
  }
  if (zhNames.length) return zhNames.slice(0, 15)

  const startIdx = titleLine ? head.findIndex((l) => l.trim() === titleLine) : -1
  const pool = startIdx >= 0 ? head.slice(startIdx + 1, startIdx + 6) : head.slice(1, 6)
  for (const l of pool) {
    const s = l.trim().replace(/^(by|作者[:：]|members:)\s*/i, '')
    if (!s || s.length > 300) continue
    // 英文作者行：Name, Name and Name；或 F. Last, F. Last
    if (/^[A-Z][A-Za-z'.-]*(?:\s+[A-Z][A-Za-z'.-]*){0,3}/.test(s)) {
      const seg = s.split(/\s*(?:,|;|and|&)\s*/i).filter(Boolean)
      const names = seg.filter(
        (x) =>
          /^[A-Z][A-Za-z'.-]+(\s+[A-Z][A-Za-z'.-]+)*$/.test(x.replace(/\./g, '.')) ||
          /^([A-Z]\.\s*)+[A-Z][a-z'-]+$/.test(x),
      )
      if (names.length >= 2 && names.length === seg.length) return names.slice(0, 15)
    }
  }
  return []
}

function guessYear(lines: string[], metadata?: string): number | undefined {
  const src = [metadata ?? '', ...lines.slice(0, 40)].join('\n')
  const m = src.match(/\b(19[89]\d|20[0-4]\d)\b/)
  if (!m) return undefined
  const y = Number(m[1])
  if (y >= 1990 && y <= 2099) return y
  return undefined
}

function guessVenue(lines: string[]): string | undefined {
  const src = lines.slice(0, 30).join('\n')
  for (const re of VENUE_PATTERNS) {
    const m = src.match(re)
    if (m) return m[0].trim()
  }
  return undefined
}

export function guessMeta(firstPageText: string, metadataTitle?: string): MetaGuess {
  const lines = firstPageText.split('\n').map((l) => l.replace(/\s+$/, ''))
  const title = guessTitle(lines, metadataTitle)
  const authors = guessAuthors(lines, title)
  const year = guessYear(lines)
  const venue = guessVenue(lines)
  const doi = firstPageText.match(DOI_RE)?.[0]

  // 中文标题互备：若主标题是中文则同填 titleZh；若标题是英文且页面出现疑似中文副题也抓取
  let titleZh: string | undefined
  if (title && /[\u4e00-\u9fff]/.test(title)) {
    titleZh = title
  } else {
    const zhSub = lines
      .slice(0, 20)
      .find((l) => /^[\u4e00-\u9fff][\u4e00-\u9fff\s，、：:0-9]{7,60}$/.test(l.trim()))
    if (zhSub && zhSub.trim() !== title) titleZh = zhSub.trim()
  }

  return { title, titleZh, authors, year, venue, doi }
}
