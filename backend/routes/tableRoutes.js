
const { sql, connectDB } = require("../config/db");
const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

const tableReadRoles = ["admin", "waiter", "phucvu", "cashier", "thungan"];

router.use(authenticate);

function requireTableRead(req, res, next) {
    if (!tableReadRoles.includes(req.user.role)) {
        return res.status(403).json({
            error: "Bạn không có quyền xem thông tin bàn."
        });
    }

    return next();
}

// Lấy danh sách bàn, gồm bàn đang dùng chung đơn.
router.get("/", requireTableRead, async (req, res) => {
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
                    ) THEN 'occupied'
                    WHEN EXISTS (
                        SELECT 1
                        FROM dbo.table_order_links AS l
                        JOIN dbo.orders AS o ON o.order_id = l.order_id
                        WHERE l.table_id = t.table_id
                          AND o.status IN ('pending', 'serving')
                    ) THEN 'occupied'
                    WHEN t.status IN ('reserved', 'maintenance') THEN t.status
                    ELSE t.status
                END AS status,
                t.is_active
            FROM dbo.[tables] AS t
            ORDER BY t.table_id
        `);

        return res.json(result.recordset);
    } catch (error) {
        console.error("Lỗi lấy danh sách bàn:", error);
        return res.status(500).json({ error: "Không thể lấy danh sách bàn." });
    }
});

// Lay cac don dang mo kem chi tiet mon de frontend khong phu thuoc localStorage.
router.get("/active-orders", requireTableRead, async (req, res) => {
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
    const links = await pool.request().query(`
      SELECT l.order_id, l.table_id FROM dbo.table_order_links l
      JOIN dbo.orders o ON o.order_id = l.order_id
      WHERE o.status IN ('pending','serving')
    `);
    for (const order of byId.values()) order.linkedTableIds = [];
    for (const link of links.recordset) {
      if (byId.has(link.order_id)) byId.get(link.order_id).linkedTableIds.push(link.table_id);
    }
    res.json([...byId.values()]);
  } catch (error) {
    console.error("Loi lay don dang mo:", error);
    res.status(500).json({ error: "Khong the lay don dang mo." });
  }
});

// 2. XEM CHI TIET BAN
router.get("/:id", requireTableRead, async (req, res) => {
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
                WHEN EXISTS (SELECT 1 FROM dbo.table_order_links AS l JOIN dbo.orders AS lo ON lo.order_id = l.order_id WHERE l.table_id = t.table_id AND lo.status IN ('pending', 'serving')) THEN 'occupied'
             WHEN t.status IN ('reserved', 'maintenance') THEN t.status
                ELSE t.status
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
router.post("/", requireAdmin, async (req, res) => {
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

// 4. SUA THONG TIN BAN (cho phep doi ma neu chua co don hang)
router.put("/:id", requireAdmin, async (req, res) => {
    const oldId = String(req.params.id || "").trim();
    const { table_id, table_name, seats } = req.body || {};
    const newId = String(table_id || oldId).trim().toUpperCase();

    if (!oldId || !newId || newId.length > 10 ||
        typeof table_name !== "string" || !table_name.trim() ||
        table_name.length > 100 || !Number.isInteger(seats) || seats <= 0) {
        return res.status(400).json({ error: "Thong tin ban khong hop le" });
    }

    let transaction;
    try {
        const pool = await connectDB();
        transaction = new sql.Transaction(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        const current = await new sql.Request(transaction)
            .input("oldId", sql.VarChar(10), oldId)
            .query(`SELECT table_id FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK)
                    WHERE table_id = @oldId AND is_active = 1`);
        if (!current.recordset.length) {
            await transaction.rollback();
            return res.status(404).json({ error: "Khong tim thay ban dang hoat dong" });
        }

        if (newId !== oldId) {
            const duplicate = await new sql.Request(transaction)
                .input("newId", sql.VarChar(10), newId)
                .query(`SELECT table_id FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK)
                        WHERE table_id = @newId`);
            if (duplicate.recordset.length) {
                await transaction.rollback();
                return res.status(409).json({ error: "Ma ban moi da ton tai" });
            }

            // Khong doi khoa chinh khi da co don hang: tranh pha khoa ngoai.
            const linked = await new sql.Request(transaction)
                .input("oldId", sql.VarChar(10), oldId)
                .query(`SELECT TOP 1 order_id FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
                        WHERE table_id = @oldId`);
            if (linked.recordset.length) {
                await transaction.rollback();
                return res.status(409).json({
                    error: "Ban da co don hang. Chi co the sua ten ban, khong doi ma ban de bao toan lich su."
                });
            }
        }

        const updated = await new sql.Request(transaction)
            .input("oldId", sql.VarChar(10), oldId)
            .input("newId", sql.VarChar(10), newId)
            .input("name", sql.NVarChar(100), table_name.trim())
            .input("seats", sql.Int, seats)
            .query(`UPDATE dbo.[tables]
                    SET table_id = @newId, table_name = @name, seats = @seats
                    OUTPUT INSERTED.*
                    WHERE table_id = @oldId AND is_active = 1`);

        await transaction.commit();
        return res.json({ message: "Cap nhat ban thanh cong", table: updated.recordset[0] });
    } catch (error) {
        console.error("Loi sua ban:", error);
        if (transaction) {
            try { await transaction.rollback(); } catch (_) { /* giao dich da ket thuc */ }
        }
        return res.status(500).json({ error: "Khong the sua ma ban. Kiem tra rang buoc du lieu." });
    }
});


// 6. XOA VINH VIEN BAN - GIU LICH SU HOA DON VA CHO PHEP TAO LAI MA
// Luu cac don da ket thuc vao ban luu tru B_ARCHIVE, ghi ma ban goc vao note.
router.delete("/:id", requireAdmin, async (req, res) => {
  const tableId = String(req.params.id || "").trim();
  if (!tableId || tableId.length > 10 || tableId === "B_ARCHIVE") {
    return res.status(400).json({ error: "Ma ban khong hop le." });
  }

  let tx;
  try {
    const pool = await connectDB();
    tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    const current = await new sql.Request(tx)
      .input("id", sql.VarChar(10), tableId)
      .query(`SELECT table_id, status FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK)
              WHERE table_id = @id`);
    if (!current.recordset.length) {
      await tx.rollback(); tx = null;
      return res.status(404).json({ error: "Khong tim thay ban." });
    }

    // Khong xoa neu ban co don dang mo (ke ca don ghep).
    const active = await new sql.Request(tx)
      .input("id", sql.VarChar(10), tableId)
      .query(`SELECT TOP 1 o.order_id
              FROM dbo.orders o WITH (UPDLOCK, HOLDLOCK)
              WHERE o.table_id = @id AND o.status IN ('pending','serving')
              UNION ALL
              SELECT TOP 1 o.order_id
              FROM dbo.table_order_links l WITH (UPDLOCK, HOLDLOCK)
              JOIN dbo.orders o ON o.order_id = l.order_id
              WHERE l.table_id = @id AND o.status IN ('pending','serving')`);
    if (active.recordset.length || current.recordset[0].status === "occupied") {
      await tx.rollback(); tx = null;
      return res.status(409).json({ error: "Ban dang phuc vu hoac dang ghep don mo. Hay thanh toan truoc." });
    }

    // Ban luu tru la ban an, khong hien thi trong giao dien.
    await new sql.Request(tx).query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK) WHERE table_id = 'B_ARCHIVE')
        INSERT INTO dbo.[tables] (table_id, table_name, seats, status, is_active)
        VALUES ('B_ARCHIVE', N'Bàn lưu trữ lịch sử', 1, 'available', 0)
    `);

    // Luu lai ma ban goc de tra cuu lich su. Khong xoa orders, details, invoices.
    await new sql.Request(tx)
      .input("id", sql.VarChar(10), tableId)
      .query(`UPDATE dbo.orders
              SET note = LEFT(CONCAT(N'[Ban goc: ', @id, N'] ', COALESCE(note, N'')), 500),
                  table_id = 'B_ARCHIVE'
              WHERE table_id = @id AND status NOT IN ('pending','serving')`);

    // Xoa lien ket cua cac don da ket thuc tai ban nay.
    await new sql.Request(tx)
      .input("id", sql.VarChar(10), tableId)
      .query(`DELETE l FROM dbo.table_order_links l
              WHERE l.table_id = @id
                AND NOT EXISTS (
                  SELECT 1 FROM dbo.orders o WHERE o.order_id=l.order_id
                  AND o.status IN ('pending','serving'))`);

    const deleted = await new sql.Request(tx)
      .input("id", sql.VarChar(10), tableId)
      .query(`DELETE FROM dbo.[tables] OUTPUT DELETED.table_id
              WHERE table_id=@id
                AND NOT EXISTS (SELECT 1 FROM dbo.orders WHERE table_id=@id)
                AND NOT EXISTS (SELECT 1 FROM dbo.table_order_links WHERE table_id=@id)`);
    if (!deleted.recordset.length) {
      await tx.rollback(); tx = null;
      return res.status(409).json({ error: "Ban van con du lieu lien ket, khong the xoa." });
    }
    await tx.commit(); tx = null;
    return res.json({ message: "Da xoa vinh vien ban. Co the tao lai ma ban cu.", tableId });
  } catch (error) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    console.error("Loi xoa ban:", error);
    return res.status(500).json({ error: "Khong the xoa ban. Kiem tra rang buoc SQL Server." });
  }
});

