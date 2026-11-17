import pytest
from fastapi.testclient import TestClient
from app import app
from db import get_db_connection

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c

def test_order_nonexistent_table(client):
    res = client.post("/api/orders", json={
        "ma_ban": "NONEXISTENT_TABLE",
        "so_luong_khach": 2,
        "danh_sach_mon": [{"ma_mon_an": "M01", "so_luong": 1}]
    })
    assert res.status_code == 404
    assert "không tồn tại" in res.json()["detail"].lower()

def test_order_empty_dish_list(client):
    res = client.post("/api/orders", json={
        "ma_ban": "B01",
        "so_luong_khach": 2,
        "danh_sach_mon": []
    })
    # Danh sách món rỗng nên bị từ chối
    # Kiểm tra xem hệ thống xử lý như thế nào:
    # Nếu server cho phép tạo đơn không món thì đó là bug nghiệp vụ!
    assert res.status_code in [400, 422]

def test_checkout_nonexistent_order(client):
    res = client.post("/api/hoa-don/thanh-toan/OD_FAKE_9999", json={"phuong_thuc": "TienMat"})
    assert res.status_code == 404

def test_bill_preview_nonexistent_order(client):
    res = client.get("/api/orders/OD_FAKE_9999/bill-preview")
    assert res.status_code == 404

def test_kitchen_item_nonexistent(client):
    res = client.put("/api/kitchen/99999999/status", json={"trang_thai": "HoanThanhMon"})
    assert res.status_code == 404

def test_kitchen_invalid_status(client):
    # Lấy 1 item thực tế
    res_k = client.get("/api/kitchen")
    items = res_k.json()
    if len(items) > 0:
        item_id = items[0]["MaChiTietOrder"]
        res = client.put(f"/api/kitchen/{item_id}/status", json={"trang_thai": "INVALID_STATUS_XYZ"})
        # Trạng thái không thuộc ChoXuLy, DangCheBien, HoanThanhMon phải bị chặn
        assert res.status_code == 400

def test_delete_branch_with_tables_blocked(client):
    # Chi nhánh CN01 có nhiều bàn ăn
    res = client.delete("/api/crud/chinhanh/CN01")
    assert res.status_code == 400
    assert "ràng buộc" in res.json()["detail"].lower() or "khóa ngoại" in res.json()["detail"].lower()

def test_delete_nonexistent_branch(client):
    res = client.delete("/api/crud/chinhanh/CN_FAKE_999")
    # Nên trả về 404 hoặc thông báo rõ không tìm thấy
    assert res.status_code in [400, 404]

def test_update_nonexistent_table_status(client):
    res = client.put("/api/ban-an/B_FAKE_999/status", json={"trang_thai": "Trong"})
    assert res.status_code in [400, 404]
