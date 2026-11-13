
const express = require("express");
const { sql, connectDB } = require("../config/db");

const router = express.Router();

// ============================================
// KIEM TRA QUYEN QUAN LY SAN PHAM
// ============================================

function requireManager(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: "Vui lòng đăng nhập"
    });
  }

  const role = String(req.user.role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  const allowedRoles = [
    "admin",
    "manager",
    "product_manager"
  ];

  if (!allowedRoles.includes(role)) {
    return res.status(403).json({
      error: "Bạn không có quyền quản lý sản phẩm"
    });
  }

  next();
}

// ============================================
// CAC TRUONG DU LIEU SAN PHAM
// ============================================

const productFields = `
  p.product_id,
  p.product_name,
  p.category_id,
  c.category_name,
  p.price,
  p.image_url,
  p.description,
  p.is_available,
  p.is_available AS is_active,
  c.is_active AS category_active
`;

// ============================================
// 1. HIEN THI, TIM KIEM VA LOC SAN PHAM
// GET /api/products
// ============================================

router.get("/", async (req, res) => {
  try {
    const pool = await connectDB();

    const search = String(
      req.query.search || ""
    ).trim().slice(0, 100);

    const category = String(
      req.query.category_id ||
      req.query.category ||
      ""
    ).trim();

    const availableOnly =
      req.query.available === "1";

    if (category.length > 10) {
      return res.status(400).json({
        error: "Mã danh mục không hợp lệ"
      });
    }

    const result = await pool.request()
      .input(
        "search",
        sql.NVarChar(102),
        `%${search}%`
      )
      .input(
        "category",
        sql.VarChar(10),
        category
      )
      .input(
        "availableOnly",
        sql.Bit,
        availableOnly
      )
      .query(`
        SELECT ${productFields}
        FROM dbo.products p
        INNER JOIN dbo.categories c
          ON p.category_id = c.category_id

        WHERE (
          p.product_name LIKE @search
          OR p.product_id LIKE @search
        )

        AND (
          @category = ''
          OR p.category_id = @category
        )

        AND (
          @availableOnly = 0
          OR (
            p.is_available = 1
            AND c.is_active = 1
          )
        )

        ORDER BY p.product_id
      `);

    res.json(result.recordset);

  } catch (error) {
    console.error("Loi lay san pham:", error);

    res.status(500).json({
      error: "Không thể lấy danh sách sản phẩm"
    });
  }
});

// ============================================
// 2. LAY MENU CHO NHAN VIEN PHUC VU
// GET /api/products/menu
// ============================================

router.get("/menu", async (req, res) => {
  try {
    const pool = await connectDB();

    const result = await pool.request().query(`
      SELECT ${productFields}

      FROM dbo.products p

      INNER JOIN dbo.categories c
        ON p.category_id = c.category_id

      WHERE p.is_available = 1
        AND c.is_active = 1

      ORDER BY c.category_name,
               p.product_name
    `);

    res.json(result.recordset);

  } catch (error) {
    console.error("Loi lay menu:", error);

    res.status(500).json({
      error: "Không thể tải thực đơn"
    });
  }
});

// ============================================
// 3. LAY CHI TIET SAN PHAM
// GET /api/products/:id
// ============================================

