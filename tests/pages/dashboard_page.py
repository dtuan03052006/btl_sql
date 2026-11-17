from playwright.sync_api import Page, expect
from tests.pages.base_page import BasePage

class DashboardPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)
        self.branch_select = page.locator("#global-branch-select")
        self.stat_ban_total = page.locator("#stat-ban-total")
        self.stat_doanh_thu = page.locator("#stat-doanh-thu")
        self.chart_revenue = page.locator("#chart-branch-revenue")
        self.recent_orders_table = page.locator("#dashboard-recent-orders")

    def select_branch(self, branch_code: str):
        self.branch_select.select_option(branch_code)
        self.page.wait_for_timeout(500)

    def verify_dashboard_loaded(self):
        expect(self.stat_ban_total).to_be_visible()
        expect(self.stat_doanh_thu).to_be_visible()
