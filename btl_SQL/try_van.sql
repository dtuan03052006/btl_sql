-- =================================================================================
-- DỰ ÁN BTL HỆ THỐNG QUẢN LÝ NHÀ HÀNG - TẬP HỢP 8 TRUY VẤN SQL CHUẨN MỰC
-- Hệ Quản trị CSDL: MySQL 8.0+
-- File: btl_SQL/try_van.sql
-- =================================================================================

USE QuanLyNhaHang;

-- =================================================================================
-- 1. TRUY VẤN CƠ BẢN (SELECT - WHERE - JOIN 2 BẢNG)
-- Đề bài: Tìm các món ăn thuộc nhóm "Hải sản" đang tạm ngưng phục vụ (do hết nguyên liệu).
-- Kỹ thuật: INNER JOIN kết hợp bộ lọc điều kiện WHERE chuỗi và trạng thái.
-- =================================================================================
SELECT 
    m.MaMonAn, 
    m.TenMon, 
    n.TenNhom, 
    m.DonGiaMon, 
    m.TrangThaiPhucVu
FROM MonAn m
INNER JOIN NhomThucDon n ON m.MaNhom = n.MaNhom
WHERE n.TenNhom LIKE '%Hải sản%'
  AND m.TrangThaiPhucVu = 'TamNgung';


-- =================================================================================
-- 2. TRUY VẤN INNER JOIN (KẾT NỐI NHIỀU BẢNG)
-- Đề bài: In chi tiết hóa đơn bao gồm tên món, số lượng, đơn giá và tổng tiền cho bàn số 5.
-- Kỹ thuật: INNER JOIN 5 bảng: BanAn -> DonOrder -> HoaDon -> ChiTietHoaDon -> MonAn.
-- =================================================================================
SELECT 
    hd.MaHoaDon, 
    b.SoBan, 
    b.MaChiNhanh,
    m.TenMon, 
    cthd.SoLuong, 
    cthd.DonGiaBan AS DonGia, 
    cthd.ThanhTien AS TongTienMon,
    hd.ThoiGianLap
FROM HoaDon hd
INNER JOIN DonOrder od ON hd.MaOrder = od.MaOrder
INNER JOIN BanAn b ON od.MaBan = b.MaBan
INNER JOIN ChiTietHoaDon cthd ON hd.MaHoaDon = cthd.MaHoaDon
INNER JOIN MonAn m ON cthd.MaMonAn = m.MaMonAn
WHERE b.SoBan = 5
ORDER BY hd.ThoiGianLap DESC, m.TenMon ASC;


-- =================================================================================
-- 3. TRUY VẤN GROUP BY (GOM NHÓM & HÀM TỔNG HỢP)
-- Đề bài: Thống kê doanh thu trung bình mỗi ngày theo từng chi nhánh trong tháng 10.
-- Kỹ thuật: GROUP BY theo chi nhánh, kết hợp hàm SUM(), COUNT(DISTINCT DATE()) và ROUND().
-- =================================================================================
SELECT 
    cn.MaChiNhanh, 
    cn.TenChiNhanh, 
    COUNT(DISTINCT DATE(hd.ThoiGianLap)) AS SoNgayCoDoanhThu,
    SUM(hd.TongTien) AS TongDoanhThuThang10,
    ROUND(
        SUM(hd.TongTien) / COUNT(DISTINCT DATE(hd.ThoiGianLap)), 
        2
    ) AS DoanhThuTrungBinhMoiNgay
FROM ChiNhanh cn
INNER JOIN HoaDon hd ON cn.MaChiNhanh = hd.MaChiNhanh
WHERE MONTH(hd.ThoiGianLap) = 10 
  AND YEAR(hd.ThoiGianLap) = 2026
GROUP BY cn.MaChiNhanh, cn.TenChiNhanh
ORDER BY DoanhThuTrungBinhMoiNgay DESC;


-- =================================================================================
-- 4. TRUY VẤN HAVING (LỌC TRÊN KẾT QUẢ GOM NHÓM)
-- Đề bài: Tìm các món ăn có số lượng bán ra trong tháng < 10 phần (món bán chậm cần loại khỏi menu).
-- Kỹ thuật: GROUP BY món ăn và sử dụng HAVING SUM(cthd.SoLuong) < 10 để lọc sau khi tổng hợp.
-- =================================================================================
SELECT 
    m.MaMonAn, 
    m.TenMon, 
    n.TenNhom, 
    COALESCE(SUM(cthd.SoLuong), 0) AS TongSoLuongBan,
    COALESCE(SUM(cthd.ThanhTien), 0) AS TongDoanhThuMon
FROM MonAn m
INNER JOIN NhomThucDon n ON m.MaNhom = n.MaNhom
INNER JOIN ChiTietHoaDon cthd ON m.MaMonAn = cthd.MaMonAn
INNER JOIN HoaDon hd ON cthd.MaHoaDon = hd.MaHoaDon
WHERE MONTH(hd.ThoiGianLap) = 10 
  AND YEAR(hd.ThoiGianLap) = 2026
