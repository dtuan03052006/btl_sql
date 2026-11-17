

USE QuanLyNhaHang;


DROP TRIGGER IF EXISTS trg_CapNhatTrangThaiBan_AfterOrder;
DROP TRIGGER IF EXISTS trg_KiemTraTonKho_TruocKhiHoanThanh;
DROP TRIGGER IF EXISTS trg_TruTonKho_KhiHoanThanhMon;

DROP TRIGGER IF EXISTS trg_Check_SoLuongKhach_DonOrder_Insert;
DROP TRIGGER IF EXISTS trg_Check_SoLuongKhach_DonOrder_Update;
DROP TRIGGER IF EXISTS trg_Check_SoLuongKhach_DatBan_Insert;
DROP TRIGGER IF EXISTS trg_Check_SoLuongKhach_DatBan_Update;

DROP TRIGGER IF EXISTS trg_Check_DonGiaMon_Insert;
DROP TRIGGER IF EXISTS trg_Check_DonGiaMon_Update;

DROP TRIGGER IF EXISTS trg_Check_SoLuongTonKho_Insert;
DROP TRIGGER IF EXISTS trg_Check_SoLuongTonKho_Update;

DROP TRIGGER IF EXISTS trg_Unique_ChiTietHoaDon_Insert;
DROP TRIGGER IF EXISTS trg_Unique_ChiTietHoaDon_Update;



DELIMITER $$

CREATE TRIGGER trg_CapNhatTrangThaiBan_AfterOrder
AFTER INSERT ON DonOrder
FOR EACH ROW
BEGIN
    UPDATE BanAn
    SET TrangThai = 'DangPhucVu'
    WHERE MaBan = NEW.MaBan;
END$$

DELIMITER ;


DELIMITER $$

CREATE TRIGGER trg_KiemTraTonKho_TruocKhiHoanThanh
BEFORE UPDATE ON ChiTietOrder
FOR EACH ROW
BEGIN
    DECLARE v_MaChiNhanh VARCHAR(10);
    DECLARE v_SoNguyenLieuThieu INT DEFAULT 0;

    -- Chỉ kiểm tra khi trạng thái chuyển sang 'HoanThanhMon'
    IF NEW.TrangThaiBep = 'HoanThanhMon' AND (OLD.TrangThaiBep IS NULL OR OLD.TrangThaiBep <> 'HoanThanhMon') THEN
        
        -- 1. Xác định chi nhánh của order hiện tại thông qua BanAn
        SELECT b.MaChiNhanh INTO v_MaChiNhanh
        FROM DonOrder o
        JOIN BanAn b ON o.MaBan = b.MaBan
        WHERE o.MaOrder = NEW.MaOrder
        LIMIT 1;

        -- 2. Kiểm tra các nguyên liệu theo định lượng có đủ trong kho chi nhánh hay không
        SELECT COUNT(*) INTO v_SoNguyenLieuThieu
        FROM DinhLuongMon dlm
        LEFT JOIN KhoNguyenLieu knl 
            ON knl.MaNguyenLieu = dlm.MaNguyenLieu AND knl.MaChiNhanh = v_MaChiNhanh
        WHERE dlm.MaMonAn = NEW.MaMonAn
          AND (knl.SoLuongTon IS NULL OR knl.SoLuongTon < (dlm.SoLuongDinhLuong * NEW.SoLuong));

        -- 3. Nếu thiếu nguyên liệu -> Bắn lỗi hủy giao dịch
        IF v_SoNguyenLieuThieu > 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Lỗi nghiệp vụ Bếp: Kho nguyên liệu tại chi nhánh không đủ số lượng để hoàn thành món!';
        END IF;

    END IF;
END$$

DELIMITER ;



DELIMITER $$

CREATE TRIGGER trg_TruTonKho_KhiHoanThanhMon
AFTER UPDATE ON ChiTietOrder
FOR EACH ROW
BEGIN
    -- Chỉ thực hiện trừ kho khi trạng thái vừa chuyển sang 'HoanThanhMon'
    IF NEW.TrangThaiBep = 'HoanThanhMon' AND (OLD.TrangThaiBep IS NULL OR OLD.TrangThaiBep <> 'HoanThanhMon') THEN
        
        UPDATE KhoNguyenLieu knl
        INNER JOIN (
            -- Lấy chi nhánh của order hiện tại
            SELECT b.MaChiNhanh
            FROM DonOrder o
            JOIN BanAn b ON o.MaBan = b.MaBan
            WHERE o.MaOrder = NEW.MaOrder
            LIMIT 1
        ) cn ON knl.MaChiNhanh = cn.MaChiNhanh
        INNER JOIN DinhLuongMon dlm ON dlm.MaNguyenLieu = knl.MaNguyenLieu
        SET knl.SoLuongTon = knl.SoLuongTon - (dlm.SoLuongDinhLuong * NEW.SoLuong)
        WHERE dlm.MaMonAn = NEW.MaMonAn;

    END IF;
