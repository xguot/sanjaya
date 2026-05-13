import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        print("Navigating to search page...")
        await page.goto('https://devpsy.bnu.edu.cn/CN/article/searchArticle.do?searchType=keyword&keyword=%E6%8A%91%E9%83%81')
        print("Waiting for redirect...")
        await page.wait_for_timeout(5000)
        content = await page.content()
        with open("debug_search.html", "w", encoding="utf-8") as f:
            f.write(content)
        print("Content saved to debug_search.html")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
