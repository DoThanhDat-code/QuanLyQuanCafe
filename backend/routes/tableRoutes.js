
const express = require("express");
const router = express.Router();

const { sql, connectDB } = require("../config/db");

// 1. LAY DANH SACH BAN
// Giu nguyen API GET hien tai
router.get("/", async (req, res) => {
    try {
        const pool = await connectDB();

const result = await pool.request().query(`
    SELECT
        t.table_id,
        t.table_name,
        t.seats,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM dbo.orders AS o
                WHERE o.table_id = t.table_id
                  AND o.status IN ('pending', 'serving')
            )
            THEN 'occupied'
            WHEN t.status IN ('reserved', 'maintenance') THEN t.status
            ELSE 'available'
        END AS status,
        t.is_active
    FROM dbo.[tables] AS t
    ORDER BY t.table_id
`);
        res.json(result.recordset);
    } catch (error) {
        console.error("Loi lay danh sach ban:", error);
        res.status(500).json({
            error: "Khong the lay danh sach ban"
        });
    }
});

// Lay cac don dang mo kem chi tiet mon de frontend khong phu thuoc localStorage.
router.get("/active-orders", async (req, res) => {
  try {
    const pool = await connectDB();
    const result = await pool.request().query(`
      SELECT o.order_id, o.table_id, o.order_date,
             od.product_id, od.quantity, od.unit_price
      FROM dbo.orders AS o
      LEFT JOIN dbo.order_details AS od ON od.order_id = o.order_id
      WHERE o.status IN ('pending', 'serving')
      ORDER BY o.order_id, od.order_detail_id
    `);
    const byId = new Map();
    for (const row of result.recordset) {
      if (!byId.has(row.order_id)) {
        byId.set(row.order_id, {
          order_id: row.order_id,
          table_id: row.table_id,
          order_date: row.order_date,
          items: []
        });
      }
      if (row.product_id !== null) {
        byId.get(row.order_id).items.push({
          productId: row.product_id,
          qty: row.quantity,
          price: Number(row.unit_price)
        });
      }
    }
    res.json([...byId.values()]);
  } catch (error) {
    console.error("Loi lay don dang mo:", error);
    res.status(500).json({ error: "Khong the lay don dang mo." });
  }
});

// 2. XEM CHI TIET BAN
router.get("/:id", async (req, res) => {
    try {
        const pool = await connectDB();

const result = await pool.request()
    .input("id", sql.VarChar(10), req.params.id)
    .query(`
        SELECT
            t.table_id,
            t.table_name,
            t.seats,
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM dbo.orders AS o
                    WHERE o.table_id = t.table_id
                      AND o.status IN ('pending', 'serving')
                )
                THEN 'occupied'
                WHEN t.status IN ('reserved', 'maintenance') THEN t.status
                ELSE 'available'
            END AS status,
            t.is_active
        FROM dbo.[tables] AS t
        WHERE t.table_id = @id
    `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                error: "Khong tim thay ban"
            });
        }

        res.json(result.recordset[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Loi xem chi tiet ban"
        });
    }
});

// 3. THEM BAN MOI
router.post("/", async (req, res) => {
    try {
        const { table_id, table_name, seats } = req.body || {};

        if (
            typeof table_id !== "string" ||
            !table_id.trim() ||
            table_id.length > 10 ||
            typeof table_name !== "string" ||
            !table_name.trim() ||
            table_name.length > 100
        ) {
            return res.status(400).json({
                error: "Ma ban hoac ten ban khong hop le"
            });
        }

        const seatCount = seats === undefined ? 4 : seats;

        if (!Number.isInteger(seatCount) || seatCount <= 0) {
            return res.status(400).json({
                error: "So ghe phai la so nguyen lon hon 0"
            });
        }

        const pool = await connectDB();

        const result = await pool.request()
            .input("id", sql.VarChar(10), table_id.trim())
            .input("name", sql.NVarChar(100), table_name.trim())
            .input("seats", sql.Int, seatCount)
            .query(`
                INSERT INTO dbo.[tables]
                    (table_id, table_name, seats)
                OUTPUT INSERTED.*
                VALUES (@id, @name, @seats)
            `);

        res.status(201).json({
            message: "Them ban thanh cong",
            table: result.recordset[0]
        });
    } catch (error) {
        console.error(error);

        if (error.number === 2627 || error.number === 2601) {
            return res.status(409).json({
                error: "Ma ban da ton tai"
            });
        }

        res.status(500).json({
            error: "Khong the them ban"
        });
    }
});

