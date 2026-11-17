import pytest
import time
from fastapi.testclient import TestClient
from app import app
from db import get_db_connection

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c

# -------------------------------------------------------------
# 1. DASHBOARD & STATS TESTS
# -------------------------------------------------------------
def test_dashboard_stats_all(client):
    res = client.get("/api/dashboard/stats")
    assert res.status_code == 200
    data = res.json()
    assert data["is_branch"] is False
    assert "ban" in data
    assert "counts" in data
    assert "doanh_thu" in data
    assert "top_branches" in data
    assert "top_dishes" in data
    assert "recent_orders" in data
    assert data["ban"]["tong_ban"] >= 0

def test_dashboard_stats_single_branch(client):
    res = client.get("/api/dashboard/stats?ma_chi_nhanh=CN01")
    assert res.status_code == 200
    data = res.json()
    assert data["is_branch"] is True
    assert "ban" in data
    assert "counts" in data

# -------------------------------------------------------------
# 2. FLOORPLAN & TABLE STATUS TESTS
# -------------------------------------------------------------
def test_get_ban_an(client):
    res = client.get("/api/ban-an")
    assert res.status_code == 200
    tables = res.json()
    assert isinstance(tables, list)
    assert len(tables) > 0
    assert "MaBan" in tables[0]
    assert "TrangThai" in tables[0]

def test_get_ban_an_filtered(client):
    res = client.get("/api/ban-an?ma_chi_nhanh=CN01")
    assert res.status_code == 200
    tables = res.json()
    for t in tables:
        assert t["MaChiNhanh"] == "CN01"

def test_update_table_status(client):
    # Lấy 1 bàn để test
    res = client.get("/api/ban-an")
    ma_ban = res.json()[0]["MaBan"]

    # Đổi sang DaDat
    res_put = client.put(f"/api/ban-an/{ma_ban}/status", json={"trang_thai": "DaDat"})
    assert res_put.status_code == 200
    assert res_put.json()["status"] == "success"

    # Đổi lại Trong
    res_put_back = client.put(f"/api/ban-an/{ma_ban}/status", json={"trang_thai": "Trong"})
    assert res_put_back.status_code == 200

    # Test trạng thái không hợp lệ
    res_invalid = client.put(f"/api/ban-an/{ma_ban}/status", json={"trang_thai": "InvalidStatus"})
    assert res_invalid.status_code == 400

# -------------------------------------------------------------
# 3. MENU / THỰC ĐƠN TESTS
# -------------------------------------------------------------
def test_get_thuc_don(client):
    res = client.get("/api/thuc-don")
    assert res.status_code == 200
    menu = res.json()
    assert isinstance(menu, list)
    for m in menu:
        assert m["TrangThaiPhucVu"] == "DangPhucVu"