END$$

DELIMITER ;




-- Kiểm tra trên bảng DonOrder (khi Thêm mới)
DELIMITER $$

CREATE TRIGGER trg_Check_SoLuongKhach_DonOrder_Insert
BEFORE INSERT ON DonOrder
FOR EACH ROW
BEGIN
    IF NEW.SoLuongKhach <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Lỗi ràng buộc CHECK: Số lượng khách trong đơn order phải lớn hơn 0 (SoLuongKhach > 0)!';
    END IF;
END$$

DELIMITER ;

-- Kiểm tra trên bảng DonOrder (khi Cập nhật)
DELIMITER $$

CREATE TRIGGER trg_Check_SoLuongKhach_DonOrder_Update
BEFORE UPDATE ON DonOrder
FOR EACH ROW
BEGIN
    IF NEW.SoLuongKhach <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Lỗi ràng buộc CHECK: Số lượng khách trong đơn order phải lớn hơn 0 (SoLuongKhach > 0)!';
    END IF;
END$$

DELIMITER ;

-- Kiểm tra trên bảng DatBan (khi Thêm mới)
DELIMITER $$

CREATE TRIGGER trg_Check_SoLuongKhach_DatBan_Insert
BEFORE INSERT ON DatBan
FOR EACH ROW
BEGIN
    IF NEW.SoLuongKhach <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Lỗi ràng buộc CHECK: Số lượng khách đặt bàn phải lớn hơn 0 (SoLuongKhach > 0)!';
    END IF;
END$$

DELIMITER ;

-- Kiểm tra trên bảng DatBan (khi Cập nhật)
DELIMITER $$

CREATE TRIGGER trg_Check_SoLuongKhach_DatBan_Update
BEFORE UPDATE ON DatBan
FOR EACH ROW
BEGIN
    IF NEW.SoLuongKhach <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Lỗi ràng buộc CHECK: Số lượng khách đặt bàn phải lớn hơn 0 (SoLuongKhach > 0)!';
    END IF;
END$$

DELIMITER ;




-- Kiểm tra khi Thêm mới Món ăn
DELIMITER $$

CREATE TRIGGER trg_Check_DonGiaMon_Insert
BEFORE INSERT ON MonAn
FOR EACH ROW
BEGIN
    IF NEW.DonGiaMon <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Lỗi ràng buộc CHECK: Đơn giá món ăn phải lớn hơn 0 (DonGiaMon > 0)!';
    END IF;
END$$

DELIMITER ;

-- Kiểm tra khi Cập nhật Món ăn
DELIMITER $$

CREATE TRIGGER trg_Check_DonGiaMon_Update
BEFORE UPDATE ON MonAn
FOR EACH ROW
BEGIN
    IF NEW.DonGiaMon <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Lỗi ràng buộc CHECK: Đơn giá món ăn phải lớn hơn 0 (DonGiaMon > 0)!';
    END IF;
END$$

DELIMITER ;




-- Kiểm tra khi Thêm mới Tồn kho
DELIMITER $$

CREATE TRIGGER trg_Check_SoLuongTonKho_Insert
BEFORE INSERT ON KhoNguyenLieu
FOR EACH ROW
BEGIN
    IF NEW.SoLuongTon < 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Lỗi ràng buộc CHECK: Số lượng tồn kho nguyên liệu không được âm (SoLuongTon >= 0)!';
    END IF;
END$$

DELIMITER ;

-- Kiểm tra khi Cập nhật Tồn kho
DELIMITER $$

CREATE TRIGGER trg_Check_SoLuongTonKho_Update
BEFORE UPDATE ON KhoNguyenLieu
FOR EACH ROW
BEGIN
    IF NEW.SoLuongTon < 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Lỗi ràng buộc CHECK: Số lượng tồn kho nguyên liệu không được âm (SoLuongTon >= 0)!';
    END IF;
END$$

DELIMITER ;



-- Kiểm tra khi Thêm mới Chi tiết Hóa đơn
DELIMITER $$

