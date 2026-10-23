#!/usr/bin/env python3
"""Drive the built app in a real browser with the network hard-blocked.

Verifies the acceptance criteria that can only be checked by running it:
  P1  every scenario x lever state x card renders its authored response
  P2  the jargon counter's final number == the authored term list length
  P3  every authored term actually got marked in the DOM (none silently lost)
  P4  keyword-on states show >= 10 terms flagged as absent from the prompt
  P5  the typewriter is skippable and the card draw can be replayed
  P6  no network request is attempted, and no console error is emitted
  P7  it lays out on a phone-sized viewport and a projector-sized one
"""
import json, os, sys, asyncio
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = "file://" + ROOT + "/the-stranger.html"
SHOTS = ROOT + "/shots"
os.makedirs(SHOTS, exist_ok=True)
content = json.load(open(f"{ROOT}/build/content.json"))

fails, requests, errors = [], [], []


async def guard(page):
    async def route(r):
        if not r.request.url.startswith("file://"):
            requests.append(r.request.url)
            await r.abort()
        else:
            await r.continue_()
    await page.route("**/*", route)
    page.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))


async def ask_state(page, sc_i, bits, card=None, instant=True):
    """Set levers, force a card, ask, then skip to the end. Returns meter state."""
    await page.evaluate(
        "([i,bits,card])=>{const A=window.__stranger;A.set(i,bits,card);A.ask();}",
        [sc_i, bits, card])
    # card stage animation, then the stream
    await page.wait_for_timeout(2600 if card else 200)
    await page.evaluate("()=>{const t=window.__stranger.typer; if(t) t.skip();}")
    await page.wait_for_timeout(120)
    return await page.evaluate("""()=>{
        const w=document.querySelector('#colLive .row'); if(!w) return null;
        const md=w.querySelector('.md');
        return {
          count:+w.querySelector('.meter .big').textContent,
          total:+w.dataset.total, novelTotal:+w.dataset.novelTotal,
          marks:md.querySelectorAll('mark.jg').length,
          novelMarks:md.querySelectorAll('mark.jg[data-novel="1"]').length,
          text:md.innerText.replace(/\\s+/g,' ').trim(),
          chip:(w.querySelector('.chip.target')||{}).textContent||'',
          pending:md.querySelectorAll('.tw-pending').length
        };
    }""")


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--disable-dev-shm-usage"])
        ctx = await browser.new_context(viewport={"width": 1920, "height": 1080}, offline=True)
        page = await ctx.new_page()
        await guard(page)
        await page.goto(APP)
        await page.wait_for_timeout(300)
        # the "how this works" sheet is the first thing anyone sees
        if not await page.is_visible("#mHelp.show .steps li"):
            fails.append("intro/help sheet did not open on first load")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(100)

        n_checked = 0
        for i, sc in enumerate(content["scenarios"]):
            states = [("010", None), ("110", None), ("011", None), ("111", None)]
            for b in ("000", "100", "001", "101"):
                for c in sc["cards"]:
                    states.append((b, c))
            for bits, card in states:
                key = f"{bits}|{card}" if card else bits
                r = sc["responses"][key]
                got = await ask_state(page, i, bits, card)
                tag = f"{sc['id']}/{key}"
                if not got:
                    fails.append(f"P1 {tag}: nothing rendered"); continue
                n_checked += 1
                if got["pending"]:                                        # P5
                    fails.append(f"P5 {tag}: {got['pending']} elements still hidden after skip")
                if got["marks"] != len(r["terms"]):                        # P3
                    fails.append(f"P3 {tag}: {got['marks']} marks vs {len(r['terms'])} authored terms")
                if got["count"] != len(r["terms"]):                        # P2
                    fails.append(f"P2 {tag}: meter says {got['count']}, authored {len(r['terms'])}")
                if bits[2] == "1" and got["novelMarks"] < 10:              # P4
                    fails.append(f"P4 {tag}: only {got['novelMarks']} novel terms shown")
                first = r["md"].split("\n")[0].lstrip("# ").replace("**", "")[:40]
                if first and first[:30] not in got["text"][:400]:          # P1
                    fails.append(f"P1 {tag}: rendered text does not start with authored text")
                if card and DATA_LABEL(sc, card) not in got["chip"]:
                    fails.append(f"P1 {tag}: target chip missing/wrong ({got['chip']!r})")

        # --- typewriter is genuinely progressive, and skippable mid-stream (P5)
        await page.evaluate("()=>{const A=window.__stranger;A.S.sc=0;A.S.bits=[1,1,1];A.ask();}")
        await page.wait_for_timeout(450)
        mid = await page.evaluate("()=>document.querySelector('#colLive .md').innerText.length")
        await page.wait_for_timeout(400)
        mid2 = await page.evaluate("()=>document.querySelector('#colLive .md').innerText.length")
        await page.evaluate("()=>window.__stranger.typer.skip()")
        await page.wait_for_timeout(100)
        end = await page.evaluate("()=>document.querySelector('#colLive .md').innerText.length")
        if not (0 < mid < mid2 < end):
            fails.append(f"P5 typewriter not progressive/skippable: {mid} -> {mid2} -> {end}")

        # --- card replay (P5)
        await page.evaluate("()=>{const A=window.__stranger;A.S.sc=1;A.S.bits=[0,0,0];A.S.forced='safe';A.ask();}")
        await page.wait_for_timeout(2700)
        await page.evaluate("()=>window.__stranger.drawCard(window.__stranger.S.lastCard,null)")
        await page.wait_for_timeout(250)
        if not await page.is_visible("#cardStage.show .tcard"):
            fails.append("P5 card replay did not show a card")
        await page.keyboard.press("Escape")

        # --- deck slides away when lever 2 goes on
        await page.evaluate("()=>{const A=window.__stranger;A.S.bits=[0,1,0];A.ask();}")
        await page.wait_for_timeout(300)
        if "gone" not in (await page.get_attribute("#deck", "class") or ""):
            fails.append("deck did not slide away with the success spec on")

        # --- highlight, compare, scoreboard
        await page.evaluate("()=>window.__stranger.setHighlight(true)")
        if not await page.evaluate("()=>getComputedStyle(document.querySelector('mark.jg')).backgroundColor !== 'rgba(0, 0, 0, 0)'"):
            fails.append("highlight toggle did not change mark styling")
        await page.evaluate("()=>window.__stranger.pin()")
        await page.wait_for_timeout(200)
        if not await page.is_visible("#colPin .bubble.ai"):
            fails.append("compare pin did not render a second column")
        await page.evaluate("""()=>{const A=window.__stranger;
            A.recordScore('test','000|dense',3);A.recordScore('test','100|dense',5);
            A.recordScore('test','110',7);A.recordScore('test','111',10);}""")
        await page.click("#btnScoreboard")
        await page.wait_for_timeout(250)
        if not await page.is_visible("#chart svg polyline"):
            fails.append("scoreboard chart did not draw a line")
        await page.screenshot(path=f"{SHOTS}/05-scoreboard.png")
        await page.keyboard.press("Escape")

        # --- projector screenshots
        await page.evaluate("()=>{const A=window.__stranger;A.unpin();A.setHighlight(false);A.setMode('presenter');A.set(0,'000','exhaustive');A.ask();}")
        await page.wait_for_timeout(900)
        if not await page.is_visible("#cardStage.show .tcard"):
            fails.append("P5 card was not on screen when the draw was captured")
        await page.screenshot(path=f"{SHOTS}/01-card-draw.png")
        await page.wait_for_timeout(1800)
        await page.evaluate("()=>window.__stranger.typer.skip()")
        await page.wait_for_timeout(250)
        await page.screenshot(path=f"{SHOTS}/02-levers-off.png")
        await page.evaluate("()=>{const A=window.__stranger;A.set(1,'111');A.setHighlight(true);A.ask();}")
        await page.wait_for_timeout(400)
        await page.evaluate("()=>window.__stranger.typer.skip()")
        await page.wait_for_timeout(250)
        await page.screenshot(path=f"{SHOTS}/03-all-levers-jargon.png")
        await page.evaluate("()=>window.__stranger.pin()")
        await page.evaluate("()=>{const A=window.__stranger;A.set(1,'001','peer');A.ask();}")
        await page.wait_for_timeout(2700)
        await page.evaluate("()=>window.__stranger.typer && window.__stranger.typer.skip()")
        await page.wait_for_timeout(250)
        await page.screenshot(path=f"{SHOTS}/04-compare.png")
        await page.evaluate("()=>window.__stranger.unpin()")

        # --- student mode + quiz
        await page.evaluate("()=>{const A=window.__stranger;A.unpin();A.set(0,'000');A.setMode('student');}")
        await page.wait_for_timeout(2900)
        await page.evaluate("()=>window.__stranger.typer && window.__stranger.typer.skip()")
        steps = await page.evaluate("()=>window.__stranger.guideSteps().length")
        for _ in range(steps - 1):
            await page.click("#gNext")
            await page.wait_for_timeout(2700)
            await page.evaluate("()=>window.__stranger.typer && window.__stranger.typer.skip()")
        if not await page.evaluate("()=>document.querySelector('#modeSeg [data-mode=student]').classList.contains('on')"):
            fails.append("mode segmented control did not mark student as active")
        if not await page.is_visible(".quiz .opt"):
            fails.append("student guide did not end on a quiz")
        await page.click(".quiz .opt")
        await page.wait_for_timeout(150)
        if not await page.is_visible(".quiz .fb"):
            fails.append("quiz gave no feedback")
        await page.screenshot(path=f"{SHOTS}/06-student-quiz.png")

        # --- closing screen
        await page.evaluate("()=>{document.querySelector('#btnFinish').click()}")
        await page.wait_for_timeout(250)
        if not await page.is_visible("#closing.show .big"):
            fails.append("closing screen did not show")
        await page.screenshot(path=f"{SHOTS}/07-closing.png")

        # --- phone viewport (P7)
        phone = await browser.new_context(viewport={"width": 390, "height": 844},
                                          device_scale_factor=2, is_mobile=True,
                                          has_touch=True, offline=True)
        p2 = await phone.new_page()
        await guard(p2)
        await p2.goto(APP)
        await p2.wait_for_timeout(300)
        await p2.keyboard.press("Escape")
        await p2.wait_for_timeout(100)
        await p2.evaluate("()=>{const A=window.__stranger;A.S.sc=0;A.S.bits=[1,1,1];A.setHighlight(true);A.ask();}")
        await p2.wait_for_timeout(400)
        await p2.evaluate("()=>window.__stranger.typer.skip()")
        await p2.wait_for_timeout(250)
        overflow = await p2.evaluate("()=>document.documentElement.scrollWidth - document.documentElement.clientWidth")
        if overflow > 2:
            fails.append(f"P7 phone viewport overflows horizontally by {overflow}px")
        await p2.screenshot(path=f"{SHOTS}/08-phone.png")
        await p2.evaluate("()=>window.__stranger.setMode('student')")
        await p2.wait_for_timeout(2900)
        await p2.evaluate("()=>window.__stranger.typer && window.__stranger.typer.skip()")
        await p2.wait_for_timeout(150)
        await p2.screenshot(path=f"{SHOTS}/09-phone-student.png")

        await browser.close()

    print(f"states exercised: {n_checked}")
    print("network requests attempted:", len(requests), requests[:5])       # P6
    real_errors = [e for e in errors if "unmarked terms" not in e]
    print("console errors/warnings:", len(real_errors), real_errors[:5])
    if requests:
        fails.append(f"P6 network requests attempted: {requests[:3]}")
    if real_errors:
        fails.append(f"P6 console errors: {real_errors[:3]}")
    unmarked = [e for e in errors if "unmarked terms" in e]
    if unmarked:
        fails.append(f"P3 terms not markable in DOM: {unmarked[:3]}")

    if fails:
        print(f"\n{len(fails)} FAILURES")
        for f in fails[:30]:
            print("  x", f)
        sys.exit(1)
    print("\nall playtest gates pass")


def DATA_LABEL(sc, card):
    return content["cards"][card]["label"]


asyncio.run(main())
