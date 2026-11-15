import os
import csv
import io
from datetime import datetime
from typing import List, Optional, Any, Dict

from fastapi import FastAPI, HTTPException, status, Query, Response
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import get_db_connection

# Khởi tạo FastAPI App
app = FastAPI(
    title="RestaurantOS - Chuỗi Nhà hàng & Gọi món Real-time",
    description="Hệ thống Quản trị Chuỗi Nhà hàng & Gọi món Real-time F&B (BTL Môn SQL)",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper function thực thi query an toàn với kết nối
def execute_query(sql: str, params: tuple = (), fetch_one: bool = False, fetch_all: bool = True, commit: bool = False):
    try:
        conn = get_db_connection()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi kết nối CSDL MySQL (127.0.0.1:3306). Hãy kiểm tra dịch vụ MySQL đã bật chưa (sudo service mysql start). Chi tiết: {str(e)}"
        )
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql, params)
            if commit:
                conn.commit()
                return cursor.lastrowid or cursor.rowcount
            if fetch_one:
                return cursor.fetchone()
            if fetch_all:
                return cursor.fetchall()
            return None
    except Exception as e:
        if commit:
            conn.rollback()
        raise HTTPException(status_code=400, detail=f"Lỗi truy vấn SQL: {str(e)}")
    finally:
        conn.close()

# =====================================================================
# PYDANTIC SCHEMAS
# =====================================================================

class ChiNhanhSchema(BaseModel):
    MaChiNhanh: str = Field(..., max_length=10, example="CN11")
    TenChiNhanh: str = Field(..., max_length=100, example="Nhà hàng Biển Đông - Landmark 81")
    DiaChi: str = Field(..., max_length=255, example="720A Điện Biên Phủ, P. 22, Bình Thạnh, TP.HCM")
    SoDienThoai: Optional[str] = Field(None, max_length=15, example="0901234599")

class BanAnSchema(BaseModel):
    MaBan: str = Field(..., max_length=10, example="B51")
    SoBan: int = Field(..., gt=0, example=6)
    MaChiNhanh: str = Field(..., max_length=10, example="CN01")
    SucChua: int = Field(4, gt=0, example=4)
    TrangThai: str = Field("Trong", example="Trong")

class NhomThucDonSchema(BaseModel):
    MaNhom: str = Field(..., max_length=10, example="N05")
    TenNhom: str = Field(..., max_length=50, example="Tráng miệng")

class MonAnSchema(BaseModel):
    MaMonAn: str = Field(..., max_length=10, example="M10")
    TenMon: str = Field(..., max_length=100, example="Panna Cotta dâu tây")
    MaNhom: str = Field(..., max_length=10, example="N01")
    DonGiaMon: float = Field(..., gt=0, example=65000.0)
    TrangThaiPhucVu: str = Field("DangPhucVu", example="DangPhucVu")

class NguyenLieuSchema(BaseModel):
    MaNguyenLieu: str = Field(..., max_length=10, example="NL06")
    TenNguyenLieu: str = Field(..., max_length=100, example="Dâu tây Đà Lạt")
    DonViTinh: str = Field(..., max_length=20, example="kg")

class KhoNguyenLieuSchema(BaseModel):
    MaChiNhanh: str = Field(..., max_length=10, example="CN01")
    MaNguyenLieu: str = Field(..., max_length=10, example="NL01")
    SoLuongTon: float = Field(..., ge=0, example=20.5)

class DinhLuongMonSchema(BaseModel):
    MaMonAn: str = Field(..., max_length=10, example="M01")
    MaNguyenLieu: str = Field(..., max_length=10, example="NL01")
    SoLuongDinhLuong: float = Field(..., gt=0, example=0.5)

class DatBanSchema(BaseModel):
    MaDatBan: str = Field(..., max_length=10, example="DB99")
    MaBan: str = Field(..., max_length=10, example="B01")
    TenKhachHang: str = Field(..., max_length=100, example="Nguyễn Văn A")
    SoDienThoai: str = Field(..., max_length=15, example="0987654321")
    ThoiGianDat: str = Field(..., example="2026-11-20 18:30:00")
    SoLuongKhach: int = Field(..., gt=0, example=4)
    TrangThai: str = Field("ChuaNhan", example="ChuaNhan")

class OrderItem(BaseModel):
    ma_mon_an: str = Field(..., example="M01")
    so_luong: int = Field(..., gt=0, example=2)

class CreateOrderRequest(BaseModel):
    ma_ban: str = Field(..., example="B05")
    so_luong_khach: int = Field(..., gt=0, example=4)
    danh_sach_mon: List[OrderItem]

class KitchenUpdateStatus(BaseModel):
    trang_thai: str = Field(..., example="HoanThanhMon")

class ThanhToanRequest(BaseModel):
    phuong_thuc: str = Field("TienMat", example="TienMat")

# =====================================================================
# 1. DASHBOARD & STATS APIS
# =====================================================================