router.get("/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();

    if (!id || id.length > 10) {
      return res.status(400).json({
        error: "Mã sản phẩm không hợp lệ"
      });
    }

    const pool = await connectDB();

    const result = await pool.request()
      .input("id", sql.VarChar(10), id)
      .query(`
        SELECT ${productFields}

        FROM dbo.products p

        INNER JOIN dbo.categories c
          ON p.category_id = c.category_id

        WHERE p.product_id = @id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        error: "Không tìm thấy sản phẩm"
      });
    }

    res.json(result.recordset[0]);

  } catch (error) {
    console.error("Loi chi tiet san pham:", error);

    res.status(500).json({
      error: "Không thể lấy thông tin sản phẩm"
    });
  }
});

// ============================================
// HAM KIEM TRA DU LIEU SAN PHAM
// ============================================

function validateProduct(data) {
  const name = String(
    data.product_name || ""
  ).trim();

  const category = String(
    data.category_id || ""
  ).trim();

  const price = Number(data.price);

  const image = String(
    data.image_url || ""
  ).trim();

  const description = String(
    data.description || ""
  ).trim();

  const available =
    data.is_available ??
    data.is_active ??
    true;

  if (!name || name.length > 100) {
    throw new Error(
      "Tên sản phẩm không hợp lệ"
    );
  }

  if (!category || category.length > 10) {
    throw new Error(
      "Danh mục không hợp lệ"
    );
  }

  if (
    data.price === null ||
    data.price === undefined ||
    data.price === "" ||
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    price > 999999999999
  ) {
    throw new Error(
      "Giá sản phẩm phải lớn hơn 0 và là số nguyên hợp lệ"
    );
  }

  if (image.length > 1000) {
    throw new Error(
      "Đường dẫn hình ảnh quá dài"
    );
  }

  if (
    image &&
    !/^https?:\/\//i.test(image)
  ) {
    throw new Error(
      "Đường dẫn ảnh phải bắt đầu bằng http:// hoặc https://"
    );
  }

  if (description.length > 1000) {
    throw new Error(
      "Mô tả không được vượt quá 1000 ký tự"
    );
  }

  if (typeof available !== "boolean") {
    throw new Error(
      "Trạng thái sản phẩm không hợp lệ"
    );
  }

  return {
    name,
    category,
    price,
    image,
    description,
    available
  };
}

// ============================================
// 4. THEM SAN PHAM
// POST /api/products
// ============================================

router.post("/", requireManager, async (req, res) => {
  try {
    const id = String(
      req.body.product_id || ""
    ).trim();

    if (!id || id.length > 10) {
      return res.status(400).json({
        error: "Mã sản phẩm không hợp lệ"
      });
    }

    let data;

    try {
      data = validateProduct(req.body);
    } catch (error) {
      return res.status(400).json({
        error: error.message
      });
    }

    const pool = await connectDB();

    // KIEM TRA TRUNG MA SAN PHAM
    const existing = await pool.request()
      .input("id", sql.VarChar(10), id)
      .query(`
        SELECT product_id
        FROM dbo.products
        WHERE product_id = @id
      `);

    if (existing.recordset.length > 0) {
      return res.status(409).json({
        error: "Mã sản phẩm đã tồn tại"
      });
    }

    // THEM SAN PHAM NEU DANH MUC DANG HOAT DONG
    const result = await pool.request()

      .input("id", sql.VarChar(10), id)

      .input(
        "name",
        sql.NVarChar(100),
        data.name
      )

      .input(
        "category",
        sql.VarChar(10),
        data.category
      )

      .input(
        "price",
        sql.Decimal(12, 0),
        data.price
      )

      .input(
        "image",
        sql.NVarChar(1000),
        data.image
      )

      .input(
        "description",
        sql.NVarChar(1000),
        data.description
      )

      .input(
        "available",
        sql.Bit,
        data.available
      )

      .query(`
        INSERT INTO dbo.products (
          product_id,
          product_name,
          category_id,
          price,
          image_url,
          description,
          is_active,
          is_available
        )

        SELECT
          @id,
          @name,
          @category,
          @price,
          @image,
          @description,
          @available,
          @available

        FROM dbo.categories

        WHERE category_id = @category
          AND is_active = 1
      `);

    if (!result.rowsAffected[0]) {
      return res.status(400).json({
        error: "Danh mục không tồn tại hoặc đã bị ẩn"
      });
    }

    res.status(201).json({
      message: "Thêm sản phẩm thành công",
      product_id: id
    });

  } catch (error) {
    console.error("Loi them san pham:", error);

    if ([2601, 2627].includes(error.number)) {
      return res.status(409).json({
        error: "Sản phẩm đã tồn tại"
      });
    }

    res.status(500).json({
      error: "Không thể thêm sản phẩm"
    });
  }
});

// ============================================
// 5. SUA SAN PHAM
// PATCH /api/products/:id
// ============================================

async function updateProduct(req, res) {
  try {
    const id = String(
      req.params.id || ""
    ).trim();

    if (!id || id.length > 10) {
      return res.status(400).json({
        error: "Mã sản phẩm không hợp lệ"
      });
    }

    const pool = await connectDB();

    // LAY DU LIEU SAN PHAM CU
    const existing = await pool.request()
      .input("id", sql.VarChar(10), id)
      .query(`
        SELECT *
        FROM dbo.products
        WHERE product_id = @id
      `);

    if (!existing.recordset.length) {
      return res.status(404).json({
        error: "Không tìm thấy sản phẩm"
      });
    }

    // GOP DU LIEU CU VA DU LIEU MOI
    const merged = {
      ...existing.recordset[0],
      ...req.body
    };

    // TUONG THICH VOI FRONTEND CU
    if (
      req.body.is_available === undefined &&
      req.body.is_active !== undefined
    ) {
      merged.is_available = req.body.is_active;
    }

    let data;

    try {
      data = validateProduct(merged);
    } catch (error) {
      return res.status(400).json({
        error: error.message
      });
    }

    // CAP NHAT SAN PHAM
    const result = await pool.request()

      .input("id", sql.VarChar(10), id)

      .input(
        "name",
        sql.NVarChar(100),
        data.name
      )

      .input(
        "category",
        sql.VarChar(10),
        data.category
      )

      .input(
        "price",
        sql.Decimal(12, 0),
        data.price
      )

      .input(
        "image",
        sql.NVarChar(1000),
        data.image
      )

      .input(
        "description",
        sql.NVarChar(1000),
        data.description
      )

      .input(
        "available",
        sql.Bit,
        data.available
      )

      .query(`
        UPDATE p

        SET
          product_name = @name,
          category_id = @category,
          price = @price,
          image_url = @image,
          description = @description,
          is_active = @available,
          is_available = @available

        FROM dbo.products p

        INNER JOIN dbo.categories c
          ON c.category_id = @category

        WHERE p.product_id = @id
          AND c.is_active = 1
      `);

    if (!result.rowsAffected[0]) {
      return res.status(400).json({
        error: "Sản phẩm không tồn tại hoặc danh mục đã bị ẩn"
      });
    }

    res.json({
      message: "Cập nhật sản phẩm thành công"
    });

  } catch (error) {
    console.error("Loi sua san pham:", error);

    res.status(500).json({
      error: "Không thể cập nhật sản phẩm"
    });
  }
}

// API PATCH THEO YEU CAU PHAN CONG
router.patch(
  "/:id",
  requireManager,
  updateProduct
);

// GIU API PUT DE TUONG THICH FRONTEND CU
router.put(
  "/:id",
  requireManager,
  updateProduct
);

// ============================================
// 6. CAP NHAT TRANG THAI DANG BAN / NGUNG BAN
// PATCH /api/products/:id/availability
// ============================================

async function updateAvailability(req, res) {
  try {
    const id = String(
      req.params.id || ""
    ).trim();

    const available = req.body.is_available;

    if (
      !id ||
      id.length > 10 ||
      typeof available !== "boolean"
    ) {
      return res.status(400).json({
        error: "Trạng thái sản phẩm không hợp lệ"
      });
    }

    const pool = await connectDB();

    const result = await pool.request()

      .input("id", sql.VarChar(10), id)

      .input(
        "available",
        sql.Bit,
        available
      )

      .query(`
        UPDATE p

        SET
          is_active = @available,
          is_available = @available

        FROM dbo.products p

        INNER JOIN dbo.categories c
          ON p.category_id = c.category_id

        WHERE p.product_id = @id

          AND (
            @available = 0
            OR c.is_active = 1
          )
      `);

    if (!result.rowsAffected[0]) {
      return res.status(400).json({
        error: "Không tìm thấy sản phẩm hoặc danh mục đã bị ẩn"
      });
    }

    res.json({
      message: available
        ? "Đã mở bán sản phẩm"
        : "Đã ngừng bán sản phẩm",

      is_available: available
    });

  } catch (error) {
    console.error("Loi trang thai:", error);

    res.status(500).json({
      error: "Không thể cập nhật trạng thái sản phẩm"
    });
  }
}

router.patch(
  "/:id/availability",
  requireManager,
  updateAvailability
);

// ============================================
// 7. NGUNG BAN SAN PHAM
// PATCH /api/products/:id/stop
// ============================================

router.patch(
  "/:id/stop",
  requireManager,
  (req, res) => {

    req.body = {
      is_available: false
    };

    return updateAvailability(req, res);
  }
);

// ============================================
// 8. MO BAN LAI SAN PHAM
// PATCH /api/products/:id/resume
// ============================================

router.patch(
  "/:id/resume",
  requireManager,
  (req, res) => {

    req.body = {
      is_available: true
    };

    return updateAvailability(req, res);
  }
);

// ============================================
// KHONG XOA CUNG SAN PHAM
// BAO TOAN DON HANG VA HOA DON LICH SU
// ============================================
// =====================================================
// 9. XOA SAN PHAM
// DELETE /api/products/:id
// =====================================================

router.delete(
  "/:id",
  requireManager,
  async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();

      if (!id || id.length > 10) {
        return res.status(400).json({
          error: "Mã sản phẩm không hợp lệ."
        });
      }

      const pool = await connectDB();

      // 1. Kiểm tra sản phẩm có tồn tại không
      const product = await pool.request()
        .input("id", sql.VarChar(10), id)
        .query(`
          SELECT product_id
          FROM dbo.products
          WHERE product_id = @id
        `);

      if (product.recordset.length === 0) {
        return res.status(404).json({
          error: "Không tìm thấy sản phẩm."
        });
      }

      // 2. Kiểm tra sản phẩm đã có trong đơn hàng chưa
      const order = await pool.request()
        .input("id", sql.VarChar(10), id)
        .query(`
          SELECT TOP 1 product_id
          FROM dbo.order_details
          WHERE product_id = @id
        `);

      if (order.recordset.length > 0) {
        return res.status(409).json({
          error: "Món đã có trong đơn hàng, không thể xóa. Vui lòng ngừng bán món này."
        });
      }

      // 3. Xóa sản phẩm chưa có trong đơn hàng
      const result = await pool.request()
        .input("id", sql.VarChar(10), id)
        .query(`
          DELETE FROM dbo.products
          WHERE product_id = @id
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.order_details
            WHERE product_id = @id
          )
        `);

      if (result.rowsAffected[0] === 0) {
        const existing = await pool.request()
          .input("id", sql.VarChar(10), id)
          .query(`
            SELECT product_id
            FROM dbo.products
            WHERE product_id = @id
          `);

        if (existing.recordset.length === 0) {
          return res.status(404).json({
            error: "Không tìm thấy sản phẩm."
          });
        }

        return res.status(409).json({
          error: "Không thể xóa món đã phát sinh đơn hàng."
        });
      }

      // 4. Xóa thành công
      return res.status(204).end();

    } catch (error) {
      console.error("Lỗi xóa sản phẩm:", error);

      // Lỗi ràng buộc khóa ngoại SQL Server
      if (error.number === 547) {
        return res.status(409).json({
          error: "Sản phẩm đang được sử dụng, không thể xóa."
        });
      }

      return res.status(500).json({
        error: "Lỗi máy chủ khi xóa sản phẩm."
      });
    }
  }
);
module.exports = router;