// 4. SUA THONG TIN BAN
router.put("/:id", async (req, res) => {
    try {
        const { table_name, seats } = req.body || {};

        if (
            typeof table_name !== "string" ||
            !table_name.trim() ||
            table_name.length > 100 ||
            !Number.isInteger(seats) ||
            seats <= 0
        ) {
            return res.status(400).json({
                error: "Ten ban hoac so ghe khong hop le"
            });
        }

        const pool = await connectDB();

        const result = await pool.request()
            .input("id", sql.VarChar(10), req.params.id)
            .input("name", sql.NVarChar(100), table_name.trim())
            .input("seats", sql.Int, seats)
            .query(`
                UPDATE dbo.[tables]
                SET table_name = @name,
                    seats = @seats
                OUTPUT INSERTED.*
                WHERE table_id = @id
                  AND is_active = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                error: "Khong tim thay ban dang hoat dong"
            });
        }

        res.json({
            message: "Cap nhat ban thanh cong",
            table: result.recordset[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Khong the sua ban"
        });
    }
});



// 6. NGUNG SU DUNG BAN (KHONG XOA DU LIEU)
router.delete("/:id", async (req, res) => {
    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input("id", sql.VarChar(10), req.params.id)
            .query(`
                UPDATE dbo.[tables]
                SET is_active = 0
                OUTPUT INSERTED.*
                WHERE table_id = @id
                  AND is_active = 1
                  
                  AND NOT EXISTS (
                      SELECT 1
                      FROM dbo.orders
                      WHERE orders.table_id = @id
                        AND orders.status IN (
                            'pending',
                            'preparing',
                            'serving'
                        )
                  )
            `);

        if (result.recordset.length === 0) {
            return res.status(409).json({
                error: "Ban khong ton tai, da ngung su dung hoac khong du dieu kien ngung su dung"
            });
        }

        res.json({
            message: "Da ngung su dung ban",
            table: result.recordset[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Khong the ngung su dung ban"
        });
    }
});
// 7. LAY DON HANG HIEN TAI CUA BAN
router.get("/:id/current-order", async (req, res) => {
    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input("id", sql.VarChar(10), req.params.id)
            .query(`
                SELECT
                    o.order_id,
                    o.table_id,
                    o.status,
                    o.order_date,
                    COALESCE(SUM(
                        od.quantity * od.unit_price
                    ), 0) AS total_amount
                FROM dbo.orders AS o
                LEFT JOIN dbo.order_details AS od
                    ON o.order_id = od.order_id
                WHERE o.table_id = @id
                  AND o.status IN ('pending', 'serving')
                GROUP BY
                    o.order_id,
                    o.table_id,
                    o.status,
                    o.order_date
            `);

        if (result.recordset.length === 0) {
            return res.json({
                order: null
            });
        }

        if (result.recordset.length > 1) {
            return res.status(409).json({
                error: "Ban dang co nhieu don hang hoat dong"
            });
        }

        res.json({
            order: result.recordset[0]
        });

    } catch (error) {
        console.error("Loi lay don hang hien tai:", error);

        res.status(500).json({
            error: "Khong the lay don hang hien tai"
        });
    }
});



router.post("/transfer-order", async (req, res) => {
  let transaction;

  try {
    const { orderId, sourceId, destinationId } = req.body || {};

    if (
      typeof orderId !== "string" ||
      !orderId.trim() ||
      orderId.length > 20 ||
      typeof sourceId !== "string" ||
      !sourceId.trim() ||
      sourceId.length > 10 ||
      typeof destinationId !== "string" ||
      !destinationId.trim() ||
      destinationId.length > 10 ||
      sourceId === destinationId
    ) {
      return res.status(400).json({
        error: "Thông tin chuyển bàn không hợp lệ."
      });
    }

    const pool = await connectDB();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const tables = await new sql.Request(transaction)
      .input("sourceId", sql.VarChar(10), sourceId)
      .input("destinationId", sql.VarChar(10), destinationId)
      .query(`
        SELECT table_id, status, is_active
        FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK)
        WHERE table_id IN (@sourceId, @destinationId)
        ORDER BY table_id
      `);

    const source = tables.recordset.find(
      table => table.table_id === sourceId
    );

    const destination = tables.recordset.find(
      table => table.table_id === destinationId
    );

    if (
      !source ||
      !destination ||
      !source.is_active ||
      !destination.is_active
    ) {
      await transaction.rollback();
      transaction = null;

      return res.status(404).json({
        error: "Bàn nguồn hoặc bàn đích không tồn tại."
      });
    }

    if (["reserved", "maintenance"].includes(destination.status)) {
      await transaction.rollback();
      transaction = null;

      return res.status(409).json({
        error: "Bàn đích không ở trạng thái trống."
      });
    }

    const orders = await new sql.Request(transaction)
      .input("orderId", sql.VarChar(20), orderId)
      .input("sourceId", sql.VarChar(10), sourceId)
      .input("destinationId", sql.VarChar(10), destinationId)
      .query(`
        SELECT order_id, table_id
        FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
        WHERE status IN ('pending', 'serving')
          AND (
            table_id IN (@sourceId, @destinationId)
            OR order_id = @orderId
          )
      `);

    const sourceOrder = orders.recordset.find(
      order =>
        order.order_id === orderId &&
        order.table_id === sourceId
    );

    const destinationHasOrder = orders.recordset.some(
      order => order.table_id === destinationId
    );

    if (!sourceOrder || destinationHasOrder) {
      await transaction.rollback();
      transaction = null;

      return res.status(409).json({
        error: "Đơn nguồn không hợp lệ hoặc bàn đích đã có đơn."
      });
    }

    await new sql.Request(transaction)
      .input("orderId", sql.VarChar(20), orderId)
      .input("destinationId", sql.VarChar(10), destinationId)
      .query(`
        UPDATE dbo.orders
        SET table_id = @destinationId
        WHERE order_id = @orderId
      `);

    await new sql.Request(transaction)
      .input("destinationId", sql.VarChar(10), destinationId)
      .query(`
        UPDATE dbo.[tables]
        SET status = 'occupied'
        WHERE table_id = @destinationId
      `);

    const remaining = await new sql.Request(transaction)
      .input("sourceId", sql.VarChar(10), sourceId)
      .query(`
        SELECT COUNT(*) AS total
        FROM dbo.orders
        WHERE table_id = @sourceId
          AND status IN ('pending', 'serving')
      `);

    if (remaining.recordset[0].total === 0) {
      await new sql.Request(transaction)
        .input("sourceId", sql.VarChar(10), sourceId)
        .query(`
          UPDATE dbo.[tables]
          SET status = 'available'
          WHERE table_id = @sourceId
        `);
    }

    await transaction.commit();
    transaction = null;

    return res.json({
      message: "Chuyển bàn thành công.",
      orderId,
      sourceId,
      destinationId
    });

  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Lỗi rollback:", rollbackError);
      }
    }

    console.error("Lỗi chuyển bàn:", error);

    return res.status(500).json({
      error: "Không thể chuyển bàn trong SQL Server."
    });
  }
});

router.post("/merge-orders", async (req, res) => {
  let transaction;

  try {
    const { sourceOrderId, destinationOrderId } = req.body || {};

    if (
      typeof sourceOrderId !== "string" ||
      !sourceOrderId.trim() ||
      sourceOrderId.length > 20 ||
      typeof destinationOrderId !== "string" ||
      !destinationOrderId.trim() ||
      destinationOrderId.length > 20 ||
      sourceOrderId === destinationOrderId
    ) {
      return res.status(400).json({
        error: "Thông tin gộp đơn không hợp lệ."
      });
    }

    const pool = await connectDB();
    transaction = new sql.Transaction(pool);

    await transaction.begin();

    const orders = await new sql.Request(transaction)
      .input("sourceOrderId", sql.VarChar(20), sourceOrderId)
      .input("destinationOrderId", sql.VarChar(20), destinationOrderId)
      .query(`
        SELECT order_id, table_id, status
        FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
        WHERE order_id IN (@sourceOrderId, @destinationOrderId)
        ORDER BY order_id
      `);

    const source = orders.recordset.find(
      order => order.order_id === sourceOrderId
    );

    const destination = orders.recordset.find(
      order => order.order_id === destinationOrderId
    );

    if (
      !source ||
      !destination ||
      !["pending", "serving"].includes(source.status) ||
      !["pending", "serving"].includes(destination.status) ||
      source.table_id === destination.table_id
    ) {
      await transaction.rollback();
      transaction = null;

      return res.status(409).json({
        error: "Hai đơn hàng không hợp lệ để gộp."
      });
    }

    // Khóa hai bàn để tránh thay đổi đồng thời.
    const tables = await new sql.Request(transaction)
      .input("sourceId", sql.VarChar(10), source.table_id)
      .input("destinationId", sql.VarChar(10), destination.table_id)
      .query(`
        SELECT table_id
        FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK)
        WHERE table_id IN (@sourceId, @destinationId)
          AND is_active = 1
        ORDER BY table_id
      `);

    if (tables.recordset.length !== 2) {
      await transaction.rollback();
      transaction = null;

      return res.status(409).json({
        error: "Bàn nguồn hoặc bàn đích không hoạt động."
      });
    }

    // Chuyển các dòng món sang đơn đích.
    await new sql.Request(transaction)
      .input("sourceOrderId", sql.VarChar(20), sourceOrderId)
      .input("destinationOrderId", sql.VarChar(20), destinationOrderId)
      .query(`
        UPDATE dbo.order_details
        SET order_id = @destinationOrderId
        WHERE order_id = @sourceOrderId
      `);

    // Đơn nguồn được đánh dấu đã hủy sau khi gộp.
    await new sql.Request(transaction)
      .input("sourceOrderId", sql.VarChar(20), sourceOrderId)
      .query(`
        UPDATE dbo.orders
        SET status = 'cancelled'
        WHERE order_id = @sourceOrderId
      `);

    // Chỉ giải phóng bàn nguồn khi không còn đơn đang mở.
    const remaining = await new sql.Request(transaction)
      .input("sourceId", sql.VarChar(10), source.table_id)
      .query(`
        SELECT COUNT(*) AS total
        FROM dbo.orders
        WHERE table_id = @sourceId
          AND status IN ('pending', 'serving')
      `);

    if (remaining.recordset[0].total === 0) {
      await new sql.Request(transaction)
        .input("sourceId", sql.VarChar(10), source.table_id)
        .query(`
          UPDATE dbo.[tables]
          SET status = 'available'
          WHERE table_id = @sourceId
        `);
    }

    await new sql.Request(transaction)
      .input("destinationId", sql.VarChar(10), destination.table_id)
      .query(`
        UPDATE dbo.[tables]
        SET status = 'occupied'
        WHERE table_id = @destinationId
      `);

    await transaction.commit();
    transaction = null;

    return res.json({
      message: "Gộp bàn thành công.",
      sourceId: source.table_id,
      destinationId: destination.table_id,
      destinationOrderId
    });

  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Lỗi rollback:", rollbackError);
      }
    }

    console.error("Lỗi gộp bàn:", error);

    return res.status(500).json({
      error: "Không thể gộp bàn trong SQL Server."
    });
  }
});

router.post("/pay-order", async (req, res) => {
  let transaction;

  try {
    const { orderId, tableId } = req.body || {};

    if (
      typeof orderId !== "string" ||
      !orderId.trim() ||
      orderId.length > 20 ||
      typeof tableId !== "string" ||
      !tableId.trim() ||
      tableId.length > 10
    ) {
      return res.status(400).json({
        error: "Thông tin thanh toán không hợp lệ."
      });
    }

    const pool = await connectDB();
    transaction = new sql.Transaction(pool);

    await transaction.begin();

    // Khóa bàn trong thời gian thanh toán
    const tableResult = await new sql.Request(transaction)
      .input("tableId", sql.VarChar(10), tableId)
      .query(`
        SELECT table_id
        FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK)
        WHERE table_id = @tableId
          AND is_active = 1
      `);

    if (tableResult.recordset.length === 0) {
      await transaction.rollback();
      transaction = null;

      return res.status(404).json({
        error: "Không tìm thấy bàn đang hoạt động."
      });
    }

    // Kiểm tra đơn hàng thuộc đúng bàn
    const orderResult = await new sql.Request(transaction)
      .input("orderId", sql.VarChar(20), orderId)
      .input("tableId", sql.VarChar(10), tableId)
      .query(`
        SELECT order_id, status
        FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
        WHERE order_id = @orderId
          AND table_id = @tableId
      `);

    if (orderResult.recordset.length === 0) {
      await transaction.rollback();
      transaction = null;

      return res.status(404).json({
        error: "Không tìm thấy đơn hàng của bàn này."
      });
    }

    const status = orderResult.recordset[0].status;

    if (!["pending", "serving"].includes(status)) {
      await transaction.rollback();
      transaction = null;

      return res.status(409).json({
        error: "Đơn hàng đã thanh toán hoặc đã kết thúc."
      });
    }

    // Chuyển đơn hàng thành đã thanh toán
    await new sql.Request(transaction)
      .input("orderId", sql.VarChar(20), orderId)
      .query(`
        UPDATE dbo.orders
        SET status = 'paid'
        WHERE order_id = @orderId
      `);

    // Kiểm tra bàn còn đơn chưa thanh toán không
    const remaining = await new sql.Request(transaction)
      .input("tableId", sql.VarChar(10), tableId)
      .query(`
        SELECT COUNT(*) AS total
        FROM dbo.orders
        WHERE table_id = @tableId
          AND status IN ('pending', 'serving')
      `);

    const tableAvailable = remaining.recordset[0].total === 0;

    if (tableAvailable) {
      await new sql.Request(transaction)
        .input("tableId", sql.VarChar(10), tableId)
        .query(`
          UPDATE dbo.[tables]
          SET status = 'available'
          WHERE table_id = @tableId
        `);
    }

    await transaction.commit();
    transaction = null;

    return res.json({
      message: "Thanh toán thành công.",
      orderId,
      tableId,
      status: "paid",
      tableAvailable
    });

  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Lỗi rollback:", rollbackError);
      }
    }

    console.error("Lỗi thanh toán:", error);

    return res.status(500).json({
      error: "Không thể thanh toán đơn hàng trong SQL Server."
    });
  }
});

// 8. LUU HOAC CAP NHAT DON HANG TU FRONTEND VAO SQL SERVER
// POST /api/tables/sync-order
router.post("/sync-order", async (req, res) => {
  let transaction;

  try {
    const { orderId, tableId, items } = req.body || {};

    if (
      typeof orderId !== "string" || !orderId.trim() || orderId.length > 20 ||
      typeof tableId !== "string" || !tableId.trim() || tableId.length > 10 ||
      !Array.isArray(items) || items.length === 0
    ) {
      return res.status(400).json({ error: "Thong tin don hang khong hop le." });
    }

    for (const item of items) {
      if (
        !item ||
        typeof item.productId !== "string" ||
        !item.productId.trim() || item.productId.length > 10 ||
        !Number.isInteger(item.qty) || item.qty <= 0 ||
        typeof item.price !== "number" ||
        !Number.isFinite(item.price) || item.price < 0 ||
        !Number.isInteger(item.price)
      ) {
        return res.status(400).json({ error: "Mon hang, so luong hoac don gia khong hop le." });
      }
    }

    const pool = await connectDB();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const tableResult = await new sql.Request(transaction)
      .input("tableId", sql.VarChar(10), tableId)
      .query(`
        SELECT table_id, status
        FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK)
        WHERE table_id = @tableId AND is_active = 1
      `);

    if (!tableResult.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return res.status(404).json({ error: "Khong tim thay ban dang hoat dong." });
    }

    const existingResult = await new sql.Request(transaction)
      .input("orderId", sql.VarChar(20), orderId)
      .query(`
        SELECT order_id, table_id, status
        FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
        WHERE order_id = @orderId
      `);

    const existing = existingResult.recordset[0];

    if (existing) {
      if (
        existing.table_id !== tableId ||
        !["pending", "serving"].includes(existing.status)
      ) {
        await transaction.rollback();
        transaction = null;
        return res.status(409).json({
          error: "Don hang da chuyen ban, thanh toan hoac ket thuc."
        });
      }
    } else {
      if (["reserved", "maintenance"].includes(tableResult.recordset[0].status)) {
        await transaction.rollback();
        transaction = null;
        return res.status(409).json({ error: "Ban dang dat truoc hoac bao tri." });
      }

      const activeOrder = await new sql.Request(transaction)
        .input("tableId", sql.VarChar(10), tableId)
        .query(`
          SELECT order_id FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
          WHERE table_id = @tableId AND status IN ('pending', 'serving')
        `);

      if (activeOrder.recordset.length) {
        await transaction.rollback();
        transaction = null;
        return res.status(409).json({
          error: "Ban da co don dang phuc vu. Hay tai lai trang."
        });
      }
    }

    // Kiem tra ma san pham truoc khi thay doi chi tiet don.
    const productIds = [...new Set(items.map(item => item.productId))];
    for (const productId of productIds) {
      const product = await new sql.Request(transaction)
        .input("productId", sql.VarChar(10), productId)
        .query(`
          SELECT product_id FROM dbo.products
          WHERE product_id = @productId AND is_active = 1
        `);
      if (!product.recordset.length) {
        await transaction.rollback();
        transaction = null;
        return res.status(400).json({
          error: `San pham ${productId} khong ton tai hoac da ngung ban.`
        });
      }
    }

    if (existing) {
      await new sql.Request(transaction)
        .input("orderId", sql.VarChar(20), orderId)
        .query(`DELETE FROM dbo.order_details WHERE order_id = @orderId`);
    } else {
      await new sql.Request(transaction)
        .input("orderId", sql.VarChar(20), orderId)
        .input("tableId", sql.VarChar(10), tableId)
        .query(`
          INSERT INTO dbo.orders (order_id, table_id, status)
          VALUES (@orderId, @tableId, 'pending')
        `);
    }

    for (const item of items) {
      await new sql.Request(transaction)
        .input("orderId", sql.VarChar(20), orderId)
        .input("productId", sql.VarChar(10), item.productId)
        .input("quantity", sql.Int, item.qty)
        .input("unitPrice", sql.Decimal(12, 0), item.price)
        .query(`
          INSERT INTO dbo.order_details (order_id, product_id, quantity, unit_price)
          VALUES (@orderId, @productId, @quantity, @unitPrice)
        `);
    }

    await new sql.Request(transaction)
      .input("tableId", sql.VarChar(10), tableId)
      .query(`
        UPDATE dbo.[tables] SET status = 'occupied'
        WHERE table_id = @tableId AND is_active = 1
      `);

    await transaction.commit();
    transaction = null;

    return res.json({
      message: existing ? "Cap nhat don hang thanh cong." : "Luu don hang thanh cong.",
      orderId,
      tableId,
      status: "occupied"
    });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); }
      catch (rollbackError) { console.error("Rollback sync-order:", rollbackError); }
    }
    console.error("Loi sync-order:", error);
    return res.status(500).json({ error: "Khong the luu don hang vao SQL Server." });
  }
});

module.exports = router;
