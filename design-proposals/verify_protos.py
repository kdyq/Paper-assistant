# -*- coding: utf-8 -*-
"""视觉原型自动化验证：4 页面 x (加载/无JS错误/亮暗切换/关键交互/截图)
用法: python verify_protos.py  (在 design-proposals 目录下运行, 需 http://127.0.0.1:8123)
"""
import pathlib, sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8123"
OUT = pathlib.Path(__file__).parent / "verify"
OUT.mkdir(exist_ok=True)

PAGES = ["index.html", "proposal-a.html", "proposal-b.html", "proposal-c.html"]

def check_page(pg, url, results):
    errors = []
    pg.goto(url, wait_until="domcontentloaded")
    pg.wait_for_timeout(3400)  # 等入场动画 + 3s 兜底清理结束

    # JS 控制台错误
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))

    name = url.rsplit("/", 1)[-1].replace(".html", "")
    r = {"page": name, "errors": [], "checks": {}}

    # 1. GSAP 是否加载（仅原型页需要）
    if "proposal" in url:
        r["checks"]["gsap_loaded"] = pg.evaluate("typeof gsap !== 'undefined'")

    # 2. 关键容器可见
    for sel in [".sheet", ".article", ".page"]:
        el = pg.query_selector(sel)
        if el:
            r["checks"][f"visible{sel}"] = el.is_visible()

    # 3. 入场动画后按钮 inline style 已清理（历史冻结问题回归检查）
    if "proposal" in url:
        leftover = pg.evaluate(
            "Array.from(document.querySelectorAll('[data-anim]'))"
            ".filter(e => e.style.opacity === '0' || e.style.visibility === 'hidden').length"
        )
        r["checks"]["no_frozen_entrance"] = leftover == 0

    # 4. 亮色截图
    pg.screenshot(path=str(OUT / f"{name}-light.png"))

    # 5. 明暗切换
    theme_btn = pg.query_selector("#themeBtn")
    if theme_btn:
        before = pg.evaluate("getComputedStyle(document.body).backgroundColor")
        theme_btn.click()
        pg.wait_for_timeout(600)
        after = pg.evaluate("getComputedStyle(document.body).backgroundColor")
        theme_now = pg.evaluate("document.documentElement.dataset.theme")
        r["checks"]["theme_toggles"] = (before != after) and theme_now == "dark"
        pg.screenshot(path=str(OUT / f"{name}-dark.png"))
        # 切回亮色，避免影响后续
        theme_btn.click()
        pg.wait_for_timeout(300)

    # 6. 页面专属交互
    if url.endswith("proposal-a.html"):
        # 提取卡定位按钮
        pg.click('.extract-card [data-loc="loc1"]')
        pg.wait_for_timeout(600)
        r["checks"]["locate_flash"] = pg.evaluate(
            "document.getElementById('loc1').classList.contains('flash')"
        )
        pg.click('.ai-tab[data-tab="chat"]')
        pg.wait_for_timeout(400)
        r["checks"]["tab_switch"] = pg.evaluate(
            "document.querySelector('[data-pane=chat]').classList.contains('active')"
        )
    if url.endswith("proposal-b.html"):
        pg.click('.seg-btn[data-tab="notes"]')
        pg.wait_for_timeout(400)
        r["checks"]["seg_switch"] = pg.evaluate(
            "document.querySelector('[data-pane=notes]').classList.contains('active')"
        )
        r["checks"]["status_bar"] = pg.query_selector(".statusbar") is not None
    if url.endswith("proposal-c.html"):
        pg.click("#shelfBtn")
        pg.wait_for_timeout(600)
        r["checks"]["shelf_overlay"] = pg.evaluate(
            "document.getElementById('scrim').classList.contains('open')"
        )
        pg.screenshot(path=str(OUT / "proposal-c-shelf.png"))
        pg.click("#shelfClose")
        pg.wait_for_timeout(400)
        pg.click("#fabBtn")
        pg.wait_for_timeout(800)
        r["checks"]["ai_float_open"] = pg.evaluate(
            "document.getElementById('aiFloat').classList.contains('open')"
        )
        pg.screenshot(path=str(OUT / "proposal-c-ai.png"))

    pg.wait_for_timeout(400)  # 收集迟到的 console 错误
    r["errors"] = [e for e in errors if "favicon" not in e.lower() and "ERR_ICANN" not in e]
    results.append(r)

def main():
    ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1440, "height": 900})
        results = []
        for f in PAGES:
            try:
                check_page(pg, f"{BASE}/{f}", results)
            except Exception as e:
                results.append({"page": f, "fatal": str(e)})
                ok = False
        browser.close()

    for r in results:
        print(f"\n== {r['page']} ==")
        if "fatal" in r:
            print(f"  FATAL: {r['fatal']}")
            continue
        for k, v in r["checks"].items():
            print(f"  {'PASS' if v else 'FAIL'}  {k}")
            if not v:
                ok = False
        if r["errors"]:
            print("  JS ERRORS:")
            for e in r["errors"]:
                print(f"    - {e[:200]}")
            ok = False
        else:
            print("  PASS  no_js_errors")
    print("\nRESULT:", "ALL PASS" if ok else "HAS FAILURES")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