CREATE TRIGGER trg_Unique_ChiTietHoaDon_Insert
BEFORE INSERT ON ChiTietHoaDon
FOR EACH ROW
BEGIN
    DECLARE v_TonTai INT DEFAULT 0;

    SELECT COUNT(*) INTO v_TonTai
    FROM ChiTietHoaDon
    WHERE MaHoaDon = NEW.MaHoaDon AND MaMonAn = NEW.MaMonAn;

    IF v_TonTai > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Lỗi ràng buộc UNIQUE: Cặp (MaHoaDon, MaMonAn) đã tồn tại! Mỗi món ăn chỉ được có một dòng trong hóa đơn.';
    END IF;
END$$

DELIMITER ;

-- Kiểm tra khi Cập nhật Chi tiết Hóa đơn
DELIMITER $$

CREATE TRIGGER trg_Unique_ChiTietHoaDon_Update
BEFORE UPDATE ON ChiTietHoaDon
FOR EACH ROW
BEGIN
    DECLARE v_TonTai INT DEFAULT 0;

    SELECT COUNT(*) INTO v_TonTai
    FROM ChiTietHoaDon
    WHERE MaHoaDon = NEW.MaHoaDon 
      AND MaMonAn = NEW.MaMonAn 
      AND MaChiTietHD <> NEW.MaChiTietHD;

    IF v_TonTai > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Lỗi ràng buộc UNIQUE: Trùng lặp (MaHoaDon, MaMonAn) với một dòng khác trong cùng hóa đơn!';
    END IF;
END$$

DELIMITER ;


-- =================================================================================
-- PHẦN III: KỊCH BẢN KIỂM THỬ MẪU (TEST SCRIPTS)
-- =================================================================================
/*
-- 1. Test CHECK SoLuongKhach > 0 (Sẽ báo lỗi nếu <= 0)
INSERT INTO DonOrder (MaOrder, MaBan, ThoiGianOrder, SoLuongKhach, TrangThaiOrder)
VALUES ('OD_TEST_01', 'B01', NOW(), 0, 'DangXuLy');

-- 2. Test CHECK DonGiaMon > 0 (Sẽ báo lỗi nếu <= 0)
INSERT INTO MonAn (MaMonAn, TenMon, MaNhom, DonGiaMon, TrangThaiPhucVu)
VALUES ('M_TEST', 'Món Test Lỗi', 'N01', -50000, 'DangPhucVu');

-- 3. Test UNIQUE (MaHoaDon, MaMonAn) trong ChiTietHoaDon (Sẽ báo lỗi khi trùng lặp)
-- Giả sử HD001 đã có món MA01:
INSERT INTO ChiTietHoaDon (MaHoaDon, MaMonAn, SoLuong, DonGiaBan, ThanhTien)
VALUES ('HD001', 'MA01', 2, 85000, 170000);

-- 4. Test Business Rule: Trạng thái bàn tự đổi sang 'DangPhucVu' khi tạo order
-- Kiểm tra trạng thái bàn trước khi order:
SELECT MaBan, TrangThai FROM BanAn WHERE MaBan = 'B02';
-- Tạo đơn order mới:
INSERT INTO DonOrder (MaOrder, MaBan, ThoiGianOrder, SoLuongKhach, TrangThaiOrder)
VALUES ('OD_TEST_02', 'B02', NOW(), 4, 'DangXuLy');
-- Kiểm tra lại trạng thái bàn (Đã thành 'DangPhucVu'):
SELECT MaBan, TrangThai FROM BanAn WHERE MaBan = 'B02';

-- 5. Test Business Rule: Trừ kho nguyên liệu khi Bếp xác nhận 'HoanThanhMon'
-- Xem tồn kho nguyên liệu trước khi hoàn thành món:
SELECT knl.* FROM KhoNguyenLieu knl
JOIN BanAn b ON knl.MaChiNhanh = b.MaChiNhanh
JOIN DonOrder o ON o.MaBan = b.MaBan
WHERE o.MaOrder = 'OD_TEST_02';
-- Bếp chuyển trạng thái món sang HoanThanhMon:
UPDATE ChiTietOrder 
SET TrangThaiBep = 'HoanThanhMon' 
WHERE MaChiTietOrder = 1;
-- Xem lại tồn kho (Đã được trừ tự động theo định lượng):
SELECT knl.* FROM KhoNguyenLieu knl
JOIN BanAn b ON knl.MaChiNhanh = b.MaChiNhanh
JOIN DonOrder o ON o.MaBan = b.MaBan
WHERE o.MaOrder = 'OD_TEST_02';
*/
