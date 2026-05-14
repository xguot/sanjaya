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
                # We start with static but handle all status codes to allow Playwright fallback
                yield scrapy.Request(
                    url, 
                    callback=self.parse_article,
                    meta={'handle_httpstatus_all': True}
                )

    def parse(self, response):
        """Router for BNU index pages."""
        if 'volumn_' in response.url or 'searchArticle' in response.url:
            article_links = response.css('.biaoti ::attr(href)').getall()
            for link in article_links:
                yield response.follow(
                    link, 
                    callback=self.parse_article,
                    meta={'handle_httpstatus_all': True}
                )
        else:
            yield from self.parse_article(response)

    def parse_article(self, response):
        """Attempt to extract text using specialized and generic selectors."""
        self.logger.info(f"Extracting: {response.url} (Status: {response.status})")
        
        # 1. BNU Specialized Selectors (using ::text for all descendants)
        title_blocks = response.css('.abs-tit ::text').getall()
        # Specific BNU body blocks
        body_blocks = response.css('#author~ p+ p ::text').getall()
        
        # 2. Generic Academic Selectors (Publisher Agnostic)
        if not title_blocks:
            title_blocks = response.css('h1 ::text, .article-title ::text, [itemprop="name"] ::text, .publication-title ::text').getall()
        
        # Fallback to broad paragraph extraction if specific blocks are empty or too short
        if len(" ".join(body_blocks)) < 200:
            body_blocks += response.css('p ::text').getall()
            
        # 3. Deep Content Extraction (Proper XPaths for common structures)
        if len(" ".join(body_blocks)) < 300:
            # Target common abstract and content containers
            body_blocks += response.xpath('//div[contains(@class, "abstract")]//text() | //div[contains(@id, "abstract")]//text() | //section[contains(@class, "abstract")]//text()').getall()
            body_blocks += response.xpath('//div[contains(@class, "article-body")]//text() | //div[contains(@class, "entry-content")]//text() | //div[contains(@id, "content")]//text()').getall()
            # Absolute fallback: any article or main tag
            body_blocks += response.xpath('//article//p//text() | //main//p//text()').getall()

        cleaned_text = self._clean_text(title_blocks + body_blocks)

        # 4. Fallback to Playwright if static extraction yields too little data OR if we got a non-200 status
        is_blocked = response.status in [403, 401, 429, 503]
        if (len(cleaned_text) < 400 or is_blocked) and not response.meta.get("playwright"):
            reason = "insufficient content" if not is_blocked else f"status {response.status}"
            self.logger.warning(f"Static extraction failed ({reason}). Re-attempting with Playwright: {response.url}")
            yield scrapy.Request(
                url=response.url,
                callback=self.parse_article,
                meta={
                    "playwright": True,
                    "playwright_page_methods": [
                        PageMethod("wait_for_timeout", 5000), # Allow time for JS to render
                    ]
                },
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
                self.logger.error(f"FATAL: Failed to extract any text from {response.url} after {'Playwright' if response.meta.get('playwright') else 'static'} attempt.")

    def _clean_text(self, text_list):
        """Helper to strip whitespace, newlines, and tabs."""
        combined = " ".join([t.strip() for t in text_list if t.strip()])
        cleaned = re.sub(r'\s+', ' ', combined) 
        return cleaned.strip()
