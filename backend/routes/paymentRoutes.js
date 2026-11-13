const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sql, connectDB } = require("../config/db");

const router = express.Router();

const paymentAuth = (preview = false) => async (req, res, next) => {
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });

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

    const cashierRoles = ["admin", "manager", "thungan", "cashier"];
    const allowedRoles = preview ? [...cashierRoles, "phucvu", "waiter"] : cashierRoles;
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        message: "Khong co quyen thanh toan"
      });
    }

    if (!preview && !user.employee_id && user.role !== "admin") {
      return res.status(400).json({
        message: "Tai khoan chua gan nhan vien"
      });
    }

    req.paymentEmployeeId = user.employee_id;
    req.paymentUserId = user.user_id;
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

// Read-only preview; never changes order/table status.
router.get("/orders", paymentAuth(true), async (req,res) => {
  try {
    const pool = await connectDB();
    const result = await pool.request().query(`SELECT o.order_id,o.table_id,t.table_name,o.status,
      COALESCE(SUM(od.quantity*od.unit_price),0) subtotal
      FROM dbo.orders o JOIN dbo.tables t ON t.table_id=o.table_id
      LEFT JOIN dbo.order_details od ON od.order_id=o.order_id
      WHERE o.status IN ('pending','serving') AND t.status='occupied' AND t.is_active=1
        AND NOT EXISTS (SELECT 1 FROM dbo.invoices i WHERE i.order_id=o.order_id)
      GROUP BY o.order_id,o.table_id,t.table_name,o.status ORDER BY t.table_name`);
    res.json(result.recordset);
  } catch(e) { res.status(500).json({message:"Không tải được đơn hàng"}); }
});
async function details(pool,id) {
  return (await pool.request().input("id",sql.VarChar(20),id).query(`SELECT od.product_id,p.product_name,od.quantity,od.unit_price,od.quantity*od.unit_price amount FROM dbo.order_details od JOIN dbo.products p ON p.product_id=od.product_id WHERE od.order_id=@id`)).recordset;
}
router.get(["/preview/:orderId","/orders/:orderId"], paymentAuth(true), async (req,res) => {
  try {
    const pool=await connectDB(); const id=req.params.orderId;
    const order=(await pool.request().input("id",sql.VarChar(20),id).query(`SELECT o.order_id,o.table_id,t.table_name,o.status FROM dbo.orders o JOIN dbo.tables t ON t.table_id=o.table_id WHERE o.order_id=@id AND o.status IN ('pending','serving') AND t.status='occupied' AND t.is_active=1 AND NOT EXISTS (SELECT 1 FROM dbo.invoices i WHERE i.order_id=o.order_id)`)).recordset[0];
    if(!order) return res.status(404).json({message:"Không có đơn đang chờ thanh toán"});
    const items=await details(pool,id); res.json({...order,items,subtotal:items.reduce((n,x)=>n+Number(x.amount),0)});
  } catch(e) {res.status(500).json({message:"Không tải được tạm tính"});}
});
// POST /api/payments
router.post("/", paymentAuth(), async (req, res) => {
  const { order_id, discount = 0, payment_method, cash_received, transfer_confirmed, expected_total, transaction_reference } = req.body;

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

  if (!["cash", "transfer"].includes(payment_method)) {
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

    const initialOrder = (await pool.request()
      .input("orderId", sql.VarChar(20), order_id)
      .query("SELECT table_id FROM dbo.orders WHERE order_id = @orderId")).recordset[0];
    if (!initialOrder) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    const table = (await new sql.Request(transaction)
      .input("tableId", sql.VarChar(10), initialOrder.table_id)
      .query(`
        SELECT status, is_active
        FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK)
        WHERE table_id = @tableId
      `)).recordset[0];

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

    if (order.table_id !== initialOrder.table_id || !table?.is_active || table.status !== "occupied") {
      await transaction.rollback();
      return res.status(409).json({ message: "Bàn của đơn đã thay đổi hoặc không còn hoạt động" });
    }

    const existing = (await new sql.Request(transaction)
      .input("orderId", sql.VarChar(20), order_id)
      .query("SELECT invoice_id FROM dbo.invoices WHERE order_id = @orderId")).recordset[0];
    if (existing) {
      await transaction.rollback();
      return res.status(409).json({ message: "Đơn đã có hóa đơn" });
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
    const cash = Number(cash_received);
    if (expected_total == null || Number(expected_total) !== totalAmount || (payment_method === "cash" && (cash_received == null || !Number.isSafeInteger(cash) || cash < totalAmount || cash > 999999999999)) || (payment_method === "transfer" && transfer_confirmed !== true)) {
      await transaction.rollback();
      return res.status(400).json({message:"Tổng tiền đã thay đổi hoặc chưa nhận đủ tiền. Hãy kiểm tra lại."});
    }
    const ref = typeof transaction_reference === "string" ? transaction_reference.trim().slice(0,100) : null;

    const invoiceId = "HD" + crypto.randomBytes(9).toString("hex");

    await new sql.Request(transaction)
      .input("invoiceId", sql.VarChar(20), invoiceId)
      .input("orderId", sql.VarChar(20), order_id)
      .input("subtotal", sql.Decimal(12, 0), subtotal)
      .input("discount", sql.Decimal(12, 0), discountValue)
      .input("total", sql.Decimal(12, 0), totalAmount)
      .input("method", sql.VarChar(20), payment_method)
      .input("employeeId", sql.VarChar(10), req.paymentEmployeeId)
      .input("paidBy",sql.VarChar(10),req.paymentUserId)
      .input("cash",sql.Decimal(12,0),payment_method === "cash" ? cash : null)
      .input("ref",sql.NVarChar(100),ref)
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
          employee_id, paid_by, cash_received, transaction_reference
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
          @employeeId, @paidBy, @cash, @ref

        )
      `);

    await new sql.Request(transaction)
      .input("orderId", sql.VarChar(20), order_id)
      .query(`
        UPDATE dbo.orders
        SET status = 'paid'
        WHERE order_id = @orderId
      `);

    await new sql.Request(transaction)
      .input("orderId", sql.VarChar(20), order_id)
      .input("tableId", sql.VarChar(10), order.table_id)
      .query(`
        DECLARE @ReleasedLinks TABLE (table_id varchar(10) PRIMARY KEY);

        DELETE FROM dbo.table_order_links
        OUTPUT DELETED.table_id INTO @ReleasedLinks (table_id)
        WHERE order_id = @orderId;

        UPDATE t
        SET status = 'available'
        FROM dbo.[tables] AS t
        WHERE t.status = 'occupied'
          AND (t.table_id = @tableId OR EXISTS (
            SELECT 1 FROM @ReleasedLinks r WHERE r.table_id = t.table_id
          ))
          AND NOT EXISTS (
            SELECT 1 FROM dbo.orders o
            WHERE o.table_id = t.table_id AND o.status IN ('pending', 'serving')
          )
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.table_order_links l
            JOIN dbo.orders o ON o.order_id = l.order_id
            WHERE l.table_id = t.table_id AND o.status IN ('pending', 'serving')
          );
      `);

    await transaction.commit();

    return res.status(201).json({
      message: "Thanh toan thanh cong",
      invoice_id: invoiceId,
      order_id,
      subtotal,
      discount: discountValue,
      total_amount: totalAmount,
      payment_method, status:"completed", payment_id:invoiceId, change:payment_method === "cash" ? cash-totalAmount : 0
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {
        // Transaction co the da tu rollback
      }
    }

    if (error.number === 1205) {
      return res.status(409).json({
        message: "Đơn đang được cập nhật. Hãy mở lại tạm tính và thử thanh toán."
      });
    }

    console.error("Loi thanh toan:", error);

    return res.status(500).json({
      message: "Khong the thuc hien thanh toan"
    });
  }
});


// Lay lich su hoa don tu SQL Server
router.get("/", paymentAuth(), async (req, res) => {
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
        employee_id, paid_by, cash_received, transaction_reference,
        invoice_id AS payment_id, total_amount AS amount, 'completed' AS status
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
router.get(["/:id/invoice","/:id"],paymentAuth(),async(req,res)=>{
  try {
    const pool=await connectDB();
    const invoice=(await pool.request().input("id",sql.VarChar(20),req.params.id).query(`SELECT i.*,i.invoice_id payment_id,i.total_amount amount,'completed' status,t.table_name,e.full_name employee_name,u.username FROM dbo.invoices i JOIN dbo.orders o ON o.order_id=i.order_id JOIN dbo.tables t ON t.table_id=o.table_id LEFT JOIN dbo.employees e ON e.employee_id=i.employee_id LEFT JOIN dbo.users u ON u.user_id=i.paid_by WHERE i.invoice_id=@id`)).recordset[0];
    if(!invoice) return res.status(404).json({message:"Không tìm thấy hóa đơn"});
    res.json({...invoice,items:await details(pool,invoice.order_id)});
  }catch(e){res.status(500).json({message:"Không tải được hóa đơn"});}
});
module.exports = router;
