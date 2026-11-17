from playwright.sync_api import Page, expect
from tests.pages.base_page import BasePage

class HoadonPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)
        self.tab_pending = page.locator("#tab-btn-pending")
        self.tab_completed = page.locator("#tab-btn-completed")
        self.pending_table = page.locator("#pending-orders-table-body")
        self.completed_table = page.locator("#hoadon-table-body")
        self.modal_checkout = page.locator("#modal-checkout")
        self.btn_confirm_checkout = page.locator("#btn-confirm-checkout")

    def open_hoadon(self):
        self.switch_nav("nav-hoadon")
        expect(self.pending_table).to_be_visible()

    def checkout_first_pending_order(self):
        pay_btn = self.pending_table.locator("button:has-text('Thanh toán ngay')").first
        if pay_btn.count() > 0 and pay_btn.is_visible():
            pay_btn.click()
            expect(self.modal_checkout).to_be_visible()
            self.btn_confirm_checkout.click()
            self.page.wait_for_timeout(500)
            return True
        return False
