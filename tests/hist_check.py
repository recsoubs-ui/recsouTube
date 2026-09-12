import asyncio, sys, random
from playwright.async_api import async_playwright
URL = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
        page = await b.new_page(viewport={"width": 1280, "height": 720})
        calls = []
        page.on("request", lambda r: calls.append(r.method + " " + r.url.split("/api")[-1]) if "/api/" in r.url else None)
        email = f"qa_{random.randint(1,999999)}@example.com"
        await page.goto(URL + "/register", wait_until="networkidle")
        await page.fill("[data-testid='register-username']", "qa" + str(random.randint(1,99999)))
        await page.fill("[data-testid='register-email']", email)
        await page.fill("[data-testid='register-password']", "qatester123")
        await page.click("[data-testid='register-submit']")
        await page.wait_for_timeout(2000)
        await page.goto(URL + "/watch/dQw4w9WgXcQ", wait_until="networkidle")
        await page.wait_for_selector("[data-testid='watch-title']", timeout=60000)
        await page.wait_for_timeout(2500)
        print("API CALLS:", [c for c in calls if any(k in c for k in ("history","likes","subscriptions"))])
        await page.click("[data-testid='watch-subscribe-button']")
        await page.wait_for_timeout(1500)
        print("SUB BTN:", await page.locator("[data-testid='watch-subscribe-button']").inner_text())
        await page.goto(URL + "/history", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        print("HISTORY:", (await page.evaluate("document.body.innerText")).count("Rick Astley"))
        await page.goto(URL + "/watch/dQw4w9WgXcQ", wait_until="networkidle")
        await page.wait_for_selector("[data-testid='watch-title']", timeout=60000)
        await page.wait_for_timeout(2500)
        print("SUB BTN AFTER REVISIT:", await page.locator("[data-testid='watch-subscribe-button']").inner_text())
        await b.close()
asyncio.run(main())
