from playwright.sync_api import Page, expect
from tests.pages.base_page import BasePage

class CrudPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)
        self.title = page.locator("#crud-entity-title")
        self.search_input = page.locator("#crud-search-input")
        self.table_head = page.locator("#crud-table-head")
        self.table_body = page.locator("#crud-table-body")
        self.btn_create = page.locator("button:has-text('Thêm mới')")
        self.modal_crud = page.locator("#modal-crud")
        self.modal_crud_title = page.locator("#modal-crud-title")
        self.crud_form = page.locator("#crud-form")
        self.modal_delete = page.locator("#modal-delete")
        self.btn_confirm_delete = page.locator("#btn-confirm-delete")

    def open_crud_entity(self, entity_key: str):
        self.switch_nav(f"nav-crud-{entity_key}")
        expect(self.table_body).to_be_visible()

    def search(self, text: str):
        self.search_input.fill(text)
        self.page.wait_for_timeout(300)
