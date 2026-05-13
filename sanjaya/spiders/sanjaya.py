import scrapy
import re
from scrapy_playwright.page import PageMethod

class SanjayaSpider(scrapy.Spider):
    name = "sanjaya"
    
    start_urls = [
        "https://devpsy.bnu.edu.cn/CN/10.16187/j.cnki.issn1001-4918.2024.06.01", # Direct Article
        "https://devpsy.bnu.edu.cn/CN/volumn/volumn_190.shtml" # Volume Index
    ]

    def __init__(self, start_urls=None, *args, **kwargs):
        super(SanjayaSpider, self).__init__(*args, **kwargs)
        if start_urls:
            self.start_urls = start_urls.split(',')

    def start_requests(self):
        for url in self.start_urls:
            # For Index pages and Search pages, we need Playwright
            if 'volumn_' in url or 'searchArticle' in url:
                yield scrapy.Request(
                    url, 
                    callback=self.parse, 
                    meta={
                        "playwright": True, 
                        "playwright_include_page": True,
                        "playwright_page_methods": [
                            # Wait for the article links to appear in the DOM
                            # We use a long timeout because academic servers can be slow
                            PageMethod("wait_for_selector", ".biaoti", timeout=15000),
                        ],
                    }
                )
            else:
                yield scrapy.Request(url, callback=self.parse)

    def parse(self, response):
        """
        The Router: Determine if this is a list of links or an actual article.
        """
        if 'volumn_' in response.url or 'searchArticle' in response.url:
            self.logger.info(f"Found Index/Search Page: {response.url}")
            
            article_links = response.css('.biaoti::attr(href)').getall()
            self.logger.info(f"Discovered {len(article_links)} article links.")
            
            for link in article_links:
                yield response.follow(link, callback=self.parse_article)
                
        else:
            yield from self.parse_article(response)

    def parse_article(self, response):
        """
        Step 1: The Fast Pass (Static HTTP) for Articles.
        """
        self.logger.info(f"Attempting static extraction for: {response.url}")
        
        title_blocks = response.css('.abs-tit::text').getall()
        body_blocks = response.css('#author~ p+ p::text, p::text').getall()
        
        raw_text = title_blocks + body_blocks
        cleaned_text = self._clean_text(raw_text)

        if len(cleaned_text) < 100:
            self.logger.warning(f"Insufficient text. Initiating Playwright for: {response.url}")
            yield scrapy.Request(
                url=response.url,
                callback=self.parse_dynamic,
                meta={"playwright": True},
                dont_filter=True 
            )
        else:
            self.logger.info("Static extraction successful.")
            yield {
                "url": response.url,
                "extraction_method": "static",
                "content": cleaned_text
            }

    def parse_dynamic(self, response):
        """
        Step 2: The Fallback (Playwright).
        """
        self.logger.info(f"Extracting via Headless Browser: {response.url}")
        
        title_blocks = response.css('.abs-tit::text').getall()
        body_blocks = response.css('#author~ p+ p::text, p::text').getall()
        
        cleaned_text = self._clean_text(title_blocks + body_blocks)

        yield {
            "url": response.url,
            "extraction_method": "dynamic_playwright",
            "content": cleaned_text
        }

    def _clean_text(self, text_list):
        """Helper to strip whitespace, newlines, and tabs."""
        combined = " ".join([t.strip() for t in text_list if t.strip()])
        cleaned = re.sub(r'\s+', ' ', combined) 
        return cleaned.strip()
