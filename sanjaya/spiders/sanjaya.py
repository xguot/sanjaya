import scrapy
import re
from scrapy_playwright.page import PageMethod

class SanjayaSpider(scrapy.Spider):
    name = "sanjaya"
    
    start_urls = [
        "https://devpsy.bnu.edu.cn/CN/10.16187/j.cnki.issn1001-4918.2024.06.01"
    ]

    def __init__(self, start_urls=None, *args, **kwargs):
        super(SanjayaSpider, self).__init__(*args, **kwargs)
        if start_urls:
            self.start_urls = start_urls.split(',')

    def start_requests(self):
        for url in self.start_urls:
            # Handle BNU Index/Search pages
            if 'volumn_' in url or 'searchArticle' in url:
                yield scrapy.Request(
                    url, 
                    callback=self.parse, 
                    meta={
                        "playwright": True, 
                        "playwright_include_page": True,
                        "playwright_page_methods": [
                            PageMethod("wait_for_selector", ".biaoti", timeout=15000),
                        ],
                    }
                )
            else:
                # Direct Article URLs
                # For non-BNU sites, many academic publishers block static Scrapy
                # We start with static but fallback to Playwright quickly
                yield scrapy.Request(url, callback=self.parse_article)

    def parse(self, response):
        """Router for BNU index pages."""
        if 'volumn_' in response.url or 'searchArticle' in response.url:
            article_links = response.css('.biaoti::attr(href)').getall()
            for link in article_links:
                yield response.follow(link, callback=self.parse_article)
        else:
            yield from self.parse_article(response)

    def parse_article(self, response):
        """Attempt to extract text using specialized and generic selectors."""
        self.logger.info(f"Extracting: {response.url}")
        
        # 1. BNU Specialized Selectors
        title_blocks = response.css('.abs-tit::text').getall()
        body_blocks = response.css('#author~ p+ p::text, p::text').getall()
        
        # 2. Generic Academic Selectors (Publisher Agnostic)
        if not title_blocks:
            title_blocks = response.css('h1::text, .article-title::text, [itemprop="name"]::text, .publication-title::text').getall()
        
        if len(" ".join(body_blocks)) < 200:
            body_blocks += response.css('.abstract p::text, .abstract-text::text, #abstract p::text, article p::text, .article-section p::text, main p::text').getall()

        cleaned_text = self._clean_text(title_blocks + body_blocks)

        # 3. Fallback to Playwright if static extraction yields too little data
        if len(cleaned_text) < 300 and not response.meta.get("playwright"):
            self.logger.warning(f"Static extraction insufficient for {response.url}. Re-attempting with Playwright.")
            yield scrapy.Request(
                url=response.url,
                callback=self.parse_article,
                meta={"playwright": True},
                dont_filter=True 
            )
        else:
            # Yield result if we have data or if we already tried Playwright
            if cleaned_text:
                yield {
                    "url": response.url,
                    "extraction_method": "dynamic_playwright" if response.meta.get("playwright") else "static",
                    "content": cleaned_text
                }
            else:
                self.logger.error(f"Failed to extract any text from {response.url}")

    def _clean_text(self, text_list):
        """Helper to strip whitespace, newlines, and tabs."""
        combined = " ".join([t.strip() for t in text_list if t.strip()])
        cleaned = re.sub(r'\s+', ' ', combined) 
        return cleaned.strip()
