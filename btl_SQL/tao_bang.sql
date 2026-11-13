-- Active: 1794498072386@@127.0.0.1@3306@QuanLyNhaHang
USE QuanLyNhaHang;

-- 1. Bảng Chi nhánh
CREATE TABLE ChiNhanh (
    MaChiNhanh VARCHAR(10) PRIMARY KEY,
    TenChiNhanh NVARCHAR (100) NOT NULL,
    DiaChi NVARCHAR (255) NOT NULL,
    SoDienThoai VARCHAR(15)
);

-- 2. Bảng Bàn ăn
CREATE TABLE BanAn (
    MaBan VARCHAR(10) PRIMARY KEY,
    SoBan INT NOT NULL,
    MaChiNhanh VARCHAR(10) NOT NULL,
    SucChua INT DEFAULT 4,
    TrangThai NVARCHAR (30) DEFAULT 'Trong', -- 'Trong', 'DangPhucVu', 'DaDat'
    FOREIGN KEY (MaChiNhanh) REFERENCES ChiNhanh (MaChiNhanh)
);

-- 3. Bảng Nhóm thực đơn
CREATE TABLE NhomThucDon (
    MaNhom VARCHAR(10) PRIMARY KEY,
    TenNhom NVARCHAR (50) NOT NULL -- 'Khai vị', 'Món chính', 'Đồ uống', 'Hải sản',...
);

-- 4. Bảng Món ăn
CREATE TABLE MonAn (
    MaMonAn VARCHAR(10) PRIMARY KEY,
    TenMon NVARCHAR (100) NOT NULL,
    MaNhom VARCHAR(10) NOT NULL,
    DonGiaMon DECIMAL(12, 2) NOT NULL,
    TrangThaiPhucVu NVARCHAR (30) DEFAULT 'DangPhucVu', -- 'DangPhucVu', 'TamNgung'
    CONSTRAINT CHK_DonGiaMon CHECK (DonGiaMon > 0),
    FOREIGN KEY (MaNhom) REFERENCES NhomThucDon (MaNhom)
);

-- 5. Bảng Nguyên liệu
CREATE TABLE NguyenLieu (
    MaNguyenLieu VARCHAR(10) PRIMARY KEY,
    TenNguyenLieu NVARCHAR (100) NOT NULL,
    DonViTinh NVARCHAR (20) NOT NULL -- 'kg', 'gram', 'lit', 'lon',...
);

-- 6. Kho nguyên liệu tại từng chi nhánh
CREATE TABLE KhoNguyenLieu (
    MaChiNhanh VARCHAR(10) NOT NULL,
    MaNguyenLieu VARCHAR(10) NOT NULL,
    SoLuongTon DECIMAL(10, 2) DEFAULT 0,
    PRIMARY KEY (MaChiNhanh, MaNguyenLieu),
    CONSTRAINT CHK_SoLuongTonKho CHECK (SoLuongTon >= 0),
    FOREIGN KEY (MaChiNhanh) REFERENCES ChiNhanh (MaChiNhanh),
    FOREIGN KEY (MaNguyenLieu) REFERENCES NguyenLieu (MaNguyenLieu)
);

-- 7. Định lượng nguyên liệu cho món ăn (BOM)
CREATE TABLE DinhLuongMon (
    MaMonAn VARCHAR(10) NOT NULL,
    MaNguyenLieu VARCHAR(10) NOT NULL,
    SoLuongDinhLuong DECIMAL(8, 2) NOT NULL, -- Số lượng nguyên liệu cần cho 1 phần ăn
    PRIMARY KEY (MaMonAn, MaNguyenLieu),
    FOREIGN KEY (MaMonAn) REFERENCES MonAn (MaMonAn),
    FOREIGN KEY (MaNguyenLieu) REFERENCES NguyenLieu (MaNguyenLieu)
);