# -------------------------------------------------------------
# 4. ORDER & WORKFLOW TESTS (CREATE, KITCHEN, CHECKOUT)
# -------------------------------------------------------------
def test_order_lifecycle_and_triggers(client):
    # 1. Tìm hoặc tạo 1 bàn trống tại CN01
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT MaBan FROM BanAn WHERE MaChiNhanh = 'CN01' AND TrangThai = 'Trong' LIMIT 1")
        row = cur.fetchone()
        if not row:
            # Tạo bàn test
            cur.execute("INSERT INTO BanAn (MaBan, SoBan, MaChiNhanh, SucChua, TrangThai) VALUES ('B999', 99, 'CN01', 4, 'Trong')")
            conn.commit()
            test_table = "B999"
        else:
            test_table = row["MaBan"]

        # Lấy 1 món ăn đang phục vụ
        cur.execute("SELECT MaMonAn, DonGiaMon FROM MonAn WHERE TrangThaiPhucVu = 'DangPhucVu' LIMIT 1")
        mon = cur.fetchone()
        assert mon is not None
        test_mon = mon["MaMonAn"]
    conn.close()

    # 2. Tạo đơn Order
    order_payload = {
        "ma_ban": test_table,
        "so_luong_khach": 3,
        "danh_sach_mon": [
            {"ma_mon_an": test_mon, "so_luong": 2}
        ]
    }
    res_order = client.post("/api/orders", json=order_payload)
    assert res_order.status_code == 201
    data_order = res_order.json()
    ma_order = data_order["ma_order"]
    assert ma_order.startswith("OD")

    # Kiểm tra Trigger / logic: Bàn phải chuyển sang 'DangPhucVu'
    res_tables = client.get("/api/ban-an")
    matching_table = next((t for t in res_tables.json() if t["MaBan"] == test_table), None)
    assert matching_table is not None
    assert matching_table["TrangThai"] == "DangPhucVu"

    # 3. Màn hình Bếp: Phải có món của order này
    res_kitchen = client.get("/api/kitchen")
    assert res_kitchen.status_code == 200
    kitchen_items = res_kitchen.json()
    item_in_kitchen = next((it for it in kitchen_items if it["MaOrder"] == ma_order), None)
    assert item_in_kitchen is not None
    ma_chi_tiet = item_in_kitchen["MaChiTietOrder"]

    # 4. Bếp bắt đầu nấu
    res_cook = client.put(f"/api/kitchen/{ma_chi_tiet}/status", json={"trang_thai": "DangCheBien"})
    assert res_cook.status_code == 200

    # 5. Bếp hoàn thành món
    res_done = client.put(f"/api/kitchen/{ma_chi_tiet}/status", json={"trang_thai": "HoanThanhMon"})
    assert res_done.status_code == 200

    # 6. Xem trước Bill
    res_bill = client.get(f"/api/orders/{ma_order}/bill-preview")
    assert res_bill.status_code == 200
    bill_data = res_bill.json()
    assert bill_data["tong_tien"] > 0
    assert len(bill_data["items"]) >= 1

    # 7. Thanh toán hóa đơn
    res_pay = client.post(f"/api/hoa-don/thanh-toan/{ma_order}", json={"phuong_thuc": "TienMat"})
    assert res_pay.status_code == 200
    pay_data = res_pay.json()
    assert pay_data["status"] == "success"
    assert "ma_hoa_don" in pay_data

    # Kiểm tra bàn đã trở về 'Trong'
    res_tables_after = client.get("/api/ban-an")
    tbl_after = next((t for t in res_tables_after.json() if t["MaBan"] == test_table), None)
    assert tbl_after["TrangThai"] == "Trong"

    # Cleanup nếu là bàn B999
    if test_table == "B999":
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM ChiTietHoaDon WHERE MaHoaDon = %s", (pay_data["ma_hoa_don"],))
            cur.execute("DELETE FROM HoaDon WHERE MaHoaDon = %s", (pay_data["ma_hoa_don"],))
            cur.execute("DELETE FROM ChiTietOrder WHERE MaOrder = %s", (ma_order,))
            cur.execute("DELETE FROM DonOrder WHERE MaOrder = %s", (ma_order,))
            cur.execute("DELETE FROM BanAn WHERE MaBan = 'B999'")
            conn.commit()
        conn.close()

# -------------------------------------------------------------
# 5. CRUD CHI NHÁNH TESTS
# -------------------------------------------------------------
def test_crud_chinhanh(client):
    test_id = f"CN9{int(time.time()) % 1000:03d}"
    
    # 1. Create
    payload = {
        "MaChiNhanh": test_id,
        "TenChiNhanh": "Chi nhánh Test QA Automation",
        "DiaChi": "123 Đường Test, Quận 1, TP.HCM",
        "SoDienThoai": "0912345678"
    }
    res_create = client.post("/api/crud/chinhanh", json=payload)
    assert res_create.status_code == 200

    # Duplicate key test
    res_dup = client.post("/api/crud/chinhanh", json=payload)
    assert res_dup.status_code == 400
    assert "tồn tại" in res_dup.json()["detail"].lower() or "1062" in res_dup.json()["detail"]

    # 2. Read
    res_list = client.get("/api/crud/chinhanh")
    assert res_list.status_code == 200
    found = any(c["MaChiNhanh"] == test_id for c in res_list.json())
    assert found is True

    # 3. Update
    payload_update = {
        "MaChiNhanh": test_id,
        "TenChiNhanh": "Chi nhánh Test QA Đã Cập Nhật",
        "DiaChi": "456 Đường Mới, Quận 3",
        "SoDienThoai": "0987654321"
    }
    res_update = client.put(f"/api/crud/chinhanh/{test_id}", json=payload_update)
    assert res_update.status_code == 200

    # 4. Delete
    res_del = client.delete(f"/api/crud/chinhanh/{test_id}")
    assert res_del.status_code == 200

