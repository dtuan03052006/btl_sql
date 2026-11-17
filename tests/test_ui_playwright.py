import pytest
from playwright.sync_api import sync_playwright
from tests.pages.dashboard_page import DashboardPage
from tests.pages.floorplan_page import FloorplanPage
from tests.pages.kitchen_page import KitchenPage
from tests.pages.hoadon_page import HoadonPage
from tests.pages.crud_page import CrudPage

@pytest.fixture(scope="module")
def browser_context():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        yield context
        browser.close()

@pytest.fixture
def page(browser_context):
    page = browser_context.new_page()
    yield page
    page.close()

def test_dashboard_ui(page):
    dashboard = DashboardPage(page)
    dashboard.navigate_to_app()
    dashboard.verify_dashboard_loaded()

def test_navigation_flow(page):
    dashboard = DashboardPage(page)
    dashboard.navigate_to_app()
    
    # Lắng nghe console errors
    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    # Chuyển đổi qua các tab
    floorplan = FloorplanPage(page)
    floorplan.open_floorplan()

    kitchen = KitchenPage(page)
    kitchen.open_kitchen()

    hoadon = HoadonPage(page)
    hoadon.open_hoadon()

    crud = CrudPage(page)
    crud.open_crud_entity("chinhanh")
    crud.open_crud_entity("monan")
    crud.open_crud_entity("banan")

    assert len(console_errors) == 0, f"Phát hiện lỗi console: {console_errors}"

def test_crud_search(page):
    crud = CrudPage(page)
    crud.navigate_to_app()
    crud.open_crud_entity("chinhanh")
    
    # Tìm kiếm chi nhánh
    crud.search("Landmark")
    rows = crud.table_body.locator("tr")
    assert rows.count() >= 1

def test_crud_search_edit_bug(page):
    crud = CrudPage(page)
    crud.navigate_to_app()
    crud.open_crud_entity("chinhanh")
    
    # Tìm kiếm một chi nhánh không phải hàng đầu tiên (VD: CN03 hoặc Landmark)
    # Lấy mã chi nhánh của dòng thứ 2 hoặc 3 trong bảng ban đầu
    second_row_id = crud.table_body.locator("tr").nth(2).locator("td").first.inner_text().strip()
    
    # Tìm kiếm theo ID đó
    crud.search(second_row_id)
    
    # Sau khi filter, chỉ còn 1 dòng, bấm nút 'Sửa' của dòng đó
    crud.table_body.locator("tr").first.locator("button:has-text('Sửa')").click()
    
    # Tiêu đề modal phải chứa ID của dòng đang hiển thị (second_row_id)
    modal_title = page.locator("#modal-crud-title").inner_text()
    assert f"#{second_row_id}" in modal_title, f"LỖI: Tìm kiếm '{second_row_id}' nhưng modal lại mở nhầm bản ghi khác! Tiêu đề thực tế: '{modal_title}'"

def test_order_to_checkout_e2e_flow(page):
    dashboard = DashboardPage(page)
    dashboard.navigate_to_app()

    # 1. Chuyển sang Sơ đồ bàn
    floorplan = FloorplanPage(page)
    floorplan.open_floorplan()

    # 2. Tìm một bàn trống bất kỳ trên sơ đồ
    empty_table_btn = page.locator("#floorplan-grid div:has-text('Trong') button:has-text('Mở bàn & Gọi món')").first
    if empty_table_btn.count() > 0:
        empty_table_btn.click()
        page.wait_for_selector("#modal-order", state="visible")
        
        # Chọn món đầu tiên và bấm '+'
        floorplan.select_first_available_dish()
        
        # Submit order
        floorplan.submit_order()
        page.wait_for_timeout(1000)

        # 3. Sang màn hình Bếp để hoàn thành món
        kitchen = KitchenPage(page)
        kitchen.open_kitchen()
        kitchen.advance_cooking_status()

        # 4. Sang màn hình Thu ngân để thanh toán
        hoadon = HoadonPage(page)
        hoadon.open_hoadon()
        hoadon.checkout_first_pending_order()
        page.wait_for_timeout(1000)
