import gsap from 'gsap'

/**
 * GSAP 安全模式封装（DEVELOPMENT.md §3.4，强制）
 *
 * 历史教训：入场动画在部分环境对元素中途冻结（inline opacity/transform 卡住，
 * 按钮不可见不可点）。因此本项目所有动效必须：
 *   1. 只用 gsap.from(...)——库加载失败时内容天然可见；
 *   2. timeline defaults 带 clearProps:'all'，onComplete 里统一 clearProps；
 *   3. 另加 3 秒兜底 setTimeout 再清一次；
 *   4. 尊重 prefers-reduced-motion，命中则完全不动。
 *
 * 组件不得手写裸 timeline，一律调用本文件的两个入口。
 */

export function prefersReduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

function wipe(targets: gsap.TweenTarget) {
  gsap.set(targets, { clearProps: 'all' })
}

/**
 * 入场编排：build 回调里用 tl.from(...) 组装（只能 from）。
 * 自动附加双兜底清理，reduced-motion 时完全不执行。
 */
export function safeTimeline(
  build: (tl: gsap.core.Timeline) => gsap.core.Timeline | void,
): void {
  if (prefersReduced()) return
  const all = document.querySelectorAll('[data-anim]')
  const wipeAll = () => wipe(all)
  const tl = gsap.timeline({
    defaults: { ease: 'power2.out', duration: 0.4, clearProps: 'all' },
    onComplete: wipeAll,
  })
  try {
    build(tl)
  } catch {
    wipeAll()
  }
  setTimeout(wipeAll, 3000)
}

/** 单次轻动效（如 tab 切换），同样只 from + 兜底清理。 */
export function safeFrom(targets: gsap.TweenTarget, vars: gsap.TweenVars): void {
  if (prefersReduced()) return
  try {
    gsap.from(targets, { ...vars, clearProps: 'all' })
  } catch {
    wipe(targets)
  }
  setTimeout(() => wipe(targets), 2500)
}
