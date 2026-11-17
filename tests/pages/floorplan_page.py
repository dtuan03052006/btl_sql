from playwright.sync_api import Page, expect
from tests.pages.base_page import BasePage

class FloorplanPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)
        self.grid = page.locator("#floorplan-grid")
        self.modal_order = page.locator("#modal-order")
        self.order_table_select = page.locator("#order-table-select")
        self.order_guests_input = page.locator("#order-guests-input")
        self.order_menu_items = page.locator("#order-menu-items")
        self.btn_submit_order = page.locator("button:has-text('Gửi Order tới Bếp')")

    def open_floorplan(self):
        self.switch_nav("nav-floorplan")
        expect(self.grid).to_be_visible()

    def open_quick_order(self):
        self.page.click("button:has-text('Tạo Order tại bàn')")
        expect(self.modal_order).to_be_visible()

    def select_first_available_dish(self):
        # Bấm nút '+' của món đầu tiên
        add_btn = self.order_menu_items.locator("button:has-text('+')").first
        expect(add_btn).to_be_visible()
        add_btn.click()

    def submit_order(self):
        self.btn_submit_order.click()
