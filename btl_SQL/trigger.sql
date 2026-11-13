-- Active: 1794498072386@@127.0.0.1@3306@QuanLyNhaHang
DELIMITER / /

CREATE TRIGGER trg_CapNhatTrangThaiBan_AfterOrder
AFTER INSERT ON DonOrder
FOR EACH ROW
BEGIN
    UPDATE BanAn
    SET TrangThai = 'DangPhucVu'
    WHERE MaBan = NEW.MaBan;
END //

DELIMITER;

DELIMITER / /

CREATE TRIGGER trg_TruTonKho_KhiHoanThanhMon
AFTER UPDATE ON ChiTietOrder
FOR EACH ROW
BEGIN
    -- Chỉ thực hiện trừ kho khi trạng thái vừa chuyển sang 'HoanThanhMon'
    IF NEW.TrangThaiBep = 'HoanThanhMon' AND OLD.TrangThaiBep <> 'HoanThanhMon' THEN
        UPDATE KhoNguyenLieu knl
        INNER JOIN (
            -- Lấy chi nhánh của order hiện tại
            SELECT b.MaChiNhanh
            FROM DonOrder o
            JOIN BanAn b ON o.MaBan = b.MaBan
            WHERE o.MaOrder = NEW.MaOrder
        ) cn ON knl.MaChiNhanh = cn.MaChiNhanh
        INNER JOIN DinhLuongMon dlm ON dlm.MaNguyenLieu = knl.MaNguyenLieu
        SET knl.SoLuongTon = knl.SoLuongTon - (dlm.SoLuongDinhLuong * NEW.SoLuong)
        WHERE dlm.MaMonAn = NEW.MaMonAn;
    END IF;
END //

DELIMITER;