@app.get("/api/dashboard/stats", tags=["Dashboard"])
def get_dashboard_stats(ma_chi_nhanh: Optional[str] = None):
    """Thống kê tổng hợp toàn bộ hệ thống hoặc lọc theo từng chi nhánh cho Dashboard"""
    is_branch = bool(ma_chi_nhanh and ma_chi_nhanh != "ALL")

    # 1. Thống kê bàn
    if is_branch:
        ban_stats = execute_query("""
            SELECT 
                COUNT(*) AS tong_ban,
                SUM(CASE WHEN TrangThai = 'DangPhucVu' THEN 1 ELSE 0 END) AS ban_dang_phuc_vu,
                SUM(CASE WHEN TrangThai = 'Trong' THEN 1 ELSE 0 END) AS ban_trong,
                SUM(CASE WHEN TrangThai = 'DaDat' THEN 1 ELSE 0 END) AS ban_da_dat
            FROM BanAn
            WHERE MaChiNhanh = %s
        """, (ma_chi_nhanh,), fetch_one=True)
    else:
        ban_stats = execute_query("""
            SELECT 
                COUNT(*) AS tong_ban,
                SUM(CASE WHEN TrangThai = 'DangPhucVu' THEN 1 ELSE 0 END) AS ban_dang_phuc_vu,
                SUM(CASE WHEN TrangThai = 'Trong' THEN 1 ELSE 0 END) AS ban_trong,
                SUM(CASE WHEN TrangThai = 'DaDat' THEN 1 ELSE 0 END) AS ban_da_dat
            FROM BanAn
        """, fetch_one=True)

    # 2. Thống kê chi nhánh & món ăn & nguyên liệu
    if is_branch:
        counts = execute_query("""
            SELECT 
                1 AS tong_chi_nhanh,
                (SELECT COUNT(*) FROM MonAn) AS tong_mon_an,
                (SELECT COUNT(*) FROM MonAn WHERE TrangThaiPhucVu = 'TamNgung') AS mon_tam_ngung,
                (SELECT COUNT(*) FROM KhoNguyenLieu WHERE MaChiNhanh = %s) AS tong_nguyen_lieu,
                (SELECT COUNT(*) FROM KhoNguyenLieu WHERE MaChiNhanh = %s AND SoLuongTon <= 5) AS nguyen_lieu_canh_bao,
                (SELECT COUNT(*) 
                 FROM ChiTietOrder cto 
                 JOIN DonOrder o ON cto.MaOrder = o.MaOrder 
                 JOIN BanAn b ON o.MaBan = b.MaBan 
                 WHERE b.MaChiNhanh = %s AND cto.TrangThaiBep <> 'HoanThanhMon') AS don_cho_bep
        """, (ma_chi_nhanh, ma_chi_nhanh, ma_chi_nhanh), fetch_one=True)
    else:
        counts = execute_query("""
            SELECT 
                (SELECT COUNT(*) FROM ChiNhanh) AS tong_chi_nhanh,
                (SELECT COUNT(*) FROM MonAn) AS tong_mon_an,
                (SELECT COUNT(*) FROM MonAn WHERE TrangThaiPhucVu = 'TamNgung') AS mon_tam_ngung,
                (SELECT COUNT(*) FROM NguyenLieu) AS tong_nguyen_lieu,
                (SELECT COUNT(*) FROM KhoNguyenLieu WHERE SoLuongTon <= 5) AS nguyen_lieu_canh_bao,
                (SELECT COUNT(*) FROM ChiTietOrder WHERE TrangThaiBep <> 'HoanThanhMon') AS don_cho_bep
        """, fetch_one=True)

    # 3. Thống kê doanh thu tháng 10 & tổng hóa đơn
    if is_branch:
        rev = execute_query("""
            SELECT 
                COALESCE(SUM(TongTien), 0) AS doanh_thu_thang_10,
                COUNT(*) AS tong_hoa_don
            FROM HoaDon
            WHERE MONTH(ThoiGianLap) = 10 AND YEAR(ThoiGianLap) = 2026 AND MaChiNhanh = %s
        """, (ma_chi_nhanh,), fetch_one=True)
    else:
        rev = execute_query("""
            SELECT 
                COALESCE(SUM(TongTien), 0) AS doanh_thu_thang_10,
                COUNT(*) AS tong_hoa_don
            FROM HoaDon
            WHERE MONTH(ThoiGianLap) = 10 AND YEAR(ThoiGianLap) = 2026
        """, fetch_one=True)

    # 4. Biểu đồ doanh thu
    if is_branch:
        # Khi chọn chi nhánh: Thống kê doanh thu theo từng Nhóm thực đơn của chi nhánh đó
        revenue_chart = execute_query("""
            SELECT n.TenNhom AS Label, COALESCE(SUM(cthd.ThanhTien), 0) AS DoanhThu
            FROM NhomThucDon n
            JOIN MonAn m ON n.MaNhom = m.MaNhom
            JOIN ChiTietHoaDon cthd ON m.MaMonAn = cthd.MaMonAn
            JOIN HoaDon hd ON cthd.MaHoaDon = hd.MaHoaDon
            WHERE hd.MaChiNhanh = %s
            GROUP BY n.MaNhom, n.TenNhom
            ORDER BY DoanhThu DESC
        """, (ma_chi_nhanh,))
    else:
        revenue_chart = execute_query("""
            SELECT cn.TenChiNhanh AS Label, COALESCE(SUM(hd.TongTien), 0) AS DoanhThu
            FROM ChiNhanh cn
            LEFT JOIN HoaDon hd ON cn.MaChiNhanh = hd.MaChiNhanh
            GROUP BY cn.MaChiNhanh, cn.TenChiNhanh
            ORDER BY DoanhThu DESC
            LIMIT 5
        """)

    # 5. Top món ăn bán chạy
    if is_branch:
        top_dishes = execute_query("""
            SELECT m.TenMon, COALESCE(SUM(cthd.SoLuong), 0) AS SoLuongBan
            FROM MonAn m
            JOIN ChiTietHoaDon cthd ON m.MaMonAn = cthd.MaMonAn
            JOIN HoaDon hd ON cthd.MaHoaDon = hd.MaHoaDon
            WHERE hd.MaChiNhanh = %s
            GROUP BY m.MaMonAn, m.TenMon
            ORDER BY SoLuongBan DESC
            LIMIT 5
        """, (ma_chi_nhanh,))
    else:
        top_dishes = execute_query("""
            SELECT m.TenMon, COALESCE(SUM(cthd.SoLuong), 0) AS SoLuongBan
            FROM MonAn m
            LEFT JOIN ChiTietHoaDon cthd ON m.MaMonAn = cthd.MaMonAn
            GROUP BY m.MaMonAn, m.TenMon
            ORDER BY SoLuongBan DESC
            LIMIT 5
        """)

    # 6. Các đơn order gần đây
    if is_branch:
        recent_orders = execute_query("""
            SELECT o.MaOrder, b.SoBan, cn.TenChiNhanh, o.ThoiGianOrder, o.SoLuongKhach, o.TrangThaiOrder
            FROM DonOrder o
            JOIN BanAn b ON o.MaBan = b.MaBan
            JOIN ChiNhanh cn ON b.MaChiNhanh = cn.MaChiNhanh
            WHERE b.MaChiNhanh = %s
            ORDER BY o.ThoiGianOrder DESC
            LIMIT 6
        """, (ma_chi_nhanh,))
    else:
        recent_orders = execute_query("""
            SELECT o.MaOrder, b.SoBan, cn.TenChiNhanh, o.ThoiGianOrder, o.SoLuongKhach, o.TrangThaiOrder
            FROM DonOrder o
            JOIN BanAn b ON o.MaBan = b.MaBan
            JOIN ChiNhanh cn ON b.MaChiNhanh = cn.MaChiNhanh
            ORDER BY o.ThoiGianOrder DESC
            LIMIT 6
        """)

    return {
        "is_branch": is_branch,
        "ban": ban_stats,
        "counts": counts,
        "doanh_thu": rev,
        "top_branches": revenue_chart,
        "top_dishes": top_dishes,
        "recent_orders": recent_orders
    }

# =====================================================================
# 2. OPERATIONAL APIS (SƠ ĐỒ BÀN, MENU, GỌI MÓN, BẾP, THANH TOÁN)
# =====================================================================

