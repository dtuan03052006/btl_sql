from playwright.sync_api import Page, expect

class BasePage:
    def __init__(self, page: Page, base_url: str = "http://127.0.0.1:8000"):
        self.page = page
        self.base_url = base_url

    def navigate_to_app(self):
        self.page.goto(self.base_url)
        self.page.wait_for_load_state("domcontentloaded")
        self.page.wait_for_selector("#live-clock", timeout=10000)

    def switch_nav(self, nav_id: str):
        self.page.click(f"#{nav_id}")
        self.page.wait_for_timeout(300)

    def get_toast_message(self):
        toast = self.page.locator("#toast-container > div").last
        expect(toast).to_be_visible(timeout=5000)
        return toast.inner_text()