GROUP BY m.MaMonAn, m.TenMon, n.TenNhom
HAVING SUM(cthd.SoLuong) < 10
ORDER BY TongSoLuongBan ASC, TongDoanhThuMon ASC;


-- =================================================================================
-- 5. TRUY VẤN OUTER JOIN (LEFT JOIN)
-- Đề bài: Liệt kê tất cả các món ăn trong menu và số lần xuất hiện trên hóa đơn (bao gồm cả món mới chưa ai gọi bao giờ).
-- Kỹ thuật: LEFT OUTER JOIN giữa MonAn với ChiTietHoaDon, kết hợp COUNT(cthd.MaHoaDon) để món chưa bán có số lần = 0.
-- =================================================================================
SELECT 
    m.MaMonAn, 
    m.TenMon, 
    n.TenNhom, 
    m.DonGiaMon,
    COUNT(cthd.MaHoaDon) AS SoLanXuatHienTrenHoaDon,
    COALESCE(SUM(cthd.SoLuong), 0) AS TongSoPhanDaBan
FROM MonAn m
INNER JOIN NhomThucDon n ON m.MaNhom = n.MaNhom
LEFT OUTER JOIN ChiTietHoaDon cthd ON m.MaMonAn = cthd.MaMonAn
GROUP BY m.MaMonAn, m.TenMon, n.TenNhom, m.DonGiaMon
ORDER BY SoLanXuatHienTrenHoaDon ASC, TongSoPhanDaBan ASC, m.MaMonAn ASC;


-- =================================================================================
-- 6. TRUY VẤN CORRELATED SUBQUERY (TRUY VẤN CON TƯƠNG QUAN)
-- Đề bài: Tìm nguyên liệu có lượng tiêu thụ trong ngày vượt quá mức tiêu thụ trung bình của tất cả nguyên liệu.
-- Kỹ thuật: Correlated Subquery ở mệnh đề WHERE tham chiếu trực tiếp đến `nl.MaNguyenLieu` của Outer Query,
--           so sánh với mức tiêu thụ trung bình toàn hệ thống trong ngày đó (ở đây chọn ngày '2026-10-15').
-- =================================================================================
SELECT 
    nl.MaNguyenLieu, 
    nl.TenNguyenLieu, 
    nl.DonViTinh,
    (
        -- Tính tổng lượng tiêu thụ của từng nguyên liệu trong ngày tương quan với nl.MaNguyenLieu
        SELECT SUM(dlm.SoLuongDinhLuong * cto.SoLuong)
        FROM ChiTietOrder cto
        INNER JOIN DinhLuongMon dlm ON cto.MaMonAn = dlm.MaMonAn
        WHERE dlm.MaNguyenLieu = nl.MaNguyenLieu
          AND DATE(cto.ThoiGianGoiMon) = '2026-10-15'
          AND cto.TrangThaiBep = 'HoanThanhMon'
    ) AS TongLuongTieuThuTrongNgay
FROM NguyenLieu nl
WHERE (
    -- CORRELATED SUBQUERY: Lượng tiêu thụ của nguyên liệu hiện tại trong ngày
    SELECT SUM(dlm.SoLuongDinhLuong * cto.SoLuong)
    FROM ChiTietOrder cto
    INNER JOIN DinhLuongMon dlm ON cto.MaMonAn = dlm.MaMonAn
    WHERE dlm.MaNguyenLieu = nl.MaNguyenLieu
      AND DATE(cto.ThoiGianGoiMon) = '2026-10-15'
      AND cto.TrangThaiBep = 'HoanThanhMon'
) > (
    -- SUBQUERY: Mức tiêu thụ trung bình của tất cả các nguyên liệu được sử dụng trong ngày đó
    SELECT AVG(tong_tung_nguyen_lieu)
    FROM (
        SELECT SUM(dlm2.SoLuongDinhLuong * cto2.SoLuong) AS tong_tung_nguyen_lieu
        FROM ChiTietOrder cto2
        INNER JOIN DinhLuongMon dlm2 ON cto2.MaMonAn = dlm2.MaMonAn
        WHERE DATE(cto2.ThoiGianGoiMon) = '2026-10-15'
          AND cto2.TrangThaiBep = 'HoanThanhMon'
        GROUP BY dlm2.MaNguyenLieu
    ) bang_tb_ngay
)
ORDER BY TongLuongTieuThuTrongNgay DESC;


-- =================================================================================
-- 7. TRUY VẤN SUBQUERY NÂNG CAO (MỆNH ĐỀ HAVING KẾT HỢP SO SÁNH >= ALL)
-- Đề bài: Tìm chi nhánh có doanh thu bán món đồ uống cao nhất toàn hệ thống.
-- Kỹ thuật: GROUP BY theo chi nhánh và dùng HAVING ... >= ALL (Subquery) để tìm giá trị cực đại không phụ thuộc LIMIT.
-- =================================================================================
SELECT 
    cn.MaChiNhanh, 
    cn.TenChiNhanh, 
    SUM(cthd.ThanhTien) AS DoanhThuDoUong