@app.get("/api/ban-an", tags=["Operations"])
def get_ban_an(ma_chi_nhanh: Optional[str] = None):
    """Lấy danh sách bàn, hỗ trợ lọc theo chi nhánh"""
    sql = """
        SELECT b.MaBan, b.SoBan, b.SucChua, b.TrangThai, b.MaChiNhanh, cn.TenChiNhanh,
               (SELECT o.MaOrder FROM DonOrder o WHERE o.MaBan = b.MaBan AND o.TrangThaiOrder = 'DangXuLy' ORDER BY o.ThoiGianOrder DESC LIMIT 1) AS MaOrderHienTai
        FROM BanAn b
        JOIN ChiNhanh cn ON b.MaChiNhanh = cn.MaChiNhanh
    """
    params = ()
    if ma_chi_nhanh and ma_chi_nhanh != "ALL":
        sql += " WHERE b.MaChiNhanh = %s"
        params = (ma_chi_nhanh,)
    sql += " ORDER BY b.MaChiNhanh, b.SoBan ASC"
    return execute_query(sql, params)

@app.put("/api/ban-an/{ma_ban}/status", tags=["Operations"])
def update_table_status(ma_ban: str, payload: dict):
    trang_thai = payload.get("trang_thai")
    if trang_thai not in ["Trong", "DangPhucVu", "DaDat"]:
        raise HTTPException(status_code=400, detail="Trạng thái bàn không hợp lệ!")
    execute_query("UPDATE BanAn SET TrangThai = %s WHERE MaBan = %s", (trang_thai, ma_ban), commit=True)
    return {"status": "success", "message": f"Bàn {ma_ban} đã cập nhật sang '{trang_thai}'"}

@app.get("/api/thuc-don", tags=["Operations"])
def get_thuc_don():
    """Lấy danh sách món ăn đang phục vụ phân loại theo nhóm"""
    return execute_query("""
        SELECT m.MaMonAn, m.TenMon, n.MaNhom, n.TenNhom, m.DonGiaMon, m.TrangThaiPhucVu
        FROM MonAn m
        JOIN NhomThucDon n ON m.MaNhom = n.MaNhom
        WHERE m.TrangThaiPhucVu = 'DangPhucVu'
        ORDER BY n.TenNhom, m.TenMon
    """)

@app.post("/api/orders", tags=["Operations"], status_code=status.HTTP_201_CREATED)
def create_order(order_data: CreateOrderRequest):
    """
    Gọi món tại bàn:
    * Chèn vào DonOrder -> Kích hoạt TRIGGER trg_CapNhatTrangThaiBan_AfterOrder
    * Chèn các món vào ChiTietOrder
    """
    # 1. Kiểm tra bàn
    ban = execute_query("SELECT * FROM BanAn WHERE MaBan = %s", (order_data.ma_ban,), fetch_one=True)
    if not ban:
        raise HTTPException(status_code=404, detail="Bàn ăn không tồn tại!")

    ma_order = "OD" + datetime.now().strftime("%d%H%M%S")
    
    # 2. Chèn DonOrder (Trigger sẽ tự động đổi trạng thái bàn sang 'DangPhucVu')
    execute_query("""
        INSERT INTO DonOrder (MaOrder, MaBan, ThoiGianOrder, SoLuongKhach, TrangThaiOrder)
        VALUES (%s, %s, NOW(), %s, 'DangXuLy')
    """, (ma_order, order_data.ma_ban, order_data.so_luong_khach), commit=True)

    # 3. Chèn ChiTietOrder
    for item in order_data.danh_sach_mon:
        execute_query("""
            INSERT INTO ChiTietOrder (MaOrder, MaMonAn, SoLuong, TrangThaiBep, ThoiGianGoiMon)
            VALUES (%s, %s, %s, 'ChoXuLy', NOW())
        """, (ma_order, item.ma_mon_an, item.so_luong), commit=True)

    # Lấy trạng thái bàn sau Trigger
    ban_sau = execute_query("SELECT TrangThai FROM BanAn WHERE MaBan = %s", (order_data.ma_ban,), fetch_one=True)

    return {
        "status": "success",
        "message": "Gọi món thành công! Đã gửi order tới Bếp/Bar.",
        "ma_order": ma_order,
        "ma_ban": order_data.ma_ban,
        "trang_thai_ban": ban_sau["TrangThai"] if ban_sau else "DangPhucVu"
    }

@app.get("/api/kitchen", tags=["Operations"])
def get_kitchen_items(ma_chi_nhanh: Optional[str] = None):
    """Lấy danh sách các món cần chế biến (Bếp & Bar)"""
    sql = """
        SELECT cto.MaChiTietOrder, cto.MaOrder, b.SoBan, b.MaBan, cn.TenChiNhanh, m.TenMon, 
               cto.SoLuong, cto.TrangThaiBep, cto.ThoiGianGoiMon
        FROM ChiTietOrder cto
        JOIN DonOrder o ON cto.MaOrder = o.MaOrder
        JOIN BanAn b ON o.MaBan = b.MaBan
        JOIN ChiNhanh cn ON b.MaChiNhanh = cn.MaChiNhanh
        JOIN MonAn m ON cto.MaMonAn = m.MaMonAn
        WHERE cto.TrangThaiBep <> 'HoanThanhMon'
    """
    params = ()
    if ma_chi_nhanh and ma_chi_nhanh != "ALL":
        sql += " AND b.MaChiNhanh = %s"
        params = (ma_chi_nhanh,)
    sql += " ORDER BY cto.ThoiGianGoiMon ASC"
    return execute_query(sql, params)

@app.put("/api/kitchen/{ma_chi_tiet_order}/status", tags=["Operations"])
def update_kitchen_status(ma_chi_tiet_order: int, payload: KitchenUpdateStatus):
    """
    Cập nhật trạng thái món tại Bếp:
    * Khi chuyển sang 'HoanThanhMon' -> Kích hoạt TRIGGER trg_TruTonKho_KhiHoanThanhMon tự động trừ kho!
    """
    order_item = execute_query("SELECT * FROM ChiTietOrder WHERE MaChiTietOrder = %s", (ma_chi_tiet_order,), fetch_one=True)
    if not order_item:
        raise HTTPException(status_code=404, detail="Không tìm thấy món trong order này!")

    execute_query("UPDATE ChiTietOrder SET TrangThaiBep = %s WHERE MaChiTietOrder = %s", (payload.trang_thai, ma_chi_tiet_order), commit=True)

    return {
        "status": "success",
        "message": f"Món #{ma_chi_tiet_order} đã chuyển sang '{payload.trang_thai}'. "
                   f"{'Nguyên liệu kho đã được Trigger trừ tự động!' if payload.trang_thai == 'HoanThanhMon' else ''}"
    }

