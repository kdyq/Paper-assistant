/**
 * 公式辅助（Step 10）：数学文本检测 + PDF 线性文本 → LaTeX 的轻量清洗。
 * PDF 文本层提取的公式是线性残文，只做尽力转换；失败则 KaTeX 容错渲染或原样展示。
 */

export function looksMathy(s: string): boolean {
  if (!s || s.length > 400) return false
  const mathChars =
    /[=√∑∫∏≤≥±×÷≠≈∈∞∂∇^_αβγδεζηθικλμνξπρστυφχψωΑΒΓΔΕΘΛΞΠΣΦΨΩℓ]/
  return mathChars.test(s)
}

const SYMBOL_MAP: [RegExp, string][] = [
  [/√\s*\(([^()]+)\)/g, '\\sqrt{$1}'],
  [/√\s*([A-Za-z0-9]+)/g, '\\sqrt{$1}'],
  [/×/g, ' \\times '],
  [/÷/g, ' \\div '],
  [/≤/g, ' \\le '],
  [/≥/g, ' \\ge '],
  [/≠/g, ' \\ne '],
  [/≈/g, ' \\approx '],
  [/∈/g, ' \\in '],
  [/∞/g, ' \\infty '],
  [/→/g, ' \\to '],
  [/∑/g, ' \\sum '],
  [/∏/g, ' \\prod '],
  [/∫/g, ' \\int '],
  [/∂/g, ' \\partial '],
  [/∇/g, ' \\nabla '],
  [/ℓ/g, ' \\ell '],
  [/α/g, '\\alpha '],
  [/β/g, '\\beta '],
  [/γ/g, '\\gamma '],
  [/δ/g, '\\delta '],
  [/ε/g, '\\epsilon '],
  [/θ/g, '\\theta '],
  [/λ/g, '\\lambda '],
  [/μ/g, '\\mu '],
  [/σ/g, '\\sigma '],
  [/φ/g, '\\phi '],
  [/ω/g, '\\omega '],
  [/Δ/g, ' \\Delta '],
  [/Γ/g, ' \\Gamma '],
  [/Θ/g, ' \\Theta '],
  [/Λ/g, ' \\Lambda '],
  [/Σ/g, ' \\Sigma '],
  [/Φ/g, ' \\Phi '],
  [/Ω/g, ' \\Omega '],
]

/** PDF 线性公式文本 → LaTeX 尽力转换 */
export function toLatex(raw: string): string {
  let s = raw.trim()
  for (const [re, rep] of SYMBOL_MAP) s = s.replace(re, rep)
  // 上标：X^T 已合法；"X^2" 合法；孤立 ^ 会导致 KaTeX 报错，替换为 \wedge
  s = s.replace(/\^\s*$/, ' \\wedge ')
  // 连续空格折叠
  s = s.replace(/\s{2,}/g, ' ')
  return s.trim()
}