FROM ChiNhanh cn
INNER JOIN HoaDon hd ON cn.MaChiNhanh = hd.MaChiNhanh
INNER JOIN ChiTietHoaDon cthd ON hd.MaHoaDon = cthd.MaHoaDon
INNER JOIN MonAn m ON cthd.MaMonAn = m.MaMonAn
INNER JOIN NhomThucDon n ON m.MaNhom = n.MaNhom
WHERE n.TenNhom LIKE '%Đồ uống%'
GROUP BY cn.MaChiNhanh, cn.TenChiNhanh
HAVING SUM(cthd.ThanhTien) >= ALL (
    -- Subquery lấy toàn bộ doanh thu đồ uống của từng chi nhánh để so sánh >= ALL
    SELECT SUM(cthd2.ThanhTien)
    FROM HoaDon hd2
    INNER JOIN ChiTietHoaDon cthd2 ON hd2.MaHoaDon = cthd2.MaHoaDon
    INNER JOIN MonAn m2 ON cthd2.MaMonAn = m2.MaMonAn
    INNER JOIN NhomThucDon n2 ON m2.MaNhom = n2.MaNhom
    WHERE n2.TenNhom LIKE '%Đồ uống%'
    GROUP BY hd2.MaChiNhanh
);


-- =================================================================================
-- 8. TRUY VẤN WINDOW FUNCTIONS (HÀM CỬA SỔ VỚI PARTITION BY)
-- Đề bài: Phân tích khung giờ cao điểm: Thống kê số lượng order và doanh thu theo từng khung giờ trong ngày
--         (8h-10h, 10h-12h, v.v.) dùng PARTITION BY.
-- Kỹ thuật: Phân khoảng thời gian bằng CASE WHEN, kết hợp CTE và các hàm cửa sổ:
--           - COUNT(hd.MaHoaDon) OVER (PARTITION BY KhungGio)
--           - SUM(hd.TongTien) OVER (PARTITION BY KhungGio)
--           - DENSE_RANK() OVER (ORDER BY TongDoanhThuKhungGio DESC) để xếp hạng khung giờ vàng.
-- =================================================================================

-- Cách tiếp cận toàn diện: Thống kê tổng hợp khung giờ kèm tỷ lệ doanh thu & xếp hạng cao điểm
WITH DuLieuKhungGio AS (
    SELECT 
        hd.MaHoaDon,
        hd.MaChiNhanh,
        hd.TongTien,
        hd.ThoiGianLap,
        CASE 
            WHEN HOUR(hd.ThoiGianLap) >= 8  AND HOUR(hd.ThoiGianLap) < 10 THEN '08:00 - 10:00 (Sáng)'
            WHEN HOUR(hd.ThoiGianLap) >= 10 AND HOUR(hd.ThoiGianLap) < 12 THEN '10:00 - 12:00 (Trưa sớm)'
            WHEN HOUR(hd.ThoiGianLap) >= 12 AND HOUR(hd.ThoiGianLap) < 14 THEN '12:00 - 14:00 (Cao điểm trưa)'
            WHEN HOUR(hd.ThoiGianLap) >= 14 AND HOUR(hd.ThoiGianLap) < 16 THEN '14:00 - 16:00 (Đầu giờ chiều)'
            WHEN HOUR(hd.ThoiGianLap) >= 16 AND HOUR(hd.ThoiGianLap) < 18 THEN '16:00 - 18:00 (Chiều tối)'
            WHEN HOUR(hd.ThoiGianLap) >= 18 AND HOUR(hd.ThoiGianLap) < 20 THEN '18:00 - 20:00 (Cao điểm tối)'
            WHEN HOUR(hd.ThoiGianLap) >= 20 AND HOUR(hd.ThoiGianLap) < 22 THEN '20:00 - 22:00 (Đêm)'
            ELSE 'Khung giờ khác'
        END AS KhungGio
    FROM HoaDon hd
)
SELECT DISTINCT
    KhungGio,
    -- Window Function 1: Đếm số lượng order theo từng khung giờ (PARTITION BY KhungGio)
    COUNT(MaHoaDon) OVER (PARTITION BY KhungGio) AS SoLuongOrder,

    -- Window Function 2: Tính tổng doanh thu theo từng khung giờ (PARTITION BY KhungGio)
    SUM(TongTien) OVER (PARTITION BY KhungGio) AS TongDoanhThuKhungGio,

    -- Window Function 3: Doanh thu trung bình trên mỗi hóa đơn trong khung giờ
    ROUND(AVG(TongTien) OVER (PARTITION BY KhungGio), 0) AS DoanhThuTrungBinhMoiOrder,

    -- Window Function 4: Tỷ lệ % đóng góp doanh thu của khung giờ trên toàn bộ hệ thống
    ROUND(
        SUM(TongTien) OVER (PARTITION BY KhungGio) * 100.0 / SUM(TongTien) OVER (),
        2
    ) AS PhanTramDongGopDoanhThu,

    -- Window Function 5: Xếp hạng khung giờ cao điểm theo doanh thu
    DENSE_RANK() OVER (
        ORDER BY SUM(TongTien) OVER (PARTITION BY KhungGio) DESC
    ) AS XepHangCaoDiem
FROM DuLieuKhungGio
ORDER BY XepHangCaoDiem ASC;