@app.get("/api/orders/{ma_order}/bill-preview", tags=["Operations"])
def get_order_bill_preview(ma_order: str):
    """Xem trước bill của đơn order"""
    order = execute_query("""
        SELECT o.*, b.SoBan, cn.TenChiNhanh
        FROM DonOrder o
        JOIN BanAn b ON o.MaBan = b.MaBan
        JOIN ChiNhanh cn ON b.MaChiNhanh = cn.MaChiNhanh
        WHERE o.MaOrder = %s
    """, (ma_order,), fetch_one=True)
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn order!")

    items = execute_query("""
        SELECT cto.MaMonAn, m.TenMon, SUM(cto.SoLuong) AS SoLuong, m.DonGiaMon,
               SUM(cto.SoLuong * m.DonGiaMon) AS ThanhTien
        FROM ChiTietOrder cto
        JOIN MonAn m ON cto.MaMonAn = m.MaMonAn
        WHERE cto.MaOrder = %s
        GROUP BY cto.MaMonAn, m.TenMon, m.DonGiaMon
    """, (ma_order,))

    tong_tien = sum(item["ThanhTien"] for item in items) if items else 0.0

    return {
        "order": order,
        "items": items,
        "tong_tien": float(tong_tien)
    }

@app.post("/api/hoa-don/thanh-toan/{ma_order}", tags=["Operations"])
def checkout_order(ma_order: str, payload: ThanhToanRequest):
    """
    Thanh toán hóa đơn:
    * Gom nhóm món (thỏa mãn UNIQUE MaHoaDon, MaMonAn)
    * Chèn HoaDon & ChiTietHoaDon
    * Cập nhật DonOrder -> 'DaThanhToan' và giải phóng Bàn về 'Trong'
    """
    order = execute_query("""
        SELECT o.*, b.MaChiNhanh, b.MaBan
        FROM DonOrder o
        JOIN BanAn b ON o.MaBan = b.MaBan
        WHERE o.MaOrder = %s
    """, (ma_order,), fetch_one=True)
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn order!")
    if order["TrangThaiOrder"] == "DaThanhToan":
        raise HTTPException(status_code=400, detail="Đơn order này đã được thanh toán trước đó!")

    # Gom nhóm món đã dùng
    dishes = execute_query("""
        SELECT cto.MaMonAn, SUM(cto.SoLuong) AS TongSoLuong, m.DonGiaMon,
               SUM(cto.SoLuong * m.DonGiaMon) AS ThanhTien
        FROM ChiTietOrder cto
        JOIN MonAn m ON cto.MaMonAn = m.MaMonAn
        WHERE cto.MaOrder = %s
        GROUP BY cto.MaMonAn, m.DonGiaMon
    """, (ma_order,))

    if not dishes:
        raise HTTPException(status_code=400, detail="Đơn order chưa có món ăn nào!")

    tong_tien = sum(d["ThanhTien"] for d in dishes)
    ma_hoa_don = "HD" + datetime.now().strftime("%d%H%M%S")

    # 1. Chèn HoaDon
    execute_query("""
        INSERT INTO HoaDon (MaHoaDon, MaOrder, MaChiNhanh, ThoiGianLap, TongTien, PhuongThucThanhToan)
        VALUES (%s, %s, %s, NOW(), %s, %s)
    """, (ma_hoa_don, ma_order, order["MaChiNhanh"], tong_tien, payload.phuong_thuc), commit=True)

    # 2. Chèn ChiTietHoaDon (bảo đảm UNIQUE)
    for d in dishes:
        execute_query("""
            INSERT INTO ChiTietHoaDon (MaHoaDon, MaMonAn, SoLuong, DonGiaBan, ThanhTien)
            VALUES (%s, %s, %s, %s, %s)
        """, (ma_hoa_don, d["MaMonAn"], d["TongSoLuong"], d["DonGiaMon"], d["ThanhTien"]), commit=True)

    # 3. Đổi trạng thái order và bàn
    execute_query("UPDATE DonOrder SET TrangThaiOrder = 'DaThanhToan' WHERE MaOrder = %s", (ma_order,), commit=True)
    execute_query("UPDATE BanAn SET TrangThai = 'Trong' WHERE MaBan = %s", (order["MaBan"],), commit=True)

    return {
        "status": "success",
        "message": "Thanh toán thành công! Bàn đã chuyển về trạng thái 'Trong'.",
        "ma_hoa_don": ma_hoa_don,
        "tong_tien": float(tong_tien),
        "phuong_thuc": payload.phuong_thuc
    }

# =====================================================================
# 3. GENERIC CRUD APIS CHO 12 THỰC THỂ
# =====================================================================

# 1. ChiNhanh
@app.get("/api/crud/chinhanh", tags=["CRUD ChiNhanh"])
def list_chinhanh():
    return execute_query("SELECT * FROM ChiNhanh ORDER BY MaChiNhanh")

@app.post("/api/crud/chinhanh", tags=["CRUD ChiNhanh"])
def create_chinhanh(item: ChiNhanhSchema):
    execute_query("INSERT INTO ChiNhanh (MaChiNhanh, TenChiNhanh, DiaChi, SoDienThoai) VALUES (%s, %s, %s, %s)",
                  (item.MaChiNhanh, item.TenChiNhanh, item.DiaChi, item.SoDienThoai), commit=True)
    return {"status": "success", "message": "Đã thêm chi nhánh mới"}

@app.put("/api/crud/chinhanh/{id}", tags=["CRUD ChiNhanh"])
def update_chinhanh(id: str, item: ChiNhanhSchema):
    execute_query("UPDATE ChiNhanh SET TenChiNhanh = %s, DiaChi = %s, SoDienThoai = %s WHERE MaChiNhanh = %s",
                  (item.TenChiNhanh, item.DiaChi, item.SoDienThoai, id), commit=True)
    return {"status": "success", "message": "Đã cập nhật chi nhánh"}

@app.delete("/api/crud/chinhanh/{id}", tags=["CRUD ChiNhanh"])
def delete_chinhanh(id: str):
    execute_query("DELETE FROM ChiNhanh WHERE MaChiNhanh = %s", (id,), commit=True)
    return {"status": "success", "message": "Đã xóa chi nhánh"}

# 2. BanAn
@app.get("/api/crud/banan", tags=["CRUD BanAn"])
def list_banan():
    return execute_query("""
        SELECT b.*, cn.TenChiNhanh 
        FROM BanAn b 
        JOIN ChiNhanh cn ON b.MaChiNhanh = cn.MaChiNhanh 
        ORDER BY b.MaChiNhanh, b.SoBan
    """)