# -------------------------------------------------------------
# 6. CRUD NHÓM THỰC ĐƠN & MÓN ĂN
# -------------------------------------------------------------
def test_crud_nhom_and_monan(client):
    test_nhom = f"N9{int(time.time()) % 1000:03d}"
    res_nhom = client.post("/api/crud/nhomthucdon", json={"MaNhom": test_nhom, "TenNhom": "Nhóm Test QA"})
    assert res_nhom.status_code == 200

    test_mon = f"M9{int(time.time()) % 1000:03d}"
    res_mon = client.post("/api/crud/monan", json={
        "MaMonAn": test_mon,
        "TenMon": "Món ăn Test QA",
        "MaNhom": test_nhom,
        "DonGiaMon": 99000.0,
        "TrangThaiPhucVu": "DangPhucVu"
    })
    assert res_mon.status_code == 200

    # Kiểm tra constraint khóa ngoại: Không thể xóa nhóm khi có món ăn thuộc nhóm
    res_del_nhom_blocked = client.delete(f"/api/crud/nhomthucdon/{test_nhom}")
    assert res_del_nhom_blocked.status_code == 400
    assert "ràng buộc" in res_del_nhom_blocked.json()["detail"].lower() or "khóa ngoại" in res_del_nhom_blocked.json()["detail"].lower()

    # Xóa món ăn trước, sau đó xóa nhóm
    res_del_mon = client.delete(f"/api/crud/monan/{test_mon}")
    assert res_del_mon.status_code == 200

    res_del_nhom = client.delete(f"/api/crud/nhomthucdon/{test_nhom}")
    assert res_del_nhom.status_code == 200

# -------------------------------------------------------------
# 7. COMPOSITE KEY TESTS: KHO NGUYÊN LIỆU & ĐỊNH LƯỢNG
# -------------------------------------------------------------
def test_crud_khonguyenlieu(client):
    # Lấy 1 chi nhánh và 1 nguyên liệu có sẵn
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT MaChiNhanh FROM ChiNhanh LIMIT 1")
        cn = cur.fetchone()["MaChiNhanh"]
        cur.execute("SELECT MaNguyenLieu FROM NguyenLieu LIMIT 1")
        nl = cur.fetchone()["MaNguyenLieu"]
    conn.close()

    # Upsert kho
    res_upsert = client.post("/api/crud/khonguyenlieu", json={
        "MaChiNhanh": cn,
        "MaNguyenLieu": nl,
        "SoLuongTon": 88.5
    })
    assert res_upsert.status_code == 200

    # Update kho qua composite key PUT
    res_put = client.put(f"/api/crud/khonguyenlieu/{cn}/{nl}", json={
        "MaChiNhanh": cn,
        "MaNguyenLieu": nl,
        "SoLuongTon": 99.0
    })
    assert res_put.status_code == 200

# -------------------------------------------------------------
# 8. CRUD ĐẶT BÀN TRƯỚC (DATBAN)
# -------------------------------------------------------------
def test_crud_datban(client):
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT MaBan FROM BanAn LIMIT 1")
        ma_ban = cur.fetchone()["MaBan"]
    conn.close()

    test_db = f"DB{int(time.time()) % 1000:03d}"
    payload = {
        "MaDatBan": test_db,
        "MaBan": ma_ban,
        "TenKhachHang": "Khách Test QA",
        "SoDienThoai": "0933333333",
        "ThoiGianDat": "2026-12-01 19:30:00",
        "SoLuongKhach": 4,
        "TrangThai": "ChuaNhan"
    }
    res_create = client.post("/api/crud/datban", json=payload)
    assert res_create.status_code == 200

    res_list = client.get("/api/crud/datban")
    assert res_list.status_code == 200
    assert any(d["MaDatBan"] == test_db for d in res_list.json())

    # Xóa lịch đặt bàn
    res_del = client.delete(f"/api/crud/datban/{test_db}")
    assert res_del.status_code == 200
