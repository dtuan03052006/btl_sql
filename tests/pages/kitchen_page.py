from playwright.sync_api import Page, expect
from tests.pages.base_page import BasePage

class KitchenPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)
        self.grid = page.locator("#kitchen-cards-grid")
        self.btn_refresh = page.locator("button:has-text('Làm mới danh sách')")

    def open_kitchen(self):
        self.switch_nav("nav-kitchen")
        expect(self.grid).to_be_visible()

    def advance_cooking_status(self):
        # Nếu có nút 'Bắt đầu nấu', bấm vào
        start_btn = self.grid.locator("button:has-text('Bắt đầu nấu')").first
        if start_btn.count() > 0 and start_btn.is_visible():
            start_btn.click()
            self.page.wait_for_timeout(500)

        # Bấm 'Hoàn thành (Trừ kho)'
        done_btn = self.grid.locator("button:has-text('Hoàn thành (Trừ kho)')").first
        if done_btn.count() > 0 and done_btn.is_visible():
            done_btn.click()
            self.page.wait_for_timeout(500)