@app.post("/api/crud/banan", tags=["CRUD BanAn"])
def create_banan(item: BanAnSchema):
    execute_query("INSERT INTO BanAn (MaBan, SoBan, MaChiNhanh, SucChua, TrangThai) VALUES (%s, %s, %s, %s, %s)",
                  (item.MaBan, item.SoBan, item.MaChiNhanh, item.SucChua, item.TrangThai), commit=True)
    return {"status": "success", "message": "Đã thêm bàn ăn"}

@app.put("/api/crud/banan/{id}", tags=["CRUD BanAn"])
def update_banan(id: str, item: BanAnSchema):
    execute_query("UPDATE BanAn SET SoBan = %s, MaChiNhanh = %s, SucChua = %s, TrangThai = %s WHERE MaBan = %s",
                  (item.SoBan, item.MaChiNhanh, item.SucChua, item.TrangThai, id), commit=True)
    return {"status": "success", "message": "Đã cập nhật bàn ăn"}

@app.delete("/api/crud/banan/{id}", tags=["CRUD BanAn"])
def delete_banan(id: str):
    execute_query("DELETE FROM BanAn WHERE MaBan = %s", (id,), commit=True)
    return {"status": "success", "message": "Đã xóa bàn ăn"}

# 3. NhomThucDon
@app.get("/api/crud/nhomthucdon", tags=["CRUD NhomThucDon"])
def list_nhomthucdon():
    return execute_query("SELECT * FROM NhomThucDon ORDER BY MaNhom")

@app.post("/api/crud/nhomthucdon", tags=["CRUD NhomThucDon"])
def create_nhomthucdon(item: NhomThucDonSchema):
    execute_query("INSERT INTO NhomThucDon (MaNhom, TenNhom) VALUES (%s, %s)", (item.MaNhom, item.TenNhom), commit=True)
    return {"status": "success", "message": "Đã thêm nhóm thực đơn"}

@app.put("/api/crud/nhomthucdon/{id}", tags=["CRUD NhomThucDon"])
def update_nhomthucdon(id: str, item: NhomThucDonSchema):
    execute_query("UPDATE NhomThucDon SET TenNhom = %s WHERE MaNhom = %s", (item.TenNhom, id), commit=True)
    return {"status": "success", "message": "Đã cập nhật nhóm thực đơn"}

@app.delete("/api/crud/nhomthucdon/{id}", tags=["CRUD NhomThucDon"])
def delete_nhomthucdon(id: str):
    execute_query("DELETE FROM NhomThucDon WHERE MaNhom = %s", (id,), commit=True)
    return {"status": "success", "message": "Đã xóa nhóm thực đơn"}

# 4. MonAn
@app.get("/api/crud/monan", tags=["CRUD MonAn"])
def list_monan():
    return execute_query("""
        SELECT m.*, n.TenNhom 
        FROM MonAn m 
        JOIN NhomThucDon n ON m.MaNhom = n.MaNhom 
        ORDER BY m.MaNhom, m.TenMon
    """)

@app.post("/api/crud/monan", tags=["CRUD MonAn"])
def create_monan(item: MonAnSchema):
    execute_query("INSERT INTO MonAn (MaMonAn, TenMon, MaNhom, DonGiaMon, TrangThaiPhucVu) VALUES (%s, %s, %s, %s, %s)",
                  (item.MaMonAn, item.TenMon, item.MaNhom, item.DonGiaMon, item.TrangThaiPhucVu), commit=True)
    return {"status": "success", "message": "Đã thêm món ăn"}

@app.put("/api/crud/monan/{id}", tags=["CRUD MonAn"])
def update_monan(id: str, item: MonAnSchema):
    execute_query("UPDATE MonAn SET TenMon = %s, MaNhom = %s, DonGiaMon = %s, TrangThaiPhucVu = %s WHERE MaMonAn = %s",
                  (item.TenMon, item.MaNhom, item.DonGiaMon, item.TrangThaiPhucVu, id), commit=True)
    return {"status": "success", "message": "Đã cập nhật món ăn"}

@app.delete("/api/crud/monan/{id}", tags=["CRUD MonAn"])
def delete_monan(id: str):
    execute_query("DELETE FROM MonAn WHERE MaMonAn = %s", (id,), commit=True)
    return {"status": "success", "message": "Đã xóa món ăn"}

# 5. NguyenLieu
@app.get("/api/crud/nguyenlieu", tags=["CRUD NguyenLieu"])
def list_nguyenlieu():
    return execute_query("SELECT * FROM NguyenLieu ORDER BY MaNguyenLieu")

@app.post("/api/crud/nguyenlieu", tags=["CRUD NguyenLieu"])
def create_nguyenlieu(item: NguyenLieuSchema):
    execute_query("INSERT INTO NguyenLieu (MaNguyenLieu, TenNguyenLieu, DonViTinh) VALUES (%s, %s, %s)",
                  (item.MaNguyenLieu, item.TenNguyenLieu, item.DonViTinh), commit=True)
    return {"status": "success", "message": "Đã thêm nguyên liệu"}

@app.put("/api/crud/nguyenlieu/{id}", tags=["CRUD NguyenLieu"])
def update_nguyenlieu(id: str, item: NguyenLieuSchema):
    execute_query("UPDATE NguyenLieu SET TenNguyenLieu = %s, DonViTinh = %s WHERE MaNguyenLieu = %s",
                  (item.TenNguyenLieu, item.DonViTinh, id), commit=True)
    return {"status": "success", "message": "Đã cập nhật nguyên liệu"}

@app.delete("/api/crud/nguyenlieu/{id}", tags=["CRUD NguyenLieu"])
def delete_nguyenlieu(id: str):
    execute_query("DELETE FROM NguyenLieu WHERE MaNguyenLieu = %s", (id,), commit=True)
    return {"status": "success", "message": "Đã xóa nguyên liệu"}

# 6. KhoNguyenLieu
@app.get("/api/crud/khonguyenlieu", tags=["CRUD Kho"])
def list_kho(ma_chi_nhanh: Optional[str] = None):
    sql = """
        SELECT knl.*, cn.TenChiNhanh, nl.TenNguyenLieu, nl.DonViTinh
        FROM KhoNguyenLieu knl
        JOIN ChiNhanh cn ON knl.MaChiNhanh = cn.MaChiNhanh
        JOIN NguyenLieu nl ON knl.MaNguyenLieu = nl.MaNguyenLieu
    """
    params = ()
    if ma_chi_nhanh and ma_chi_nhanh != "ALL":
        sql += " WHERE knl.MaChiNhanh = %s"
        params = (ma_chi_nhanh,)
    sql += " ORDER BY knl.MaChiNhanh, nl.TenNguyenLieu"
    return execute_query(sql, params)

