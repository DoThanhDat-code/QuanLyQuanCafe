
USE QuanLyQuanCafe;
GO

-- =========================================
-- 1. THEM 12 BAN
-- =========================================
INSERT INTO dbo.[tables]
(table_id, table_name, seats, status)
SELECT v.id, v.name, v.seats, 'available'
FROM (VALUES
    ('B01', N'Bàn 01', 4),
    ('B02', N'Bàn 02', 4),
    ('B03', N'Bàn 03', 4),
    ('B04', N'Bàn 04', 4),
    ('B05', N'Bàn 05', 4),
    ('B06', N'Bàn 06', 4),
    ('B07', N'Bàn 07', 2),
    ('B08', N'Bàn 08', 2),
    ('B09', N'Bàn 09', 6),
    ('B10', N'Bàn 10', 6),
    ('B11', N'Bàn 11', 8),
    ('B12', N'Bàn 12', 8)
) AS v(id, name, seats)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.[tables] t
    WHERE t.table_id = v.id
);
GO

-- =========================================
-- 2. THEM 4 DANH MUC
-- =========================================
INSERT INTO dbo.categories
(category_id, category_name)
SELECT v.id, v.name
FROM (VALUES
    ('C01', N'Cà phê'),
    ('C02', N'Trà & trái cây'),
    ('C03', N'Đồ xay'),
    ('C04', N'Bánh ngọt')
) AS v(id, name)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.categories c
    WHERE c.category_id = v.id
);
GO

-- =========================================
-- 3. THEM 15 SAN PHAM
-- =========================================
INSERT INTO dbo.products
(product_id, product_name, category_id, price)
SELECT v.id, v.name, v.category_id, v.price
FROM (VALUES
    ('P01', N'Cà phê sữa đá', 'C01', 29000),
    ('P02', N'Bạc xỉu', 'C01', 35000),
    ('P03', N'Cappuccino', 'C01', 45000),
    ('P04', N'Latte caramel', 'C01', 49000),
    ('P05', N'Espresso', 'C01', 32000),

    ('P06', N'Trà đào cam sả', 'C02', 42000),
    ('P07', N'Trà vải', 'C02', 42000),
    ('P08', N'Trà chanh mật ong', 'C02', 35000),
    ('P09', N'Trà dâu', 'C02', 45000),

    ('P10', N'Matcha đá xay', 'C03', 49000),
    ('P11', N'Chocolate đá xay', 'C03', 52000),
    ('P12', N'Cookies đá xay', 'C03', 55000),

    ('P13', N'Tiramisu', 'C04', 45000),
    ('P14', N'Croissant bơ', 'C04', 32000),
    ('P15', N'Bánh phô mai', 'C04', 44000)
) AS v(id, name, category_id, price)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.products p
    WHERE p.product_id = v.id
);
GO

-- =========================================
-- 4. THEM 4 NHAN VIEN
-- =========================================
INSERT INTO dbo.employees
(employee_id, full_name, position)
SELECT v.id, v.name, v.position
FROM (VALUES
    ('NV01', N'Nguyễn Văn Minh', N'Quản lý'),
    ('NV02', N'Trần Thị Lan', N'Phục vụ'),
    ('NV03', N'Lê Văn Hùng', N'Thu ngân'),
    ('NV04', N'Phạm Thị Hoa', N'Nhân viên kho')
) AS v(id, name, position)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.employees e
    WHERE e.employee_id = v.id
);
GO

-- =========================================
-- 5. THEM 6 NGUYEN LIEU
-- =========================================
INSERT INTO dbo.materials
(material_id, material_name, unit,
 quantity, min_quantity)
SELECT v.id, v.name, v.unit,
       v.quantity, v.min_quantity
FROM (VALUES
    ('NL01', N'Cà phê hạt', N'kg', 20.00, 5.00),
    ('NL02', N'Sữa đặc', N'hộp', 50.00, 10.00),
    ('NL03', N'Sữa tươi', N'lít', 30.00, 5.00),
    ('NL04', N'Đường', N'kg', 25.00, 5.00),
    ('NL05', N'Trà', N'kg', 10.00, 2.00),
    ('NL06', N'Bột matcha', N'kg', 8.00, 2.00)
) AS v(id, name, unit, quantity, min_quantity)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.materials m
    WHERE m.material_id = v.id
);
GO

-- =========================================
-- 6. KIEM TRA DU LIEU
-- =========================================
SELECT 'Ban' AS NhomDuLieu, COUNT(*) AS SoLuong
FROM dbo.[tables]

UNION ALL

SELECT 'Danh muc', COUNT(*)
FROM dbo.categories

UNION ALL

SELECT 'San pham', COUNT(*)
FROM dbo.products

UNION ALL

SELECT 'Nhan vien', COUNT(*)
FROM dbo.employees

UNION ALL

SELECT 'Nguyen lieu', COUNT(*)
FROM dbo.materials;
GO
