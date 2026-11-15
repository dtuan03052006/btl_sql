-- Active: 1794498072386@@127.0.0.1@3306@QuanLyNhaHang
-- Active: 1794498072386@@127.0.0.1@3306@mysql

-- Tìm các món ăn thuộc nhóm "Hải sản" đang tạm ngưng phục vụ (do hết nguyên liệu)
SELECT m.MaMonAn, m.TenMon, m.DonGiaMon, m.TrangThaiPhucVu
FROM MonAn m
    JOIN NhomThucDon n ON m.MaNhom = n.MaNhom
WHERE
    n.TenNhom = 'Hải sản'
    AND m.TrangThaiPhucVu = 'TamNgung';

-- In chi tiết hóa đơn bao gồm tên món, số lượng, đơn giá và tổng tiền cho bàn số 5.
SELECT hd.MaHoaDon, b.SoBan, m.TenMon, cthd.SoLuong, cthd.DonGiaBan AS DonGia, cthd.ThanhTien AS TongTienMon
FROM
    HoaDon hd
    INNER JOIN DonOrder od ON hd.MaOrder = od.MaOrder
    INNER JOIN BanAn b ON od.MaBan = b.MaBan
    INNER JOIN ChiTietHoaDon cthd ON hd.MaHoaDon = cthd.MaHoaDon
    INNER JOIN MonAn m ON cthd.MaMonAn = m.MaMonAn
WHERE
    b.SoBan = 5;

-- Thống kê doanh thu trung bình mỗi ngày theo từng chi nhánh trong tháng 10.
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
WHERE
    MONTH(hd.ThoiGianLap) = 10
    AND YEAR(hd.ThoiGianLap) = 2026
GROUP BY
    cn.MaChiNhanh,
    cn.TenChiNhanh;

-- Tìm các món ăn có số lượng bán ra trong tháng < 10 phần (món bán chậm cần loại khỏi menu).
SELECT m.MaMonAn, m.TenMon, n.TenNhom, COALESCE(SUM(cthd.SoLuong), 0) AS TongSoLuongBan
FROM
    MonAn m
    INNER JOIN NhomThucDon n ON m.MaNhom = n.MaNhom
    INNER JOIN ChiTietHoaDon cthd ON m.MaMonAn = cthd.MaMonAn
    INNER JOIN HoaDon hd ON cthd.MaHoaDon = hd.MaHoaDon
WHERE
    MONTH(hd.ThoiGianLap) = 10
    AND YEAR(hd.ThoiGianLap) = 2026
GROUP BY
    m.MaMonAn,
    m.TenMon,
    n.TenNhom
HAVING
    SUM(cthd.SoLuong) < 10;

-- Liệt kê tất cả các món ăn trong menu và số lần xuất hiện trên hóa đơn (bao gồm cả món mới chưa ai gọi bao giờ).
SELECT
    m.MaMonAn,
    m.TenMon,
    n.TenNhom,
    COUNT(cthd.MaHoaDon) AS SoLanXuatHienTrenHoaDon
FROM
    MonAn m
    INNER JOIN NhomThucDon n ON m.MaNhom = n.MaNhom
    LEFT OUTER JOIN ChiTietHoaDon cthd ON m.MaMonAn = cthd.MaMonAn
GROUP BY
    m.MaMonAn,
    m.TenMon,
    n.TenNhom
ORDER BY SoLanXuatHienTrenHoaDon ASC;

-- Tìm nguyên liệu có lượng tiêu thụ trong ngày vượt quá mức tiêu thụ trung bình của tất cả nguyên liệu.
SELECT nl.MaNguyenLieu, nl.TenNguyenLieu, nl.DonViTinh, tieu_thu.TongLuongDung
FROM NguyenLieu nl
    INNER JOIN (
        -- Tính tổng tiêu thụ của từng nguyên liệu trong ngày 2026-10-15
        SELECT dlm.MaNguyenLieu, SUM(
                dlm.SoLuongDinhLuong * cto.SoLuong
            ) AS TongLuongDung
        FROM
            ChiTietOrder cto
            INNER JOIN DinhLuongMon dlm ON cto.MaMonAn = dlm.MaMonAn
        WHERE
            DATE(cto.ThoiGianGoiMon) = '2026-10-15'
            AND cto.TrangThaiBep = 'HoanThanhMon'
        GROUP BY
            dlm.MaNguyenLieu
    ) tieu_thu ON nl.MaNguyenLieu = tieu_thu.MaNguyenLieu
WHERE
    tieu_thu.TongLuongDung > (
        -- Subquery tương quan / tổng quát: Tính mức tiêu thụ trung bình của tất cả nguyên liệu trong ngày đó
        SELECT AVG(tong_tung_loai)
        FROM (
                SELECT SUM(
                        dlm2.SoLuongDinhLuong * cto2.SoLuong
                    ) AS tong_tung_loai
                FROM
                    ChiTietOrder cto2
                    INNER JOIN DinhLuongMon dlm2 ON cto2.MaMonAn = dlm2.MaMonAn
                WHERE
                    DATE(cto2.ThoiGianGoiMon) = '2026-10-15'
                    AND cto2.TrangThaiBep = 'HoanThanhMon'
                GROUP BY
                    dlm2.MaNguyenLieu
            ) bang_tb
    );

-- Tìm chi nhánh có doanh thu bán món đồ uống cao nhất toàn hệ thống.
SELECT cn.MaChiNhanh, cn.TenChiNhanh, SUM(cthd.ThanhTien) AS DoanhThuDoUong
FROM
    ChiNhanh cn
    JOIN HoaDon hd ON cn.MaChiNhanh = hd.MaChiNhanh
    JOIN ChiTietHoaDon cthd ON hd.MaHoaDon = cthd.MaHoaDon
    JOIN MonAn m ON cthd.MaMonAn = m.MaMonAn
    JOIN NhomThucDon n ON m.MaNhom = n.MaNhom
WHERE
    n.TenNhom = 'Đồ uống'
GROUP BY
    cn.MaChiNhanh,
    cn.TenChiNhanh
HAVING
    SUM(cthd.ThanhTien) >= ALL (
        -- Subquery: Lấy toàn bộ doanh thu đồ uống của các chi nhánh để so sánh >= ALL (hoặc dùng MAX)
        SELECT SUM(cthd2.ThanhTien)
        FROM
            HoaDon hd2
            JOIN ChiTietHoaDon cthd2 ON hd2.MaHoaDon = cthd2.MaHoaDon
            JOIN MonAn m2 ON cthd2.MaMonAn = m2.MaMonAn
            JOIN NhomThucDon n2 ON m2.MaNhom = n2.MaNhom
        WHERE
            n2.TenNhom = 'Đồ uống'
        GROUP BY
            hd2.MaChiNhanh
    );