@app.post("/api/crud/khonguyenlieu", tags=["CRUD Kho"])
def upsert_kho(item: KhoNguyenLieuSchema):
    execute_query("""
        INSERT INTO KhoNguyenLieu (MaChiNhanh, MaNguyenLieu, SoLuongTon)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE SoLuongTon = VALUES(SoLuongTon)
    """, (item.MaChiNhanh, item.MaNguyenLieu, item.SoLuongTon), commit=True)
    return {"status": "success", "message": "Đã cập nhật số lượng tồn kho"}

@app.delete("/api/crud/khonguyenlieu/{ma_cn}/{ma_nl}", tags=["CRUD Kho"])
def delete_kho(ma_cn: str, ma_nl: str):
    execute_query("DELETE FROM KhoNguyenLieu WHERE MaChiNhanh = %s AND MaNguyenLieu = %s", (ma_cn, ma_nl), commit=True)
    return {"status": "success", "message": "Đã xóa mặt hàng khỏi kho chi nhánh"}

# 7. DinhLuongMon (BOM)
@app.get("/api/crud/dinhluongmon", tags=["CRUD DinhLuong"])
def list_dinhluong(ma_mon_an: Optional[str] = None):
    sql = """
        SELECT dlm.*, m.TenMon, nl.TenNguyenLieu, nl.DonViTinh
        FROM DinhLuongMon dlm
        JOIN MonAn m ON dlm.MaMonAn = m.MaMonAn
        JOIN NguyenLieu nl ON dlm.MaNguyenLieu = nl.MaNguyenLieu
    """
    params = ()
    if ma_mon_an:
        sql += " WHERE dlm.MaMonAn = %s"
        params = (ma_mon_an,)
    sql += " ORDER BY m.TenMon, nl.TenNguyenLieu"
    return execute_query(sql, params)

@app.post("/api/crud/dinhluongmon", tags=["CRUD DinhLuong"])
def upsert_dinhluong(item: DinhLuongMonSchema):
    execute_query("""
        INSERT INTO DinhLuongMon (MaMonAn, MaNguyenLieu, SoLuongDinhLuong)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE SoLuongDinhLuong = VALUES(SoLuongDinhLuong)
    """, (item.MaMonAn, item.MaNguyenLieu, item.SoLuongDinhLuong), commit=True)
    return {"status": "success", "message": "Đã lưu công thức định lượng"}

@app.delete("/api/crud/dinhluongmon/{ma_mon}/{ma_nl}", tags=["CRUD DinhLuong"])
def delete_dinhluong(ma_mon: str, ma_nl: str):
    execute_query("DELETE FROM DinhLuongMon WHERE MaMonAn = %s AND MaNguyenLieu = %s", (ma_mon, ma_nl), commit=True)
    return {"status": "success", "message": "Đã xóa định lượng nguyên liệu"}

# 8. DatBan
@app.get("/api/crud/datban", tags=["CRUD DatBan"])
def list_datban():
    return execute_query("""
        SELECT db.*, b.SoBan, cn.TenChiNhanh
        FROM DatBan db
        JOIN BanAn b ON db.MaBan = b.MaBan
        JOIN ChiNhanh cn ON b.MaChiNhanh = cn.MaChiNhanh
        ORDER BY db.ThoiGianDat DESC
    """)

