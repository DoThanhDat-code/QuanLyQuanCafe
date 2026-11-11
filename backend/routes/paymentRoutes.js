
const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sql, connectDB } = require("../config/db");

const router = express.Router();

// API lấy danh sách đơn hàng chưa thanh toán
router.get("/orders", async (req, res) => {
  try {
   const pool = await connectDB();

    const result = await pool.request().query(`
      SELECT
        o.order_id,
        o.table_id,
        t.table_name,
        o.order_date,
        o.status,
        COALESCE(
          SUM(od.quantity * od.unit_price), 0
        ) AS subtotal
      FROM dbo.orders o
      LEFT JOIN dbo.tables t
        ON o.table_id = t.table_id
      LEFT JOIN dbo.order_details od
        ON o.order_id = od.order_id
      WHERE o.status IN ('pending', 'serving')
      GROUP BY
        o.order_id,
        o.table_id,
        t.table_name,
        o.order_date,
        o.status
      ORDER BY o.order_date DESC
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error("Loi lay don hang:", error);
    res.status(500).json({
      message: "Khong the lay danh sach don hang"
    });
  }
});

// API lấy chi tiết một đơn hàng
router.get("/orders/:orderId", async (req, res) => {
  try {
    const pool = await connectDB();
    const orderId = req.params.orderId;

    const result = await pool.request()
      .input("orderId", sql.VarChar(20), orderId)
      .query(`
        SELECT
          od.order_detail_id,
          od.order_id,
          od.product_id,
          p.product_name,
          od.quantity,
          od.unit_price,
          od.quantity * od.unit_price AS amount
        FROM dbo.order_details od
        JOIN dbo.products p
          ON od.product_id = p.product_id
        WHERE od.order_id = @orderId
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error("Loi lay chi tiet:", error);
    res.status(500).json({
      message: "Khong the lay chi tiet don hang"
    });
  }
});



const paymentAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
      ? header.slice(7)
      : null;

    if (!token || !process.env.JWT_SECRET) {
      return res.status(401).json({
        message: "Vui long dang nhap"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const pool = await connectDB();
    const result = await pool.request()
      .input("userId", sql.VarChar(10), decoded.userId)
      .query(`
        SELECT u.user_id, u.employee_id, u.role
        FROM dbo.users u
        WHERE u.user_id = @userId
          AND u.is_active = 1
      `);

    const user = result.recordset[0];

    if (!user) {
      return res.status(401).json({
        message: "Tai khoan khong hop le"
      });
    }

    if (!["admin", "manager", "thungan"].includes(user.role)) {
      return res.status(403).json({
        message: "Khong co quyen thanh toan"
      });
    }

    if (!user.employee_id) {
      return res.status(400).json({
        message: "Tai khoan chua gan nhan vien"
      });
    }

    req.paymentEmployeeId = user.employee_id;
    next();
  } catch (error) {
    console.error("PAYMENT AUTH ERROR:", error.name, error.message);

    if (
        error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError" ||
        error.name === "NotBeforeError"
    ) {
        return res.status(401).json({
            message: "Token khong hop le hoac da het han"
        });
    }

    return res.status(500).json({
        message: "Loi he thong khi xac thuc thanh toan"
    });
}
};

// POST /api/payments
router.post("/", paymentAuth, async (req, res) => {
  const { order_id, discount = 0, payment_method } = req.body;

  const discountValue = Number(discount);

  if (
    typeof order_id !== "string" ||
    !order_id.trim() ||
    order_id.length > 20
  ) {
    return res.status(400).json({
      message: "Ma don hang khong hop le"
    });
  }

  if (!["cash", "transfer", "card"].includes(payment_method)) {
    return res.status(400).json({
      message: "Phuong thuc thanh toan khong hop le"
    });
  }

  if (
    !Number.isSafeInteger(discountValue) ||
    discountValue < 0
  ) {
    return res.status(400).json({
      message: "So tien giam gia khong hop le"
    });
  }

  let transaction;

  try {
    const pool = await connectDB();

    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    const orderResult = await new sql.Request(transaction)
      .input("orderId", sql.VarChar(20), order_id)
      .query(`
        SELECT order_id, table_id, status
        FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
        WHERE order_id = @orderId
      `);

    const order = orderResult.recordset[0];

    if (!order) {
      await transaction.rollback();
      return res.status(404).json({
        message: "Khong tim thay don hang"
      });
    }

    if (!["pending", "serving"].includes(order.status)) {
      await transaction.rollback();
      return res.status(409).json({
        message: "Don hang da thanh toan hoac da huy"
      });
    }

    const totalResult = await new sql.Request(transaction)
      .input("orderId", sql.VarChar(20), order_id)
      .query(`
        SELECT
          COUNT(*) AS item_count,
          COALESCE(
            SUM(CAST(quantity AS BIGINT) * unit_price),
            0
          ) AS subtotal
        FROM dbo.order_details
        WHERE order_id = @orderId
      `);

    const itemCount = Number(totalResult.recordset[0].item_count);
    const subtotal = Number(totalResult.recordset[0].subtotal);

    if (itemCount === 0 || subtotal <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: "Don hang chua co mon"
      });
    }

    if (discountValue > subtotal) {
      await transaction.rollback();
      return res.status(400).json({
        message: "Giam gia vuot qua tong tien"
      });
    }

    const totalAmount = subtotal - discountValue;
    const invoiceId = "HD" + crypto.randomBytes(9).toString("hex");

    await new sql.Request(transaction)
      .input("invoiceId", sql.VarChar(20), invoiceId)
      .input("orderId", sql.VarChar(20), order_id)
      .input("subtotal", sql.Decimal(12, 0), subtotal)
      .input("discount", sql.Decimal(12, 0), discountValue)
      .input("total", sql.Decimal(12, 0), totalAmount)
      .input("method", sql.VarChar(20), payment_method)
      .input("employeeId", sql.VarChar(10), req.paymentEmployeeId)
      .query(`
        INSERT INTO dbo.invoices
        (
          invoice_id,
          order_id,
          subtotal,
          discount,
          total_amount,
          payment_method,
          paid_at,
          employee_id
        )
        VALUES
        (
          @invoiceId,
          @orderId,
          @subtotal,
          @discount,
          @total,
          @method,
          GETDATE(),
          @employeeId

        )
      `);

    await new sql.Request(transaction)
      .input("orderId", sql.VarChar(20), order_id)
      .query(`
        UPDATE dbo.orders
        SET status = 'paid'
        WHERE order_id = @orderId
      `);

    // Chỉ giải phóng bàn khi không còn đơn đang phục vụ
    if (order.table_id) {
      await new sql.Request(transaction)
        .input("tableId", sql.VarChar(10), order.table_id)
        .query(`
          UPDATE dbo.tables
          SET status = 'available'
          WHERE table_id = @tableId
            AND status = 'occupied'
            AND NOT EXISTS (
              SELECT 1
              FROM dbo.orders
              WHERE table_id = @tableId
                AND status IN ('pending', 'serving')
            )
        `);
    }

    await transaction.commit();

    return res.status(201).json({
      message: "Thanh toan thanh cong",
      invoice_id: invoiceId,
      order_id,
      subtotal,
      discount: discountValue,
      total_amount: totalAmount,
      payment_method
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {
        // Transaction co the da tu rollback
      }
    }

    console.error("Loi thanh toan:", error);

    return res.status(500).json({
      message: "Khong the thuc hien thanh toan"
    });
  }
});


// Lay lich su hoa don tu SQL Server
router.get("/", paymentAuth, async (req, res) => {
  try {
    const pool = await connectDB();

    const result = await pool.request().query(`
      SELECT
        invoice_id,
        order_id,
        subtotal,
        discount,
        total_amount,
        payment_method,
        paid_at,
        employee_id
      FROM dbo.invoices
      ORDER BY paid_at DESC
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error("GET PAYMENTS ERROR:", error);

    res.status(500).json({
      message: "Khong the lay lich su hoa don"
    });
  }
});
module.exports = router;