// 7. LAY DON HANG HIEN TAI CUA BAN
router.get("/:id/current-order", requireTableRead, async (req, res) => {
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



// Chuyen ban: ban dich trong -> doi ban; ban dich co don -> don mon vao dich.
router.post("/transfer-order", requireAdmin, async (req, res) => {
  let tx;
  try {
    const { orderId, sourceId, destinationId } = req.body || {};
    if (![orderId, sourceId, destinationId].every(v => typeof v === "string" && v.trim()) ||
        orderId.length > 20 || sourceId.length > 10 || destinationId.length > 10 || sourceId === destinationId) {
      return res.status(400).json({ error: "Thong tin chuyen ban khong hop le." });
    }
    const pool = await connectDB();
    tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const tables = await new sql.Request(tx)
      .input("sourceId", sql.VarChar(10), sourceId)
      .input("destinationId", sql.VarChar(10), destinationId)
      .query(`SELECT table_id, status, is_active FROM dbo.[tables] WITH (UPDLOCK,HOLDLOCK)
              WHERE table_id IN (@sourceId,@destinationId) ORDER BY table_id`);
    if (tables.recordset.length !== 2 || tables.recordset.some(t => !t.is_active)) {
      await tx.rollback(); tx = null;
      return res.status(404).json({ error: "Ban nguon hoac dich khong hoat dong." });
    }
    const target = tables.recordset.find(t => t.table_id === destinationId);
    if (["reserved", "maintenance"].includes(target.status)) {
      await tx.rollback(); tx = null;
      return res.status(409).json({ error: "Ban dich dang duoc dat truoc hoac bao tri." });
    }
    // Khong tach ban da ghep; tranh de lai don chung o ban phu.
    const links = await new sql.Request(tx)
      .input("sourceId", sql.VarChar(10), sourceId)
      .input("destinationId", sql.VarChar(10), destinationId)
      .input("orderId", sql.VarChar(20), orderId)
      .query(`SELECT table_id FROM dbo.table_order_links WITH (UPDLOCK,HOLDLOCK)
              WHERE table_id IN (@sourceId,@destinationId) OR order_id=@orderId`);
    if (links.recordset.length) {
      await tx.rollback(); tx = null;
      return res.status(409).json({ error: "Ban dang ghep don. Hay thanh toan don chung truoc khi chuyen." });
    }
    const orders = await new sql.Request(tx)
      .input("sourceId", sql.VarChar(10), sourceId)
      .input("destinationId", sql.VarChar(10), destinationId)
      .query(`SELECT order_id, table_id FROM dbo.orders WITH (UPDLOCK,HOLDLOCK)
              WHERE table_id IN (@sourceId,@destinationId) AND status IN ('pending','serving')`);
    const sourceOrders = orders.recordset.filter(o => o.table_id === sourceId);
    const targetOrders = orders.recordset.filter(o => o.table_id === destinationId);
    if (sourceOrders.length !== 1 || sourceOrders[0].order_id !== orderId || targetOrders.length > 1) {
      await tx.rollback(); tx = null;
      return res.status(409).json({ error: "Don hang da thay doi. Hay tai lai trang." });
    }
    let destinationOrderId = null;
    if (targetOrders.length === 1) {
      destinationOrderId = targetOrders[0].order_id;
      // Giu nguyen cac dong mon va gia, chuyen sang don dich.
      await new sql.Request(tx)
        .input("orderId", sql.VarChar(20), orderId)
        .input("destinationOrderId", sql.VarChar(20), destinationOrderId)
        .query(`UPDATE dbo.order_details SET order_id=@destinationOrderId WHERE order_id=@orderId`);
      await new sql.Request(tx)
        .input("orderId", sql.VarChar(20), orderId)
        .input("destinationOrderId", sql.VarChar(20), destinationOrderId)
        .query(`UPDATE dbo.orders SET status='cancelled', note=LEFT(CONCAT(COALESCE(note,''), ' | Chuyen va gop vao ', @destinationOrderId),500) WHERE order_id=@orderId`);
    } else {
      await new sql.Request(tx)
        .input("orderId", sql.VarChar(20), orderId)
        .input("destinationId", sql.VarChar(10), destinationId)
        .query(`UPDATE dbo.orders SET table_id=@destinationId WHERE order_id=@orderId`);
      destinationOrderId = orderId;
    }
    await new sql.Request(tx)
      .input("sourceId", sql.VarChar(10), sourceId)
      .input("destinationId", sql.VarChar(10), destinationId)
      .query(`UPDATE dbo.[tables] SET status=CASE WHEN table_id=@sourceId THEN 'available' ELSE 'occupied' END
              WHERE table_id IN (@sourceId,@destinationId)`);
    await tx.commit(); tx = null;
    return res.json({ message: "Chuyen ban thanh cong.", sourceId, destinationId, orderId,
                      destinationOrderId, merged: targetOrders.length === 1 });
  } catch (error) {
    if (tx) try { await tx.rollback(); } catch (_) {}
    console.error("Loi chuyen ban:", error);
    return res.status(500).json({ error: "Khong the chuyen ban trong SQL Server." });
  }
});

// Gop hai ban DANG PHUC VU: giu don dich, ban nguon van phuc vu va goi mon vao don chung.
router.post("/join-table", requireAdmin, async (req, res) => {
  let tx;
  try {
    const { sourceId, destinationId, orderId, destinationOrderId } = req.body || {};
    if (![sourceId, destinationId, orderId, destinationOrderId].every(x => typeof x === "string" && x.trim()) ||
        sourceId === destinationId || orderId === destinationOrderId ||
        sourceId.length > 10 || destinationId.length > 10 || orderId.length > 20 || destinationOrderId.length > 20)
      return res.status(400).json({ error: "Thong tin gop ban khong hop le." });

    const pool = await connectDB();
    tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const tables = await new sql.Request(tx)
      .input("sourceId", sql.VarChar(10), sourceId)
      .input("destinationId", sql.VarChar(10), destinationId)
      .query(`SELECT table_id,status,is_active FROM dbo.[tables] WITH (UPDLOCK,HOLDLOCK)
              WHERE table_id IN (@sourceId,@destinationId) ORDER BY table_id`);
    if (tables.recordset.length !== 2 || tables.recordset.some(t => !t.is_active || t.status !== 'occupied')) {
      await tx.rollback(); tx = null;
      return res.status(409).json({ error: "Hai ban phai dang phuc vu. Hay tai lai." });
    }

    const orders = await new sql.Request(tx)
      .input("sourceId", sql.VarChar(10), sourceId)
      .input("destinationId", sql.VarChar(10), destinationId)
      .query(`SELECT order_id,table_id FROM dbo.orders WITH (UPDLOCK,HOLDLOCK)
              WHERE table_id IN (@sourceId,@destinationId) AND status IN ('pending','serving')`);
    if (orders.recordset.length !== 2 ||
        !orders.recordset.some(o => o.order_id === orderId && o.table_id === sourceId) ||
        !orders.recordset.some(o => o.order_id === destinationOrderId && o.table_id === destinationId)) {
      await tx.rollback(); tx = null;
      return res.status(409).json({ error: "Don hang da thay doi. Hay tai lai trang." });
    }

    // Ban nguon/dich khong duoc la ban phu cua nhom khac.
    const conflicts = await new sql.Request(tx)
      .input("sourceId", sql.VarChar(10), sourceId)
      .input("destinationId", sql.VarChar(10), destinationId)
      .query(`SELECT table_id FROM dbo.table_order_links WITH (UPDLOCK,HOLDLOCK)
              WHERE table_id IN (@sourceId,@destinationId)`);
    if (conflicts.recordset.length) {
      await tx.rollback(); tx = null;
      return res.status(409).json({ error: "Mot trong hai ban da la ban phu cua nhom khac." });
    }

    // Chuyen cac ban phu (neu co) cua nguon sang don dich.
    await new sql.Request(tx)
      .input("orderId", sql.VarChar(20), orderId)
      .input("destinationOrderId", sql.VarChar(20), destinationOrderId)
      .query(`UPDATE dbo.table_order_links SET order_id=@destinationOrderId WHERE order_id=@orderId`);

    // Toan bo mon cua don nguon duoc chuyen vao don dich.
    await new sql.Request(tx)
      .input("orderId", sql.VarChar(20), orderId)
      .input("destinationOrderId", sql.VarChar(20), destinationOrderId)
      .query(`UPDATE dbo.order_details SET order_id=@destinationOrderId WHERE order_id=@orderId`);

    // Khong xoa don nguon de giu lich su, nhung dong don de chi con mot don mo.
    await new sql.Request(tx)
      .input("orderId", sql.VarChar(20), orderId)
      .query(`UPDATE dbo.orders SET status='cancelled' WHERE order_id=@orderId`);

    // Ban nguon van hien "dang phuc vu", lien ket vao don dich.
    await new sql.Request(tx)
      .input("sourceId", sql.VarChar(10), sourceId)
      .input("destinationOrderId", sql.VarChar(20), destinationOrderId)
      .query(`INSERT INTO dbo.table_order_links (table_id,order_id) VALUES (@sourceId,@destinationOrderId)`);
    await new sql.Request(tx)
      .input("sourceId", sql.VarChar(10), sourceId)
      .input("destinationId", sql.VarChar(10), destinationId)
      .query(`UPDATE dbo.[tables] SET status='occupied' WHERE table_id IN (@sourceId,@destinationId)`);

    await tx.commit(); tx = null;
    return res.json({ message: "Gop ban thanh cong.", sourceId, destinationId, destinationOrderId });
  } catch (e) {
    if (tx) try { await tx.rollback(); } catch (_) {}
    console.error("Loi gop ban:", e);
    return res.status(500).json({ error: "Khong the gop ban. Kiem tra SQL Server va bang table_order_links." });
  }
});

router.post("/merge-orders", requireAdmin, async (req, res) => {
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

router.post("/pay-order", requireAdmin, async (req, res) => {
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

    // Thanh toan don chung: giai phong tat ca ban ghep.
    const linkedTables = await new sql.Request(transaction)
      .input("orderId",sql.VarChar(20),orderId)
      .query(`DELETE FROM dbo.table_order_links OUTPUT DELETED.table_id WHERE order_id=@orderId`);
    for (const linked of linkedTables.recordset) {
      await new sql.Request(transaction)
        .input("linkedId",sql.VarChar(10),linked.table_id)
        .query(`UPDATE dbo.[tables] SET status='available' WHERE table_id=@linkedId`);
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
router.post("/sync-order", requireAdmin, async (req, res) => {
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

// DOI TRANG THAI BAN (khong cho doi ban dang co don mo)
router.patch("/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!["available", "reserved", "maintenance"].includes(status)) {
      return res.status(400).json({ error: "Trang thai ban khong hop le." });
    }
    const pool = await connectDB();
    const result = await pool.request()
      .input("id", sql.VarChar(10), req.params.id)
      .input("status", sql.VarChar(20), status)
      .query(`
        UPDATE t SET status = @status
        OUTPUT INSERTED.table_id, INSERTED.table_name, INSERTED.seats,
               INSERTED.status, INSERTED.is_active
        FROM dbo.[tables] AS t
        WHERE t.table_id = @id AND t.is_active = 1
          AND NOT EXISTS (
            SELECT 1 FROM dbo.orders AS o
            WHERE o.table_id = t.table_id
              AND o.status IN ('pending', 'serving')
          )
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.table_order_links AS l
            JOIN dbo.orders AS o ON o.order_id = l.order_id
            WHERE l.table_id = t.table_id
              AND o.status IN ('pending', 'serving')
          )
      `);
    if (!result.recordset.length) {
      return res.status(409).json({ error: "Ban khong ton tai, da ngung hoat dong hoac dang co don hang." });
    }
    return res.json({ message: "Doi trang thai ban thanh cong.", table: result.recordset[0] });
  } catch (error) {
    console.error("Loi doi trang thai ban:", error);
    return res.status(500).json({ error: "Khong the doi trang thai ban." });
  }
});

module.exports = router;