@app.post("/api/crud/datban", tags=["CRUD DatBan"])
def create_datban(item: DatBanSchema):
    execute_query("""
        INSERT INTO DatBan (MaDatBan, MaBan, TenKhachHang, SoDienThoai, ThoiGianDat, SoLuongKhach, TrangThai)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (item.MaDatBan, item.MaBan, item.TenKhachHang, item.SoDienThoai, item.ThoiGianDat, item.SoLuongKhach, item.TrangThai), commit=True)
    return {"status": "success", "message": "Đã tạo phiếu đặt bàn"}

@app.put("/api/crud/datban/{id}", tags=["CRUD DatBan"])
def update_datban(id: str, item: DatBanSchema):
    execute_query("""
        UPDATE DatBan 
        SET MaBan = %s, TenKhachHang = %s, SoDienThoai = %s, ThoiGianDat = %s, SoLuongKhach = %s, TrangThai = %s
        WHERE MaDatBan = %s
    """, (item.MaBan, item.TenKhachHang, item.SoDienThoai, item.ThoiGianDat, item.SoLuongKhach, item.TrangThai, id), commit=True)
    return {"status": "success", "message": "Đã cập nhật đặt bàn"}

@app.delete("/api/crud/datban/{id}", tags=["CRUD DatBan"])
def delete_datban(id: str):
    execute_query("DELETE FROM DatBan WHERE MaDatBan = %s", (id,), commit=True)
    return {"status": "success", "message": "Đã xóa lịch đặt bàn"}

# 9. HoaDon List
@app.get("/api/crud/hoadon", tags=["CRUD HoaDon"])
def list_hoadon(ma_chi_nhanh: Optional[str] = None):
    sql = """
        SELECT hd.*, cn.TenChiNhanh, o.MaBan, b.SoBan
        FROM HoaDon hd
        JOIN ChiNhanh cn ON hd.MaChiNhanh = cn.MaChiNhanh
        JOIN DonOrder o ON hd.MaOrder = o.MaOrder
        JOIN BanAn b ON o.MaBan = b.MaBan
    """
    params = ()
    if ma_chi_nhanh and ma_chi_nhanh != "ALL":
        sql += " WHERE hd.MaChiNhanh = %s"
        params = (ma_chi_nhanh,)
    sql += " ORDER BY hd.ThoiGianLap DESC"
    return execute_query(sql, params)

@app.get("/api/crud/hoadon/{ma_hoa_don}/details", tags=["CRUD HoaDon"])
def get_hoadon_details(ma_hoa_don: str):
    hd = execute_query("""
        SELECT hd.*, cn.TenChiNhanh, cn.DiaChi, cn.SoDienThoai AS Hotline, b.SoBan, o.ThoiGianOrder
        FROM HoaDon hd
        JOIN ChiNhanh cn ON hd.MaChiNhanh = cn.MaChiNhanh
        JOIN DonOrder o ON hd.MaOrder = o.MaOrder
        JOIN BanAn b ON o.MaBan = b.MaBan
        WHERE hd.MaHoaDon = %s
    """, (ma_hoa_don,), fetch_one=True)
    if not hd:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn!")

    items = execute_query("""
        SELECT cthd.*, m.TenMon
        FROM ChiTietHoaDon cthd
        JOIN MonAn m ON cthd.MaMonAn = m.MaMonAn
        WHERE cthd.MaHoaDon = %s
    """, (ma_hoa_don,))

    return {"hoa_don": hd, "items": items}

# =====================================================================
# 4. HỆ THỐNG 8 TRUY VẤN BÁO CÁO SQL BTL (KÈM EXPORT CSV)
# =====================================================================

QUERIES_META = {
    1: {
        "title": "Câu 1 (Cơ bản): Món Hải sản tạm ngưng phục vụ",
        "desc": "Tìm các món ăn thuộc nhóm 'Hải sản' đang tạm ngưng phục vụ (do hết nguyên liệu).",
        "sql": """
            SELECT m.MaMonAn, m.TenMon, m.DonGiaMon, m.TrangThaiPhucVu
            FROM MonAn m
            JOIN NhomThucDon n ON m.MaNhom = n.MaNhom
            WHERE n.TenNhom = 'Hải sản' AND m.TrangThaiPhucVu = 'TamNgung';
        """
    },
    2: {
        "title": "Câu 2 (Inner Join): Chi tiết hóa đơn cho bàn số 5",
        "desc": "In chi tiết hóa đơn bao gồm tên món, số lượng, đơn giá và tổng tiền cho bàn số 5.",
        "sql": """
            SELECT hd.MaHoaDon, b.SoBan, m.TenMon, cthd.SoLuong, cthd.DonGiaBan AS DonGia, cthd.ThanhTien AS TongTienMon
            FROM HoaDon hd
            INNER JOIN DonOrder od ON hd.MaOrder = od.MaOrder
            INNER JOIN BanAn b ON od.MaBan = b.MaBan
            INNER JOIN ChiTietHoaDon cthd ON hd.MaHoaDon = cthd.MaHoaDon
            INNER JOIN MonAn m ON cthd.MaMonAn = m.MaMonAn
            WHERE b.SoBan = 5;
        """
    },
    3: {
        "title": "Câu 3 (Group By): Doanh thu trung bình mỗi ngày theo chi nhánh (Tháng 10)",
        "desc": "Thống kê doanh thu trung bình mỗi ngày theo từng chi nhánh trong tháng 10.",
        "sql": """
            SELECT cn.MaChiNhanh, cn.TenChiNhanh,
                   COUNT(DISTINCT DATE(hd.ThoiGianLap)) AS SoNgayCoDoanhThu,
                   SUM(hd.TongTien) AS TongDoanhThuThang10,
                   ROUND(SUM(hd.TongTien) / COUNT(DISTINCT DATE(hd.ThoiGianLap)), 2) AS DoanhThuTrungBinhMoiNgay
            FROM ChiNhanh cn
            INNER JOIN HoaDon hd ON cn.MaChiNhanh = hd.MaChiNhanh
            WHERE MONTH(hd.ThoiGianLap) = 10 AND YEAR(hd.ThoiGianLap) = 2026
            GROUP BY cn.MaChiNhanh, cn.TenChiNhanh;
        """
    },
    4: {
        "title": "Câu 4 (Having): Món ăn bán chậm dưới 10 phần trong tháng",
        "desc": "Tìm các món ăn có số lượng bán ra trong tháng < 10 phần (món bán chậm cần loại khỏi menu).",
        "sql": """
            SELECT m.MaMonAn, m.TenMon, n.TenNhom, COALESCE(SUM(cthd.SoLuong), 0) AS TongSoLuongBan
            FROM MonAn m
            INNER JOIN NhomThucDon n ON m.MaNhom = n.MaNhom
            INNER JOIN ChiTietHoaDon cthd ON m.MaMonAn = cthd.MaMonAn
            INNER JOIN HoaDon hd ON cthd.MaHoaDon = hd.MaHoaDon
            WHERE MONTH(hd.ThoiGianLap) = 10 AND YEAR(hd.ThoiGianLap) = 2026
            GROUP BY m.MaMonAn, m.TenMon, n.TenNhom
            HAVING SUM(cthd.SoLuong) < 10;
        """
    },
    5: {
        "title": "Câu 5 (Outer Join): Tần suất xuất hiện trên hóa đơn (bao gồm món chưa bán)",
        "desc": "Liệt kê tất cả các món ăn trong menu và số lần xuất hiện trên hóa đơn (bao gồm cả món mới chưa ai gọi bao giờ).",
        "sql": """
            SELECT m.MaMonAn, m.TenMon, n.TenNhom, COUNT(cthd.MaHoaDon) AS SoLanXuatHienTrenHoaDon
            FROM MonAn m
            INNER JOIN NhomThucDon n ON m.MaNhom = n.MaNhom
            LEFT OUTER JOIN ChiTietHoaDon cthd ON m.MaMonAn = cthd.MaMonAn
            GROUP BY m.MaMonAn, m.TenMon, n.TenNhom
            ORDER BY SoLanXuatHienTrenHoaDon ASC;
        """
    },
    6: {
        "title": "Câu 6 (Correlated Subquery): Nguyên liệu tiêu thụ vượt mức trung bình ngày",
        "desc": "Tìm nguyên liệu có lượng tiêu thụ trong ngày vượt quá mức tiêu thụ trung bình của tất cả nguyên liệu.",
        "sql": """
            SELECT nl.MaNguyenLieu, nl.TenNguyenLieu, nl.DonViTinh, tieu_thu.TongLuongDung
            FROM NguyenLieu nl
            INNER JOIN (
                SELECT dlm.MaNguyenLieu, SUM(dlm.SoLuongDinhLuong * cto.SoLuong) AS TongLuongDung
                FROM ChiTietOrder cto
                INNER JOIN DinhLuongMon dlm ON cto.MaMonAn = dlm.MaMonAn
                WHERE DATE(cto.ThoiGianGoiMon) = '2026-10-15' AND cto.TrangThaiBep = 'HoanThanhMon'
                GROUP BY dlm.MaNguyenLieu
            ) tieu_thu ON nl.MaNguyenLieu = tieu_thu.MaNguyenLieu
            WHERE tieu_thu.TongLuongDung > (
                SELECT AVG(tong_tung_loai)
                FROM (
                    SELECT SUM(dlm2.SoLuongDinhLuong * cto2.SoLuong) AS tong_tung_loai
                    FROM ChiTietOrder cto2
                    INNER JOIN DinhLuongMon dlm2 ON cto2.MaMonAn = dlm2.MaMonAn
                    WHERE DATE(cto2.ThoiGianGoiMon) = '2026-10-15' AND cto2.TrangThaiBep = 'HoanThanhMon'
                    GROUP BY dlm2.MaNguyenLieu
                ) bang_tb
            );
        """
    },
    7: {
        "title": "Câu 7 (Subquery): Chi nhánh có doanh thu đồ uống cao nhất hệ thống",
        "desc": "Tìm chi nhánh có doanh thu bán món đồ uống cao nhất toàn hệ thống.",
        "sql": """
            SELECT cn.MaChiNhanh, cn.TenChiNhanh, SUM(cthd.ThanhTien) AS DoanhThuDoUong
            FROM ChiNhanh cn
            JOIN HoaDon hd ON cn.MaChiNhanh = hd.MaChiNhanh
            JOIN ChiTietHoaDon cthd ON hd.MaHoaDon = cthd.MaHoaDon
            JOIN MonAn m ON cthd.MaMonAn = m.MaMonAn
            JOIN NhomThucDon n ON m.MaNhom = n.MaNhom
            WHERE n.TenNhom = 'Đồ uống'
            GROUP BY cn.MaChiNhanh, cn.TenChiNhanh
            HAVING SUM(cthd.ThanhTien) >= ALL (
                SELECT SUM(cthd2.ThanhTien)
                FROM HoaDon hd2
                JOIN ChiTietHoaDon cthd2 ON hd2.MaHoaDon = cthd2.MaHoaDon
                JOIN MonAn m2 ON cthd2.MaMonAn = m2.MaMonAn
                JOIN NhomThucDon n2 ON m2.MaNhom = n2.MaNhom
                WHERE n2.TenNhom = 'Đồ uống'
                GROUP BY hd2.MaChiNhanh
            );
        """
    },
    8: {
        "title": "Câu 8 (Window Functions): Phân tích khung giờ cao điểm và xếp hạng doanh thu",
        "desc": "Thống kê số lượng order và doanh thu theo từng khung giờ trong ngày kèm DENSE_RANK().",
        "sql": """
            WITH KhungGioData AS (
                SELECT 
                    CASE 
                        WHEN HOUR(od.ThoiGianOrder) BETWEEN 8 AND 9 THEN '08:00 - 09:59 (Sáng sớm)'
                        WHEN HOUR(od.ThoiGianOrder) BETWEEN 10 AND 11 THEN '10:00 - 11:59 (Trưa / Peak 1)'
                        WHEN HOUR(od.ThoiGianOrder) BETWEEN 12 AND 13 THEN '12:00 - 13:59 (Chiều sớm)'
                        WHEN HOUR(od.ThoiGianOrder) BETWEEN 14 AND 17 THEN '14:00 - 17:59 (Xế chiều)'
                        WHEN HOUR(od.ThoiGianOrder) BETWEEN 18 AND 20 THEN '18:00 - 20:59 (Tối / Peak 2)'
                        ELSE '21:00 - 23:59 (Đêm muộn)'
                    END AS KhungGio,
                    COUNT(DISTINCT od.MaOrder) AS SoLuongOrder,
                    COALESCE(SUM(hd.TongTien), 0) AS TongDoanhThu
                FROM DonOrder od
                LEFT JOIN HoaDon hd ON od.MaOrder = hd.MaOrder
                GROUP BY 
                    CASE 
                        WHEN HOUR(od.ThoiGianOrder) BETWEEN 8 AND 9 THEN '08:00 - 09:59 (Sáng sớm)'
                        WHEN HOUR(od.ThoiGianOrder) BETWEEN 10 AND 11 THEN '10:00 - 11:59 (Trưa / Peak 1)'
                        WHEN HOUR(od.ThoiGianOrder) BETWEEN 12 AND 13 THEN '12:00 - 13:59 (Chiều sớm)'
                        WHEN HOUR(od.ThoiGianOrder) BETWEEN 14 AND 17 THEN '14:00 - 17:59 (Xế chiều)'
                        WHEN HOUR(od.ThoiGianOrder) BETWEEN 18 AND 20 THEN '18:00 - 20:59 (Tối / Peak 2)'
                        ELSE '21:00 - 23:59 (Đêm muộn)'
                    END
            )
            SELECT 
                KhungGio,
                SoLuongOrder,
                TongDoanhThu,
                ROUND(100.0 * TongDoanhThu / NULLIF(SUM(TongDoanhThu) OVER(), 0), 2) AS TyTrongDoanhThu_PhanTram,
                DENSE_RANK() OVER (ORDER BY SoLuongOrder DESC) AS XepHangLuongKhach,
                DENSE_RANK() OVER (ORDER BY TongDoanhThu DESC) AS XepHangDoanhThu
            FROM KhungGioData
            ORDER BY XepHangDoanhThu ASC;
        """
    }
}

@app.get("/api/reports", tags=["Reports"])
def list_reports():
    """Lấy danh sách các câu truy vấn có sẵn"""
    return [
        {"cau": k, "title": v["title"], "desc": v["desc"]}
        for k, v in QUERIES_META.items()
    ]

@app.get("/api/reports/{cau_so}", tags=["Reports"])
def run_report(cau_so: int):
    """Chạy trực tiếp câu truy vấn BTL và trả kết quả kèm SQL text"""
    if cau_so not in QUERIES_META:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu truy vấn này!")
    
    meta = QUERIES_META[cau_so]
    data = execute_query(meta["sql"])
    return {
        "cau": cau_so,
        "title": meta["title"],
        "desc": meta["desc"],
        "sql": meta["sql"].strip(),
        "total_records": len(data) if data else 0,
        "data": data
    }

@app.get("/api/reports/{cau_so}/export-csv", tags=["Reports"])
def export_report_csv(cau_so: int):
    """Xuất kết quả câu truy vấn ra file CSV có UTF-8 BOM chuẩn cho Excel"""
    if cau_so not in QUERIES_META:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu truy vấn này!")
    
    meta = QUERIES_META[cau_so]
    data = execute_query(meta["sql"])
    if not data:
        raise HTTPException(status_code=404, detail="Không có dữ liệu để xuất!")

    output = io.StringIO()
    # Ghi UTF-8 BOM để Excel hiển thị tiếng Việt có dấu chuẩn xác
    output.write('\ufeff')
    writer = csv.DictWriter(output, fieldnames=list(data[0].keys()))
    writer.writeheader()
    writer.writerows(data)

    csv_data = output.getvalue().encode('utf-8-sig')
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=BTL_SQL_Cau_{cau_so}.csv"}
    )

# =====================================================================
# 5. PHỤC VỤ GIAO DIỆN WEB FRONTEND
# =====================================================================

# Đảm bảo các thư mục static và templates tồn tại
os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)
os.makedirs("templates", exist_ok=True)

# Mount thư mục static
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def serve_spa():
    index_file = os.path.join("templates", "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>Ứng dụng RestaurantOS đang khởi động...</h1>"
