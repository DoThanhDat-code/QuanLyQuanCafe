
const express = require("express");
const router = express.Router();

const { sql, connectDB } = require("../config/db");

// ============================================
// KIEM TRA QUYEN QUAN LY DANH MUC
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
      error: "Bạn không có quyền quản lý danh mục"
    });
  }

  next();
}

// ============================================
// 1. LAY DANH SACH DANH MUC
// GET /api/categories
// ============================================

router.get("/", async (req, res) => {
  try {
    const pool = await connectDB();

    const activeOnly = req.query.active === "1";

    const result = await pool.request()
      .input("activeOnly", sql.Bit, activeOnly)
      .query(`
        SELECT
          category_id,
          category_name,
          is_active
        FROM dbo.categories
        WHERE
          @activeOnly = 0
          OR is_active = 1
        ORDER BY category_id
      `);

    res.json(result.recordset);

  } catch (error) {
    console.error("Loi lay danh muc:", error);

    res.status(500).json({
      error: "Lỗi lấy danh sách danh mục"
    });
  }
});

// ============================================
// 2. THEM DANH MUC
// POST /api/categories
// ============================================

router.post("/", requireManager, async (req, res) => {
  try {
    const id = String(
      req.body.category_id || ""
    ).trim();

    const name = String(
      req.body.category_name || ""
    ).trim();

    if (
      !id ||
      id.length > 10 ||
      !name ||
      name.length > 100
    ) {
      return res.status(400).json({
        error: "Mã hoặc tên danh mục không hợp lệ"
      });
    }

    const pool = await connectDB();

    // KIEM TRA TRUNG MA HOAC TEN
    const existing = await pool.request()
      .input("id", sql.VarChar(10), id)
      .input("name", sql.NVarChar(100), name)
      .query(`
        SELECT category_id
        FROM dbo.categories
        WHERE category_id = @id
           OR category_name = @name
      `);

    if (existing.recordset.length > 0) {
      return res.status(409).json({
        error: "Mã hoặc tên danh mục đã tồn tại"
      });
    }

    // THEM DANH MUC MOI
    await pool.request()
      .input("id", sql.VarChar(10), id)
      .input("name", sql.NVarChar(100), name)
      .query(`
        INSERT INTO dbo.categories (
          category_id,
          category_name,
          is_active
        )
        VALUES (@id, @name, 1)
      `);

    res.status(201).json({
      message: "Thêm danh mục thành công",
      category_id: id,
      category_name: name,
      is_active: true
    });

  } catch (error) {
    console.error("Loi them danh muc:", error);

    if ([2601, 2627].includes(error.number)) {
      return res.status(409).json({
        error: "Mã hoặc tên danh mục đã tồn tại"
      });
    }

    res.status(500).json({
      error: "Không thể thêm danh mục"
    });
  }
});

// ============================================
// 3. SUA TEN VA TRANG THAI DANH MUC
// PATCH /api/categories/:id
// ============================================

async function updateCategory(req, res) {
  try {
    const id = String(req.params.id || "").trim();

    const { category_name, is_active } = req.body;

    if (!id || id.length > 10) {
      return res.status(400).json({
        error: "Mã danh mục không hợp lệ"
      });
    }

    if (
      category_name === undefined &&
      is_active === undefined
    ) {
      return res.status(400).json({
        error: "Không có thông tin cần cập nhật"
      });
    }

    if (
      category_name !== undefined &&
      (
        typeof category_name !== "string" ||
        !category_name.trim() ||
        category_name.trim().length > 100
      )
    ) {
      return res.status(400).json({
        error: "Tên danh mục không hợp lệ"
      });
    }

    if (
      is_active !== undefined &&
      typeof is_active !== "boolean"
    ) {
      return res.status(400).json({
        error: "Trạng thái danh mục không hợp lệ"
      });
    }

    const pool = await connectDB();

    // KIEM TRA DANH MUC TON TAI
    const existing = await pool.request()
      .input("id", sql.VarChar(10), id)
      .query(`
        SELECT *
        FROM dbo.categories
        WHERE category_id = @id
      `);

    if (!existing.recordset.length) {
      return res.status(404).json({
        error: "Không tìm thấy danh mục"
      });
    }

    const name = category_name === undefined
      ? null
      : category_name.trim();

    // KIEM TRA TRUNG TEN DANH MUC
    if (name !== null) {
      const duplicate = await pool.request()
        .input("id", sql.VarChar(10), id)
        .input("name", sql.NVarChar(100), name)
        .query(`
          SELECT category_id
          FROM dbo.categories
          WHERE category_name = @name
            AND category_id <> @id
        `);

      if (duplicate.recordset.length > 0) {
        return res.status(409).json({
          error: "Tên danh mục đã tồn tại"
        });
      }
    }

    // CAP NHAT DANH MUC
    const result = await pool.request()
      .input("id", sql.VarChar(10), id)
      .input("name", sql.NVarChar(100), name)
      .input("active", sql.Bit, is_active ?? null)
      .query(`
        UPDATE dbo.categories
        SET
          category_name = COALESCE(
            @name,
            category_name
          ),
          is_active = COALESCE(
            @active,
            is_active
          )
        WHERE category_id = @id
      `);

    if (!result.rowsAffected[0]) {
      return res.status(404).json({
        error: "Không tìm thấy danh mục"
      });
    }

    res.json({
      message: "Cập nhật danh mục thành công"
    });

  } catch (error) {
    console.error("Loi cap nhat danh muc:", error);

    if ([2601, 2627].includes(error.number)) {
      return res.status(409).json({
        error: "Tên danh mục đã tồn tại"
      });
    }

    res.status(500).json({
      error: "Không thể cập nhật danh mục"
    });
  }
}

// API MOI THEO YEU CAU PHAN CONG
router.patch("/:id", requireManager, updateCategory);

// GIU LAI API CU DE TUONG THICH FRONTEND
router.put("/:id", requireManager, updateCategory);

// ============================================
// 4. AN DANH MUC
// PATCH /api/categories/:id/hide
// ============================================

router.patch("/:id/hide", requireManager, (req, res) => {
  req.body = {
    is_active: false
  };

  return updateCategory(req, res);
});

// ============================================
// 5. HIEN LAI DANH MUC
// PATCH /api/categories/:id/show
// ============================================

router.patch("/:id/show", requireManager, (req, res) => {
  req.body = {
    is_active: true
  };

  return updateCategory(req, res);
});

module.exports = router;