-- 8. Bảng Đặt bàn trước
CREATE TABLE DatBan (
    MaDatBan VARCHAR(10) PRIMARY KEY,
    MaBan VARCHAR(10) NOT NULL,
    TenKhachHang NVARCHAR (100) NOT NULL,
    SoDienThoai VARCHAR(15) NOT NULL,
    ThoiGianDat DATETIME NOT NULL,
    SoLuongKhach INT NOT NULL,
    TrangThai NVARCHAR (30) DEFAULT 'ChuaNhan',
    CONSTRAINT CHK_SoLuongKhachDat CHECK (SoLuongKhach > 0),
    FOREIGN KEY (MaBan) REFERENCES BanAn (MaBan)
);

-- 9. Bảng Order gọi món tại bàn
CREATE TABLE DonOrder (
    MaOrder VARCHAR(10) PRIMARY KEY,
    MaBan VARCHAR(10) NOT NULL,
    ThoiGianOrder DATETIME NOT NULL,
    SoLuongKhach INT NOT NULL,
    TrangThaiOrder NVARCHAR (30) DEFAULT 'DangXuLy', -- 'DangXuLy', 'DaThanhToan', 'DaHuy'
    CONSTRAINT CHK_SoLuongKhachOrder CHECK (SoLuongKhach > 0),
    FOREIGN KEY (MaBan) REFERENCES BanAn (MaBan)
);

-- 10. Chi tiết các món Order (Bếp / Bar nhận diện real-time)
CREATE TABLE ChiTietOrder (
    MaChiTietOrder INT AUTO_INCREMENT PRIMARY KEY, -- Hoặc IDENTITY(1,1) trong SQL Server
    MaOrder VARCHAR(10) NOT NULL,
    MaMonAn VARCHAR(10) NOT NULL,
    SoLuong INT NOT NULL DEFAULT 1,
    TrangThaiBep NVARCHAR (30) DEFAULT 'ChoXuLy', -- 'ChoXuLy', 'DangCheBien', 'HoanThanhMon'
    ThoiGianGoiMon DATETIME NOT NULL,
    CONSTRAINT CHK_SoLuongOrderMon CHECK (SoLuong > 0),
    FOREIGN KEY (MaOrder) REFERENCES DonOrder (MaOrder),
    FOREIGN KEY (MaMonAn) REFERENCES MonAn (MaMonAn)
);

-- 11. Bảng Hóa đơn thanh toán
CREATE TABLE HoaDon (
    MaHoaDon VARCHAR(10) PRIMARY KEY,
    MaOrder VARCHAR(10) NOT NULL UNIQUE,
    MaChiNhanh VARCHAR(10) NOT NULL,
    ThoiGianLap DATETIME NOT NULL,
    TongTien DECIMAL(14, 2) DEFAULT 0,
    PhuongThucThanhToan NVARCHAR (30) DEFAULT 'TienMat',
    FOREIGN KEY (MaOrder) REFERENCES DonOrder (MaOrder),
    FOREIGN KEY (MaChiNhanh) REFERENCES ChiNhanh (MaChiNhanh)
);

-- 12. Chi tiết Hóa đơn (Chứa Ràng buộc UNIQUE theo yêu cầu)
CREATE TABLE ChiTietHoaDon (
    MaChiTietHD INT AUTO_INCREMENT PRIMARY KEY, -- Hoặc IDENTITY(1,1)
    MaHoaDon VARCHAR(10) NOT NULL,
    MaMonAn VARCHAR(10) NOT NULL,
    SoLuong INT NOT NULL,
    DonGiaBan DECIMAL(12, 2) NOT NULL,
    ThanhTien DECIMAL(14, 2) NOT NULL,
    -- Ràng buộc UNIQUE: Mỗi món chỉ xuất hiện duy nhất 1 dòng trong 1 hóa đơn
    CONSTRAINT UQ_HoaDon_MonAn UNIQUE (MaHoaDon, MaMonAn),
    CONSTRAINT CHK_SoLuongBan CHECK (SoLuong > 0),
    FOREIGN KEY (MaHoaDon) REFERENCES HoaDon (MaHoaDon),
    FOREIGN KEY (MaMonAn) REFERENCES MonAn (MaMonAn)
);
