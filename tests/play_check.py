import asyncio
import sys

from playwright.async_api import async_playwright

URL = sys.argv[1]


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="/usr/bin/google-chrome",
            headless=True,
            args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
        )
        page = await browser.new_page(viewport={"width": 1280, "height": 720})
        print("codecs", await page.evaluate("""() => { const v=document.createElement('video'); return v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'); }"""))
        await page.goto(URL, wait_until="networkidle")
        await page.fill("[data-testid='header-search-input']", "music")
        await page.click("[data-testid='header-search-submit']")
        await page.wait_for_selector("[data-testid^='video-card-']", timeout=60000)
        n = await page.locator("[data-testid^='video-card-']").count()
        print("search cards", n)
        await page.goto(URL.rstrip("/") + "/watch/dQw4w9WgXcQ", wait_until="networkidle")
        await page.wait_for_selector("[data-testid='watch-title']", timeout=60000)
        await page.wait_for_timeout(3000)
        cont = page.locator("[data-testid='player-container']")
        print("stream", await cont.get_attribute("data-stream-kind"), await cont.get_attribute("data-stream-label"))
        await page.click("[data-testid='player-big-play-button']")
        await page.wait_for_timeout(6000)
        info = await page.evaluate("""() => { const v=document.querySelector('video'); return {rs:v.readyState, t:v.currentTime, dur:v.duration, paused:v.paused, err:v.error&&v.error.code, w:v.videoWidth, h:v.videoHeight}; }""")
        print("playback", info)
        print("error overlay", await page.locator("[data-testid='player-stream-error']").count())
        print("time label", await page.locator("[data-testid='player-time']").inner_text())
        await page.screenshot(path="/tmp/play_check.jpg", quality=40, type="jpeg")
        await browser.close()


asyncio.run(main())
