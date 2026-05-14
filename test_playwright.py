import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        try:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto("https://example.com")
            print(f"Title: {await page.title()}")
            await browser.close()
            print("Playwright is working.")
        except Exception as e:
            print(f"Playwright failed: {e}")

asyncio.run(run())
