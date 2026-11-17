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
import pymysql

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
    except pymysql.err.IntegrityError as ie:
        if commit:
            conn.rollback()
        err_code = ie.args[0] if len(ie.args) > 0 else 0
        if err_code == 1451:
            raise HTTPException(
                status_code=400,
                detail="Không thể xóa hoặc sửa bản ghi này do đang có dữ liệu khác liên kết (Ràng buộc Khóa ngoại CSDL). Vui lòng kiểm tra và xóa các dữ liệu liên quan trước."
            )
        elif err_code == 1062:
            raise HTTPException(
                status_code=400,
                detail="Mã định danh (Khóa chính / UNIQUE) này đã tồn tại trong hệ thống. Vui lòng chọn mã khác!"
            )
        elif err_code == 1452:
            raise HTTPException(
                status_code=400,
                detail="Dữ liệu liên kết không tồn tại: Khóa ngoại tham chiếu không hợp lệ."
            )
        else:
            raise HTTPException(status_code=400, detail=f"Lỗi ràng buộc toàn vẹn CSDL: {str(ie)}")
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
    MaChiNhanh: str = Field(..., max_length=10, examples=["CN11"])
    TenChiNhanh: str = Field(..., max_length=100, examples=["Nhà hàng Biển Đông - Landmark 81"])
    DiaChi: str = Field(..., max_length=255, examples=["720A Điện Biên Phủ, P. 22, Bình Thạnh, TP.HCM"])
    SoDienThoai: Optional[str] = Field(None, max_length=15, examples=["0901234599"])

class BanAnSchema(BaseModel):
    MaBan: str = Field(..., max_length=10, examples=["B51"])
    SoBan: int = Field(..., gt=0, examples=[6])
    MaChiNhanh: str = Field(..., max_length=10, examples=["CN01"])
    SucChua: int = Field(4, gt=0, examples=[4])
    TrangThai: str = Field("Trong", examples=["Trong"])

class NhomThucDonSchema(BaseModel):
    MaNhom: str = Field(..., max_length=10, examples=["N05"])
    TenNhom: str = Field(..., max_length=50, examples=["Tráng miệng"])

class MonAnSchema(BaseModel):
    MaMonAn: str = Field(..., max_length=10, examples=["M10"])
    TenMon: str = Field(..., max_length=100, examples=["Panna Cotta dâu tây"])
    MaNhom: str = Field(..., max_length=10, examples=["N01"])
    DonGiaMon: float = Field(..., gt=0, examples=[65000.0])
    TrangThaiPhucVu: str = Field("DangPhucVu", examples=["DangPhucVu"])

class NguyenLieuSchema(BaseModel):
    MaNguyenLieu: str = Field(..., max_length=10, examples=["NL06"])
    TenNguyenLieu: str = Field(..., max_length=100, examples=["Dâu tây Đà Lạt"])
    DonViTinh: str = Field(..., max_length=20, examples=["kg"])

class KhoNguyenLieuSchema(BaseModel):
    MaChiNhanh: str = Field(..., max_length=10, examples=["CN01"])
    MaNguyenLieu: str = Field(..., max_length=10, examples=["NL01"])
    SoLuongTon: float = Field(..., ge=0, examples=[20.5])

class DinhLuongMonSchema(BaseModel):
    MaMonAn: str = Field(..., max_length=10, examples=["M01"])
    MaNguyenLieu: str = Field(..., max_length=10, examples=["NL01"])
    SoLuongDinhLuong: float = Field(..., gt=0, examples=[0.5])

class DatBanSchema(BaseModel):
    MaDatBan: str = Field(..., max_length=10, examples=["DB99"])
    MaBan: str = Field(..., max_length=10, examples=["B01"])
    TenKhachHang: str = Field(..., max_length=100, examples=["Nguyễn Văn A"])
    SoDienThoai: str = Field(..., max_length=15, examples=["0987654321"])
    ThoiGianDat: str = Field(..., examples=["2026-11-20 18:30:00"])
    SoLuongKhach: int = Field(..., gt=0, examples=[4])
    TrangThai: str = Field("ChuaNhan", examples=["ChuaNhan"])

class OrderItem(BaseModel):
    ma_mon_an: str = Field(..., examples=["M01"])
    so_luong: int = Field(..., gt=0, examples=[2])

class CreateOrderRequest(BaseModel):
    ma_ban: str = Field(..., examples=["B05"])
    so_luong_khach: int = Field(..., gt=0, examples=[4])
    danh_sach_mon: List[OrderItem] = Field(..., min_length=1, examples=[[{"ma_mon_an": "M01", "so_luong": 2}]])

class KitchenUpdateStatus(BaseModel):
    trang_thai: str = Field(..., examples=["HoanThanhMon"])

class ThanhToanRequest(BaseModel):
    phuong_thuc: str = Field("TienMat", examples=["TienMat"])

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

    # 3. Thống kê tổng doanh thu & tổng hóa đơn (Tự động cộng dồn toàn bộ hóa đơn thanh toán)
    if is_branch:
        rev = execute_query("""
            SELECT 
                COALESCE(SUM(TongTien), 0) AS tong_doanh_thu,
                COALESCE(SUM(TongTien), 0) AS doanh_thu_thang_10,
                COUNT(*) AS tong_hoa_don
            FROM HoaDon
            WHERE MaChiNhanh = %s
        """, (ma_chi_nhanh,), fetch_one=True)
    else:
        rev = execute_query("""
            SELECT 
                COALESCE(SUM(TongTien), 0) AS tong_doanh_thu,
                COALESCE(SUM(TongTien), 0) AS doanh_thu_thang_10,
                COUNT(*) AS tong_hoa_don
            FROM HoaDon
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
    table = execute_query("SELECT MaBan FROM BanAn WHERE MaBan = %s", (ma_ban,), fetch_one=True)
    if not table:
        raise HTTPException(status_code=404, detail=f"Bàn ăn '{ma_ban}' không tồn tại!")
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

@app.get("/api/orders/pending", tags=["Operations"])
def get_pending_orders(ma_chi_nhanh: Optional[str] = None):
    """Lấy danh sách các đơn order đang phục vụ cần thu ngân thanh toán"""
    sql = """
        SELECT o.MaOrder, o.MaBan, b.SoBan, b.MaChiNhanh, cn.TenChiNhanh, 
               o.ThoiGianOrder, o.SoLuongKhach, o.TrangThaiOrder,
               COALESCE(SUM(cto.SoLuong * m.DonGiaMon), 0) AS TamTinh,
               COUNT(cto.MaChiTietOrder) AS SoMon
        FROM DonOrder o
        JOIN BanAn b ON o.MaBan = b.MaBan
        JOIN ChiNhanh cn ON b.MaChiNhanh = cn.MaChiNhanh
        LEFT JOIN ChiTietOrder cto ON o.MaOrder = cto.MaOrder
        LEFT JOIN MonAn m ON cto.MaMonAn = m.MaMonAn
        WHERE o.TrangThaiOrder = 'DangXuLy'
    """
    params = ()
    if ma_chi_nhanh and ma_chi_nhanh != "ALL":
        sql += " AND b.MaChiNhanh = %s"
        params = (ma_chi_nhanh,)
    sql += " GROUP BY o.MaOrder, o.MaBan, b.SoBan, b.MaChiNhanh, cn.TenChiNhanh, o.ThoiGianOrder, o.SoLuongKhach, o.TrangThaiOrder"
    sql += " ORDER BY o.ThoiGianOrder DESC"
    return execute_query(sql, params)

@app.post("/api/orders", tags=["Operations"], status_code=status.HTTP_201_CREATED)
def create_order(order_data: CreateOrderRequest):
    """
    Gọi món tại bàn:
    * Nếu bàn đang có đơn 'DangXuLy', tự động cộng dồn món mới vào đơn hiện tại
    * Nếu bàn trống, tạo mới DonOrder và Trigger sẽ đổi bàn sang 'DangPhucVu'
    * Chèn các món vào ChiTietOrder gửi tới Bếp/Bar
    """
    # 1. Kiểm tra danh sách món ăn
    if not order_data.danh_sach_mon:
        raise HTTPException(status_code=400, detail="Danh sách món ăn không được để trống!")

    # 2. Kiểm tra bàn
    ban = execute_query("SELECT * FROM BanAn WHERE MaBan = %s", (order_data.ma_ban,), fetch_one=True)
    if not ban:
        raise HTTPException(status_code=404, detail="Bàn ăn không tồn tại!")

    # 3. Kiểm tra xem bàn đã có đơn order đang xử lý chưa (Cộng dồn món)
    active_order = execute_query("""
        SELECT MaOrder FROM DonOrder 
        WHERE MaBan = %s AND TrangThaiOrder = 'DangXuLy' 
        ORDER BY ThoiGianOrder DESC LIMIT 1
    """, (order_data.ma_ban,), fetch_one=True)

    if active_order:
        ma_order = active_order["MaOrder"]
        msg = f"Đã thêm món mới vào đơn {ma_order} của bàn thành công!"
    else:
        ma_order = "OD" + datetime.now().strftime("%d%H%M%S")
        execute_query("""
            INSERT INTO DonOrder (MaOrder, MaBan, ThoiGianOrder, SoLuongKhach, TrangThaiOrder)
            VALUES (%s, %s, NOW(), %s, 'DangXuLy')
        """, (ma_order, order_data.ma_ban, order_data.so_luong_khach), commit=True)
        msg = "Mở bàn & gọi món thành công! Đã gửi order tới Bếp/Bar."

    # 3. Chèn các món vào ChiTietOrder
    for item in order_data.danh_sach_mon:
        execute_query("""
            INSERT INTO ChiTietOrder (MaOrder, MaMonAn, SoLuong, TrangThaiBep, ThoiGianGoiMon)
            VALUES (%s, %s, %s, 'ChoXuLy', NOW())
        """, (ma_order, item.ma_mon_an, item.so_luong), commit=True)

    # Đảm bảo trạng thái bàn là 'DangPhucVu'
    execute_query("UPDATE BanAn SET TrangThai = 'DangPhucVu' WHERE MaBan = %s", (order_data.ma_ban,), commit=True)

    return {
        "status": "success",
        "message": msg,
        "ma_order": ma_order,
        "ma_ban": order_data.ma_ban,
        "trang_thai_ban": "DangPhucVu"
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
    if payload.trang_thai not in ["ChoXuLy", "DangCheBien", "HoanThanhMon"]:
        raise HTTPException(
            status_code=400,
            detail="Trạng thái bếp không hợp lệ! (Cho phép: ChoXuLy, DangCheBien, HoanThanhMon)"
        )

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

    # Nếu đơn vẫn đang phục vụ, lấy tất cả các món thuộc bàn này (đảm bảo không bị sót món khi gọi thêm)
    if order["TrangThaiOrder"] == "DangXuLy":
        items = execute_query("""
            SELECT cto.MaMonAn, m.TenMon, SUM(cto.SoLuong) AS SoLuong, m.DonGiaMon,
                   SUM(cto.SoLuong * m.DonGiaMon) AS ThanhTien
            FROM ChiTietOrder cto
            JOIN MonAn m ON cto.MaMonAn = m.MaMonAn
            JOIN DonOrder o ON cto.MaOrder = o.MaOrder
            WHERE o.MaBan = %s AND o.TrangThaiOrder = 'DangXuLy'
            GROUP BY cto.MaMonAn, m.TenMon, m.DonGiaMon
        """, (order["MaBan"],))
    else:
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
    * Gom nhóm toàn bộ món của bàn đang phục vụ (thỏa mãn UNIQUE MaHoaDon, MaMonAn)
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

    # Gom nhóm toàn bộ món đã dùng của bàn đang phục vụ
    dishes = execute_query("""
        SELECT cto.MaMonAn, SUM(cto.SoLuong) AS TongSoLuong, m.DonGiaMon,
               SUM(cto.SoLuong * m.DonGiaMon) AS ThanhTien
        FROM ChiTietOrder cto
        JOIN MonAn m ON cto.MaMonAn = m.MaMonAn
        JOIN DonOrder o ON cto.MaOrder = o.MaOrder
        WHERE o.MaBan = %s AND o.TrangThaiOrder = 'DangXuLy'
        GROUP BY cto.MaMonAn, m.DonGiaMon
    """, (order["MaBan"],))

    if not dishes:
        raise HTTPException(status_code=400, detail="Đơn order chưa có món ăn nào!")

    tong_tien = sum(d["ThanhTien"] for d in dishes)
    
    import time
    ma_hoa_don = "HD" + datetime.now().strftime("%d%H%M%S")
    chk = execute_query("SELECT MaHoaDon FROM HoaDon WHERE MaHoaDon = %s", (ma_hoa_don,), fetch_one=True)
    if chk:
        ma_hoa_don = "HD" + str(int(time.time()))[-8:]

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

    # 3. Đổi trạng thái toàn bộ order của bàn này sang 'DaThanhToan' và giải phóng bàn về 'Trong'
    execute_query("UPDATE DonOrder SET TrangThaiOrder = 'DaThanhToan' WHERE MaBan = %s AND TrangThaiOrder = 'DangXuLy'", (order["MaBan"],), commit=True)
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
    if not execute_query("SELECT 1 FROM ChiNhanh WHERE MaChiNhanh = %s", (id,), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy chi nhánh '{id}'!")
    execute_query("UPDATE ChiNhanh SET TenChiNhanh = %s, DiaChi = %s, SoDienThoai = %s WHERE MaChiNhanh = %s",
                  (item.TenChiNhanh, item.DiaChi, item.SoDienThoai, id), commit=True)
    return {"status": "success", "message": "Đã cập nhật chi nhánh"}

@app.delete("/api/crud/chinhanh/{id}", tags=["CRUD ChiNhanh"])
def delete_chinhanh(id: str):
    if not execute_query("SELECT 1 FROM ChiNhanh WHERE MaChiNhanh = %s", (id,), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy chi nhánh '{id}'!")
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
    if not execute_query("SELECT 1 FROM BanAn WHERE MaBan = %s", (id,), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy bàn ăn '{id}'!")
    execute_query("UPDATE BanAn SET SoBan = %s, MaChiNhanh = %s, SucChua = %s, TrangThai = %s WHERE MaBan = %s",
                  (item.SoBan, item.MaChiNhanh, item.SucChua, item.TrangThai, id), commit=True)
    return {"status": "success", "message": "Đã cập nhật bàn ăn"}

@app.delete("/api/crud/banan/{id}", tags=["CRUD BanAn"])
def delete_banan(id: str):
    if not execute_query("SELECT 1 FROM BanAn WHERE MaBan = %s", (id,), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy bàn ăn '{id}'!")
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
    if not execute_query("SELECT 1 FROM NhomThucDon WHERE MaNhom = %s", (id,), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy nhóm thực đơn '{id}'!")
    execute_query("UPDATE NhomThucDon SET TenNhom = %s WHERE MaNhom = %s", (item.TenNhom, id), commit=True)
    return {"status": "success", "message": "Đã cập nhật nhóm thực đơn"}

@app.delete("/api/crud/nhomthucdon/{id}", tags=["CRUD NhomThucDon"])
def delete_nhomthucdon(id: str):
    if not execute_query("SELECT 1 FROM NhomThucDon WHERE MaNhom = %s", (id,), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy nhóm thực đơn '{id}'!")
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
    if not execute_query("SELECT 1 FROM MonAn WHERE MaMonAn = %s", (id,), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy món ăn '{id}'!")
    execute_query("UPDATE MonAn SET TenMon = %s, MaNhom = %s, DonGiaMon = %s, TrangThaiPhucVu = %s WHERE MaMonAn = %s",
                  (item.TenMon, item.MaNhom, item.DonGiaMon, item.TrangThaiPhucVu, id), commit=True)
    return {"status": "success", "message": "Đã cập nhật món ăn"}

@app.delete("/api/crud/monan/{id}", tags=["CRUD MonAn"])
def delete_monan(id: str):
    if not execute_query("SELECT 1 FROM MonAn WHERE MaMonAn = %s", (id,), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy món ăn '{id}'!")
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
    if not execute_query("SELECT 1 FROM NguyenLieu WHERE MaNguyenLieu = %s", (id,), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy nguyên liệu '{id}'!")
    execute_query("UPDATE NguyenLieu SET TenNguyenLieu = %s, DonViTinh = %s WHERE MaNguyenLieu = %s",
                  (item.TenNguyenLieu, item.DonViTinh, id), commit=True)
    return {"status": "success", "message": "Đã cập nhật nguyên liệu"}

@app.delete("/api/crud/nguyenlieu/{id}", tags=["CRUD NguyenLieu"])
def delete_nguyenlieu(id: str):
    if not execute_query("SELECT 1 FROM NguyenLieu WHERE MaNguyenLieu = %s", (id,), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy nguyên liệu '{id}'!")
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

@app.put("/api/crud/khonguyenlieu/{ma_cn}/{ma_nl}", tags=["CRUD Kho"])
def update_kho(ma_cn: str, ma_nl: str, item: KhoNguyenLieuSchema):
    if not execute_query("SELECT 1 FROM KhoNguyenLieu WHERE MaChiNhanh = %s AND MaNguyenLieu = %s", (ma_cn, ma_nl), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy nguyên liệu '{ma_nl}' trong kho chi nhánh '{ma_cn}'!")
    execute_query("""
        UPDATE KhoNguyenLieu 
        SET SoLuongTon = %s 
        WHERE MaChiNhanh = %s AND MaNguyenLieu = %s
    """, (item.SoLuongTon, ma_cn, ma_nl), commit=True)
    return {"status": "success", "message": "Đã cập nhật số lượng tồn kho"}

@app.delete("/api/crud/khonguyenlieu/{ma_cn}/{ma_nl}", tags=["CRUD Kho"])
def delete_kho(ma_cn: str, ma_nl: str):
    if not execute_query("SELECT 1 FROM KhoNguyenLieu WHERE MaChiNhanh = %s AND MaNguyenLieu = %s", (ma_cn, ma_nl), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy nguyên liệu '{ma_nl}' trong kho chi nhánh '{ma_cn}'!")
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

@app.put("/api/crud/dinhluongmon/{ma_mon}/{ma_nl}", tags=["CRUD DinhLuong"])
def update_dinhluong(ma_mon: str, ma_nl: str, item: DinhLuongMonSchema):
    if not execute_query("SELECT 1 FROM DinhLuongMon WHERE MaMonAn = %s AND MaNguyenLieu = %s", (ma_mon, ma_nl), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy định lượng món '{ma_mon}' với nguyên liệu '{ma_nl}'!")
    execute_query("""
        UPDATE DinhLuongMon 
        SET SoLuongDinhLuong = %s 
        WHERE MaMonAn = %s AND MaNguyenLieu = %s
    """, (item.SoLuongDinhLuong, ma_mon, ma_nl), commit=True)
    return {"status": "success", "message": "Đã cập nhật định lượng món ăn"}

@app.delete("/api/crud/dinhluongmon/{ma_mon}/{ma_nl}", tags=["CRUD DinhLuong"])
def delete_dinhluong(ma_mon: str, ma_nl: str):
    if not execute_query("SELECT 1 FROM DinhLuongMon WHERE MaMonAn = %s AND MaNguyenLieu = %s", (ma_mon, ma_nl), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy định lượng món '{ma_mon}' với nguyên liệu '{ma_nl}'!")
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
    if not execute_query("SELECT 1 FROM DatBan WHERE MaDatBan = %s", (id,), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy lịch đặt bàn '{id}'!")
    execute_query("""
        UPDATE DatBan 
        SET MaBan = %s, TenKhachHang = %s, SoDienThoai = %s, ThoiGianDat = %s, SoLuongKhach = %s, TrangThai = %s
        WHERE MaDatBan = %s
    """, (item.MaBan, item.TenKhachHang, item.SoDienThoai, item.ThoiGianDat, item.SoLuongKhach, item.TrangThai, id), commit=True)
    return {"status": "success", "message": "Đã cập nhật đặt bàn"}

@app.delete("/api/crud/datban/{id}", tags=["CRUD DatBan"])
def delete_datban(id: str):
    if not execute_query("SELECT 1 FROM DatBan WHERE MaDatBan = %s", (id,), fetch_one=True):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy lịch đặt bàn '{id}'!")
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


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(BASE_DIR, "static")
templates_dir = os.path.join(BASE_DIR, "templates")

# Mount thư mục static
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def serve_spa():
    index_file = os.path.join(templates_dir, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>Ứng dụng RestaurantOS đang khởi động...</h1>"
