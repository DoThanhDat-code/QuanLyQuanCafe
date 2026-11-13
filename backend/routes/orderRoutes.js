
const express = require("express");
const jwt = require("jsonwebtoken");
const { sql, connectDB } = require("../config/db");

const router = express.Router();

const createOrderRoles = new Set([
    "admin",
    "manager",
    "phucvu",
    "waiter"
]);

const viewOrderRoles = new Set([
    "admin",
    "manager",
    "phucvu",
    "thungan",
    "waiter"
]);

const addOrderItemRoles = new Set([
    "admin",
    "manager",
    "phucvu",
    "waiter"
]);

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

async function requireOrdersView(req, res, next) {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Chua dang nhap"
        });
    }

    let decoded;

    try {
        decoded = jwt.verify(
            authorization.slice(7),
            process.env.JWT_SECRET,
            { algorithms: ["HS256"] }
        );
    } catch (error) {
        return res.status(401).json({
            error: "Token khong hop le hoac da het han"
        });
    }

    if (
        typeof decoded.userId !== "string" ||
        !decoded.userId ||
        decoded.userId.length > 10
    ) {
        return res.status(401).json({
            error: "Thong tin dang nhap khong hop le"
        });
    }

    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input("userId", sql.VarChar(10), decoded.userId)
            .query(`
                SELECT user_id, role
                FROM dbo.users
                WHERE user_id = @userId
                  AND is_active = 1
            `);

        const user = result.recordset[0];

        if (!user) {
            return res.status(403).json({
                error: "Tai khoan khong hoat dong"
            });
        }

        if (!viewOrderRoles.has(user.role)) {
            return res.status(403).json({
                error: "Khong co quyen xem don hang"
            });
        }

        req.orderUser = user;
        next();
    } catch (error) {
        console.error("Loi xac thuc Orders:", error);

        return res.status(500).json({
            error: "Khong the kiem tra quyen truy cap"
        });
    }
}

router.get("/", requireOrdersView, async (req, res) => {
    try {
        const pool = await connectDB();

        const result = await pool.request().query(`
            SELECT
                o.order_id,
                o.table_id,
                o.employee_id,
                o.order_date,
                o.status,
                o.note,
                o.created_at,
                COALESCE(
                    SUM(
                        CAST(d.quantity AS DECIMAL(18, 0)) *
                        d.unit_price
                    ),
                    0
                ) AS total_amount
            FROM dbo.orders AS o
            LEFT JOIN dbo.order_details AS d
                ON o.order_id = d.order_id
            GROUP BY
                o.order_id,
                o.table_id,
                o.employee_id,
                o.order_date,
                o.status,
                o.note,
                o.created_at
            ORDER BY
                o.created_at DESC,
                o.order_id DESC
        `);

        return res.status(200).json(result.recordset);
    } catch (error) {
        console.error("Loi lay danh sach don hang:", error);

        return res.status(500).json({
            error: "Khong the lay danh sach don hang"
        });
    }
});


router.get("/active", requireOrdersView, async (req, res) => {
    const tableId = req.query.tableId;

    if (
        typeof tableId !== "string" ||
        !tableId.trim() ||
        tableId.trim().length > 10
    ) {
        return res.status(400).json({
            error: "Mã bàn không hợp lệ"
        });
    }

    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input("tableId", sql.VarChar(10), tableId.trim())
            .query(`
                SELECT TOP (1)
                    o.order_id,
                    o.table_id,
                    t.table_name,
                    o.employee_id,
                    o.order_date,
                    o.status,
                    o.note,
                    o.created_at,
                    totals.total_items,
                    totals.total_quantity,
                    totals.total_amount
                FROM dbo.orders AS o
                INNER JOIN dbo.[tables] AS t
                    ON o.table_id = t.table_id
                OUTER APPLY (
                    SELECT
                        COUNT(*) AS total_items,
                        COALESCE(
                            SUM(CAST(d.quantity AS BIGINT)),
                            0
                        ) AS total_quantity,
                        COALESCE(
                            SUM(
                                CAST(d.quantity AS DECIMAL(18,0)) *
                                CAST(d.unit_price AS DECIMAL(18,0))
                            ),
                            0
                        ) AS total_amount
                    FROM dbo.order_details AS d
                    WHERE d.order_id = o.order_id
                ) AS totals
                WHERE o.table_id = @tableId
                  AND o.status IN ('pending', 'serving')
                ORDER BY o.created_at DESC, o.order_id DESC
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                error: "Bàn không có đơn hàng đang hoạt động"
            });
        }

        return res.status(200).json({
            order: result.recordset[0]
        });
    } catch (error) {
        console.error("Lỗi lấy đơn đang hoạt động:", error);

        return res.status(500).json({
            error: "Không thể lấy đơn hàng đang hoạt động"
        });
    }
});



router.get("/:id", requireOrdersView, async (req, res) => {
    const orderId = req.params.id;

    if (
        typeof orderId !== "string" ||
        !orderId.trim() ||
        orderId.trim().length > 20
    ) {
        return res.status(400).json({
            error: "Mã đơn hàng không hợp lệ"
        });
    }

    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT
                    o.order_id,
                    o.table_id,
                    t.table_name,
                    o.employee_id,
                    e.full_name AS employee_name,
                    o.order_date,
                    o.status,
                    o.note AS order_note,
                    o.created_at,
                    d.order_detail_id,
                    d.product_id,
                    p.product_name,
                    d.quantity,
                    d.unit_price,
                    d.note AS item_note,
                    CAST(d.quantity AS DECIMAL(18,0)) *
                    CAST(d.unit_price AS DECIMAL(18,0)) AS line_total,
                    COUNT(d.order_detail_id) OVER (
                        PARTITION BY o.order_id
                    ) AS total_items,
                    COALESCE(
                        SUM(CAST(d.quantity AS BIGINT)) OVER (
                            PARTITION BY o.order_id
                        ),
                        0
                    ) AS total_quantity,
                    COALESCE(
                        SUM(
                            CAST(d.quantity AS DECIMAL(18,0)) *
                            CAST(d.unit_price AS DECIMAL(18,0))
                        ) OVER (
                            PARTITION BY o.order_id
                        ),
                        0
                    ) AS total_amount
                FROM dbo.orders AS o
                LEFT JOIN dbo.[tables] AS t
                    ON o.table_id = t.table_id
                LEFT JOIN dbo.employees AS e
                    ON o.employee_id = e.employee_id
                LEFT JOIN dbo.order_details AS d
                    ON o.order_id = d.order_id
                LEFT JOIN dbo.products AS p
                    ON d.product_id = p.product_id
                WHERE o.order_id = @orderId
                ORDER BY d.order_detail_id
            `);

        const rows = result.recordset;

        if (rows.length === 0) {
            return res.status(404).json({
                error: "Đơn hàng không tồn tại"
            });
        }

        const first = rows[0];

        const items = rows
            .filter(row => row.order_detail_id !== null)
            .map(row => ({
                order_detail_id: row.order_detail_id,
                product_id: row.product_id,
                product_name: row.product_name,
                quantity: row.quantity,
                unit_price: row.unit_price,
                line_total: row.line_total,
                note: row.item_note
            }));

        return res.status(200).json({
            order: {
                order_id: first.order_id,
                table_id: first.table_id,
                table_name: first.table_name,
                employee_id: first.employee_id,
                employee_name: first.employee_name,
                order_date: first.order_date,
                status: first.status,
                note: first.order_note,
                created_at: first.created_at
            },
            items,
            total_items: first.total_items,
            total_quantity: first.total_quantity,
            total_amount: first.total_amount
        });
    } catch (error) {
        console.error("Lỗi lấy chi tiết đơn hàng:", error);

        return res.status(500).json({
            error: "Không thể lấy chi tiết đơn hàng"
        });
    }
});



router.get("/:id/summary", requireOrdersView, async (req, res) => {
    const orderId = req.params.id;

    if (
        typeof orderId !== "string" ||
        !orderId.trim() ||
        orderId.trim().length > 20
    ) {
        return res.status(400).json({
            error: "Ma don hang khong hop le"
        });
    }

    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT
                    o.order_id,
                    o.table_id,
                    t.table_name,
                    o.employee_id,
                    e.full_name AS employee_name,
                    o.order_date,
                    o.status,
                    o.note AS order_note,
                    o.created_at,
                    d.order_detail_id,
                    d.product_id,
                    p.product_name,
                    d.quantity,
                    d.unit_price,
                    d.note AS item_note,
                    CAST(d.quantity AS DECIMAL(18,0)) *
                    CAST(d.unit_price AS DECIMAL(18,0))
                        AS line_total,
                    COUNT(d.order_detail_id) OVER (
                        PARTITION BY o.order_id
                    ) AS total_items,
                    COALESCE(
                        SUM(CAST(d.quantity AS BIGINT)) OVER (
                            PARTITION BY o.order_id
                        ),
                        0
                    ) AS total_quantity,
                    COALESCE(
                        SUM(
                            CAST(d.quantity AS DECIMAL(18,0)) *
                            CAST(d.unit_price AS DECIMAL(18,0))
                        ) OVER (
                            PARTITION BY o.order_id
                        ),
                        0
                    ) AS total_amount
                FROM dbo.orders AS o
                LEFT JOIN dbo.[tables] AS t
                    ON o.table_id = t.table_id
                LEFT JOIN dbo.employees AS e
                    ON o.employee_id = e.employee_id
                LEFT JOIN dbo.order_details AS d
                    ON o.order_id = d.order_id
                LEFT JOIN dbo.products AS p
                    ON d.product_id = p.product_id
                WHERE o.order_id = @orderId
                ORDER BY d.order_detail_id;
            `);

        const rows = result.recordset;

        if (rows.length === 0) {
            return res.status(404).json({
                error: "Don hang khong ton tai"
            });
        }

        const first = rows[0];

        const items = rows
            .filter(row => row.order_detail_id !== null)
            .map(row => ({
                order_detail_id: row.order_detail_id,
                product_id: row.product_id,
                product_name: row.product_name,
                quantity: row.quantity,
                unit_price: row.unit_price,
                line_total: row.line_total,
                note: row.item_note
            }));

        return res.status(200).json({
            order: {
                order_id: first.order_id,
                table_id: first.table_id,
                table_name: first.table_name,
                employee_id: first.employee_id,
                employee_name: first.employee_name,
                order_date: first.order_date,
                status: first.status,
                note: first.order_note,
                created_at: first.created_at
            },
            items,
            total_items: first.total_items,
            total_quantity: first.total_quantity,
            total_amount: first.total_amount
        });
    } catch (error) {
        console.error("Loi lay tam tinh don hang:", error);

        return res.status(500).json({
            error: "Khong the lay tam tinh don hang"
        });
    }
});


router.patch("/:id/status", async (req, res) => {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Chưa đăng nhập"
        });
    }

    let decoded;

    try {
        decoded = jwt.verify(
            authorization.slice(7),
            process.env.JWT_SECRET,
            { algorithms: ["HS256"] }
        );
    } catch (error) {
        return res.status(401).json({
            error: "Token không hợp lệ hoặc đã hết hạn"
        });
    }

    const orderId = req.params.id;
    const { status } = req.body || {};

    if (
        typeof orderId !== "string" ||
        !orderId.trim() ||
        orderId.trim().length > 20
    ) {
        return res.status(400).json({
            error: "Mã đơn hàng không hợp lệ"
        });
    }

    if (status !== "serving") {
        return res.status(400).json({
            error: "Chỉ hỗ trợ chuyển từ đang chờ xử lý sang đang phục vụ"
        });
    }

    if (
        typeof decoded.userId !== "string" ||
        !decoded.userId ||
        decoded.userId.length > 10
    ) {
        return res.status(401).json({
            error: "Thông tin đăng nhập không hợp lệ"
        });
    }

    let transaction;
    let transactionStarted = false;

    try {
        const pool = await connectDB();

        const userResult = await pool.request()
            .input("userId", sql.VarChar(10), decoded.userId)
            .query(`
                SELECT u.role
                FROM dbo.users u
                INNER JOIN dbo.employees e
                    ON u.employee_id = e.employee_id
                WHERE u.user_id = @userId
                  AND u.is_active = 1
                  AND e.is_active = 1
            `);

        const user = userResult.recordset[0];

        if (!user || !createOrderRoles.has(user.role)) {
            return res.status(403).json({
                error: "Tài khoản không có quyền chuyển trạng thái đơn hàng"
            });
        }

        transaction = new sql.Transaction(pool);

        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        transactionStarted = true;

        const orderResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT order_id, table_id, status
                FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
                WHERE order_id = @orderId
            `);

        const order = orderResult.recordset[0];

        if (!order) {
            throw createError(404, "Đơn hàng không tồn tại");
        }

        if (order.status !== "pending") {
            throw createError(
                409,
                "Chỉ đơn đang chờ xử lý mới được chuyển sang đang phục vụ"
            );
        }

        const updateResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                UPDATE dbo.orders
                SET status = 'serving'
                OUTPUT
                    INSERTED.order_id,
                    INSERTED.table_id,
                    INSERTED.employee_id,
                    INSERTED.status,
                    INSERTED.order_date
                WHERE order_id = @orderId
                  AND status = 'pending'
            `);

        if (updateResult.recordset.length !== 1) {
            throw createError(
                409,
                "Không thể chuyển trạng thái đơn hàng"
            );
        }

        await transaction.commit();
        transactionStarted = false;

        res.status(200).json({
            message: "Chuyển trạng thái đơn hàng thành công",
            order: updateResult.recordset[0]
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Lỗi rollback:", rollbackError.message);
            }
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                error: error.message
            });
        }

        console.error("Lỗi chuyển trạng thái đơn hàng:", error);

        res.status(500).json({
            error: "Không thể chuyển trạng thái đơn hàng"
        });
    }
});

router.post("/", async (req, res) => {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Chưa đăng nhập"
        });
    }

    let decoded;

    try {
        decoded = jwt.verify(
            authorization.slice(7),
            process.env.JWT_SECRET,
            { algorithms: ["HS256"] }
        );
    } catch (error) {
        return res.status(401).json({
            error: "Token không hợp lệ hoặc đã hết hạn"
        });
    }

    const { table_id, items, note } = req.body || {};

    if (
        typeof table_id !== "string" ||
        !table_id.trim() ||
        table_id.trim().length > 10
    ) {
        return res.status(400).json({
            error: "Mã bàn không hợp lệ"
        });
    }

    if (
        note !== undefined &&
        note !== null &&
        (typeof note !== "string" || note.length > 500)
    ) {
        return res.status(400).json({
            error: "Ghi chú đơn hàng không hợp lệ"
        });
    }

    if (
        !Array.isArray(items) ||
        items.length === 0 ||
        items.length > 100
    ) {
        return res.status(400).json({
            error: "Danh sách món không hợp lệ"
        });
    }

    for (const item of items) {
        if (
            !item ||
            typeof item.product_id !== "string" ||
            !item.product_id.trim() ||
            item.product_id.trim().length > 10 ||
            !Number.isInteger(item.quantity) ||
            item.quantity <= 0 ||
            item.quantity > 2147483647 ||
            (
                item.note !== undefined &&
                item.note !== null &&
                (
                    typeof item.note !== "string" ||
                    item.note.length > 255
                )
            )
        ) {
            return res.status(400).json({
                error: "Thông tin món không hợp lệ"
            });
        }
    }

    let transaction;
    let transactionStarted = false;

    try {
        const pool = await connectDB();

        if (
            typeof decoded.userId !== "string" ||
            !decoded.userId ||
            decoded.userId.length > 10
        ) {
            return res.status(401).json({
                error: "Thông tin đăng nhập không hợp lệ"
            });
        }

        const userResult = await pool.request()
            .input("userId", sql.VarChar(10), decoded.userId)
            .query(`
                SELECT
                    u.user_id,
                    u.employee_id,
                    u.role
                FROM dbo.users u
                INNER JOIN dbo.employees e
                    ON u.employee_id = e.employee_id
                WHERE u.user_id = @userId
                  AND u.is_active = 1
                  AND e.is_active = 1
            `);

        const user = userResult.recordset[0];

        if (!user) {
            return res.status(403).json({
                error: "Tài khoản chưa liên kết với nhân viên đang hoạt động"
            });
        }

        if (!createOrderRoles.has(user.role)) {
            return res.status(403).json({
                error: "Tài khoản không có quyền tạo đơn hàng"
            });
        }

        transaction = new sql.Transaction(pool);

        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        transactionStarted = true;

        const tableId = table_id.trim();

        const tableResult = await new sql.Request(transaction)
            .input("tableId", sql.VarChar(10), tableId)
            .query(`
                SELECT
                    table_id,
                    status,
                    is_active
                FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK)
                WHERE table_id = @tableId
            `);

        const table = tableResult.recordset[0];

        if (!table) {
            throw createError(404, "Bàn không tồn tại");
        }

        if (!table.is_active) {
            throw createError(409, "Bàn không còn hoạt động");
        }

        if (table.status !== "available") {
            throw createError(409, "Bàn không ở trạng thái trống");
        }

        const activeOrderResult = await new sql.Request(transaction)
            .input("tableId", sql.VarChar(10), tableId)
            .query(`
                SELECT TOP 1 order_id
                FROM dbo.orders
                WHERE table_id = @tableId
                  AND status IN ('pending', 'serving')
            `);

        if (activeOrderResult.recordset.length > 0) {
            throw createError(409, "Bàn đang có đơn hàng chưa hoàn tất");
        }

        const lockResult = await new sql.Request(transaction).query(`
            DECLARE @lockResult INT;

            EXEC @lockResult = sys.sp_getapplock
                @Resource = N'MOC_COFFEE_ORDER_ID',
                @LockMode = 'Exclusive',
                @LockOwner = 'Transaction',
                @LockTimeout = 10000;

            SELECT @lockResult AS lock_result;
        `);

        if (lockResult.recordset[0].lock_result < 0) {
            throw createError(503, "Không thể cấp mã đơn hàng");
        }

        const numberResult = await new sql.Request(transaction).query(`
            SELECT
                ISNULL(
                    MAX(
                        TRY_CONVERT(
                            BIGINT,
                            SUBSTRING(order_id, 4, 17)
                        )
                    ),
                    0
                ) + 1 AS next_number
            FROM dbo.orders
            WHERE order_id LIKE 'ORD[0-9]%'
        `);

        const nextNumber = Number(
            numberResult.recordset[0].next_number
        );

        if (!Number.isSafeInteger(nextNumber)) {
            throw createError(500, "Không thể tạo mã đơn hàng");
        }

        const orderId = "ORD" + String(nextNumber).padStart(3, "0");

        if (orderId.length > 20) {
            throw createError(500, "Mã đơn hàng vượt quá giới hạn");
        }

        const orderResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId)
            .input("tableId", sql.VarChar(10), tableId)
            .input("employeeId", sql.VarChar(10), user.employee_id)
            .input("note", sql.NVarChar(500), note || null)
            .query(`
                INSERT INTO dbo.orders (
                    order_id,
                    table_id,
                    employee_id,
                    order_date,
                    status,
                    note,
                    created_at
                )
                OUTPUT
                    INSERTED.order_id,
                    INSERTED.table_id,
                    INSERTED.employee_id,
                    INSERTED.order_date,
                    INSERTED.status,
                    INSERTED.note,
                    INSERTED.created_at
                VALUES (
                    @orderId,
                    @tableId,
                    @employeeId,
                    SYSDATETIME(),
                    'pending',
                    @note,
                    SYSDATETIME()
                )
            `);

        for (const item of items) {
            const detailResult = await new sql.Request(transaction)
                .input("orderId", sql.VarChar(20), orderId)
                .input(
                    "productId",
                    sql.VarChar(10),
                    item.product_id.trim()
                )
                .input("quantity", sql.Int, item.quantity)
                .input(
                    "note",
                    sql.NVarChar(255),
                    item.note || null
                )
                .query(`
                    INSERT INTO dbo.order_details (
                        order_id,
                        product_id,
                        quantity,
                        unit_price,
                        note
                    )
                    SELECT
                        @orderId,
                        product_id,
                        @quantity,
                        price,
                        @note
                    FROM dbo.products
                    WHERE product_id = @productId
                      AND is_active = 1
                `);

            if (detailResult.rowsAffected[0] !== 1) {
                throw createError(
                    400,
                    "Sản phẩm không tồn tại hoặc đã ngừng kinh doanh"
                );
            }
        }

        const updateTableResult = await new sql.Request(transaction)
            .input("tableId", sql.VarChar(10), tableId)
            .query(`
                UPDATE dbo.[tables]
                SET status = 'occupied'
                WHERE table_id = @tableId
                  AND status = 'available'
                  AND is_active = 1
            `);

        if (updateTableResult.rowsAffected[0] !== 1) {
            throw createError(409, "Không thể cập nhật trạng thái bàn");
        }

        const totalResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId)
            .query(`
                SELECT
                    SUM(
                        CAST(quantity AS DECIMAL(18, 0)) *
                        CAST(unit_price AS DECIMAL(18, 0))
                    ) AS total_amount
                FROM dbo.order_details
                WHERE order_id = @orderId
            `);

        await transaction.commit();
        transactionStarted = false;

        res.status(201).json({
            message: "Tạo đơn hàng thành công",
            order: orderResult.recordset[0],
            total_amount: totalResult.recordset[0].total_amount
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Lỗi rollback:", rollbackError.message);
            }
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                error: error.message
            });
        }

        if (error.number === 2627 || error.number === 2601) {
            return res.status(409).json({
                error: "Mã đơn hàng đã tồn tại"
            });
        }

        console.error("Lỗi tạo đơn hàng:", error);

        res.status(500).json({
            error: "Không thể tạo đơn hàng"
        });
    }
});

router.patch("/:id/cancel", async (req, res) => {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Chưa đăng nhập"
        });
    }

    let decoded;

    try {
        decoded = jwt.verify(
            authorization.slice(7),
            process.env.JWT_SECRET,
            { algorithms: ["HS256"] }
        );
    } catch (error) {
        return res.status(401).json({
            error: "Token không hợp lệ hoặc đã hết hạn"
        });
    }

    const orderId = req.params.id;

    if (
        typeof orderId !== "string" ||
        !orderId.trim() ||
        orderId.trim().length > 20
    ) {
        return res.status(400).json({
            error: "Mã đơn hàng không hợp lệ"
        });
    }

    if (
        typeof decoded.userId !== "string" ||
        !decoded.userId ||
        decoded.userId.length > 10
    ) {
        return res.status(401).json({
            error: "Thông tin đăng nhập không hợp lệ"
        });
    }

    let transaction;
    let transactionStarted = false;

    try {
        const pool = await connectDB();

        const userResult = await pool.request()
            .input("userId", sql.VarChar(10), decoded.userId)
            .query(`
                SELECT u.role
                FROM dbo.users u
                INNER JOIN dbo.employees e
                    ON u.employee_id = e.employee_id
                WHERE u.user_id = @userId
                  AND u.is_active = 1
                  AND e.is_active = 1
            `);

        const user = userResult.recordset[0];

        if (!user || !createOrderRoles.has(user.role)) {
            return res.status(403).json({
                error: "Tài khoản không có quyền hủy đơn hàng"
            });
        }

        const initialResult = await pool.request()
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT table_id
                FROM dbo.orders
                WHERE order_id = @orderId
            `);

        const initialOrder = initialResult.recordset[0];

        if (!initialOrder) {
            return res.status(404).json({
                error: "Đơn hàng không tồn tại"
            });
        }

        transaction = new sql.Transaction(pool);

        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        transactionStarted = true;
await new sql.Request(transaction)
    .input("orderId", sql.VarChar(20), orderId.trim())
    .query(`
        UPDATE t
        SET status = 'available'
        FROM dbo.[tables] AS t
        JOIN dbo.table_order_links AS l ON l.table_id = t.table_id
        WHERE l.order_id = @orderId
          AND t.status = 'occupied'
          AND NOT EXISTS (
              SELECT 1
              FROM dbo.orders AS o
              WHERE o.table_id = t.table_id
                AND o.status IN ('pending', 'serving')
          );

        DELETE FROM dbo.table_order_links
        WHERE order_id = @orderId;
    `);
        const tableResult = await new sql.Request(transaction)
            .input("tableId", sql.VarChar(10), initialOrder.table_id)
            .query(`
                SELECT table_id, status
                FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK)
                WHERE table_id = @tableId
            `);

        if (!tableResult.recordset[0]) {
            throw createError(409, "Bàn của đơn hàng không tồn tại");
        }

        const orderResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT order_id, table_id, status
                FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
                WHERE order_id = @orderId
            `);

        const order = orderResult.recordset[0];

        if (!order) {
            throw createError(404, "Đơn hàng không tồn tại");
        }

        if (order.table_id !== initialOrder.table_id) {
            throw createError(409, "Thông tin bàn của đơn hàng đã thay đổi");
        }

        if (!["pending", "serving"].includes(order.status)) {
            throw createError(409, "Trạng thái đơn hàng không cho phép hủy");
        }

        if (order.status === "serving" && user.role !== "admin") {
            throw createError(403, "Chỉ admin được hủy đơn đang phục vụ");
        }

        const updateResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                UPDATE dbo.orders
                SET status = 'cancelled'
                OUTPUT
                    INSERTED.order_id,
                    INSERTED.table_id,
                    INSERTED.employee_id,
                    INSERTED.status,
                    INSERTED.order_date
                WHERE order_id = @orderId
                  AND status IN ('pending', 'serving')
            `);

        if (updateResult.recordset.length !== 1) {
            throw createError(409, "Không thể hủy đơn hàng");
        }

        const activeResult = await new sql.Request(transaction)
            .input("tableId", sql.VarChar(10), order.table_id)
            .query(`
                SELECT CASE WHEN EXISTS (
                    SELECT 1
                    FROM dbo.orders
                    WHERE table_id = @tableId
                      AND status IN ('pending', 'serving')
                ) THEN 1 ELSE 0 END AS has_active_order
            `);

        if (activeResult.recordset[0].has_active_order === 0) {
            await new sql.Request(transaction)
                .input("tableId", sql.VarChar(10), order.table_id)
                .query(`
                    UPDATE dbo.[tables]
                    SET status = 'available'
                    WHERE table_id = @tableId
                      AND status = 'occupied'
                `);
        }

        const tableAfterResult = await new sql.Request(transaction)
            .input("tableId", sql.VarChar(10), order.table_id)
            .query(`
                SELECT table_id, status
                FROM dbo.[tables]
                WHERE table_id = @tableId
            `);

        await transaction.commit();
        transactionStarted = false;

        res.status(200).json({
            message: "Hủy đơn hàng thành công",
            order: updateResult.recordset[0],
            table: tableAfterResult.recordset[0]
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Lỗi rollback:", rollbackError.message);
            }
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                error: error.message
            });
        }

        console.error("Lỗi hủy đơn hàng:", error);

        res.status(500).json({
            error: "Không thể hủy đơn hàng"
        });
    }
});


router.patch("/:id/pay", async (req, res) => {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Chưa đăng nhập"
        });
    }

    let decoded;

    try {
        decoded = jwt.verify(
            authorization.slice(7),
            process.env.JWT_SECRET,
            { algorithms: ["HS256"] }
        );
    } catch (error) {
        return res.status(401).json({
            error: "Token không hợp lệ hoặc đã hết hạn"
        });
    }

    const orderId = req.params.id;

    if (
        typeof orderId !== "string" ||
        !orderId.trim() ||
        orderId.trim().length > 20
    ) {
        return res.status(400).json({
            error: "Mã đơn hàng không hợp lệ"
        });
    }

    if (
        typeof decoded.userId !== "string" ||
        !decoded.userId ||
        decoded.userId.length > 10
    ) {
        return res.status(401).json({
            error: "Thông tin đăng nhập không hợp lệ"
        });
    }

    let transaction;
    let transactionStarted = false;

    try {
        const pool = await connectDB();

        const userResult = await pool.request()
            .input("userId", sql.VarChar(10), decoded.userId)
            .query(`
                SELECT
                    u.user_id,
                    u.role
                FROM dbo.users u
                LEFT JOIN dbo.employees e
                    ON u.employee_id = e.employee_id
                WHERE u.user_id = @userId
                  AND u.is_active = 1
                  AND (
                      u.role = 'admin'
                      OR (
                          u.role IN ('phucvu', 'waiter')
                          AND e.is_active = 1
                      )
                  )
            `);

        const user = userResult.recordset[0];

        if (
            !user ||
            !["admin", "phucvu", "waiter"].includes(user.role)
        ) {
            return res.status(403).json({
                error: "Tài khoản không có quyền thanh toán đơn hàng"
            });
        }

        const initialResult = await pool.request()
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT table_id
                FROM dbo.orders
                WHERE order_id = @orderId
            `);

        const initialOrder = initialResult.recordset[0];

        if (!initialOrder) {
            return res.status(404).json({
                error: "Đơn hàng không tồn tại"
            });
        }

        transaction = new sql.Transaction(pool);

        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        transactionStarted = true;

        const tableResult = await new sql.Request(transaction)
            .input("tableId", sql.VarChar(10), initialOrder.table_id)
            .query(`
                SELECT table_id, status
                FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK)
                WHERE table_id = @tableId
            `);

        if (!tableResult.recordset[0]) {
            throw createError(
                409,
                "Bàn của đơn hàng không tồn tại"
            );
        }

        const orderResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT
                    order_id,
                    table_id,
                    employee_id,
                    status
                FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
                WHERE order_id = @orderId
            `);

        const order = orderResult.recordset[0];

        if (!order) {
            throw createError(
                404,
                "Đơn hàng không tồn tại"
            );
        }

        if (order.table_id !== initialOrder.table_id) {
            throw createError(
                409,
                "Thông tin bàn của đơn hàng đã thay đổi"
            );
        }

        if (order.status !== "serving") {
            throw createError(
                409,
                "Đơn hàng không ở trạng thái được thanh toán"
            );
        }

        const totalResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT COALESCE(
                    SUM(
                        CAST(quantity AS DECIMAL(18, 0)) *
                        CAST(unit_price AS DECIMAL(18, 0))
                    ),
                    0
                ) AS total_amount
                FROM dbo.order_details
                WHERE order_id = @orderId
            `);

        const updateResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                UPDATE dbo.orders
                SET status = 'paid'
                OUTPUT
                    INSERTED.order_id,
                    INSERTED.table_id,
                    INSERTED.employee_id,
                    INSERTED.status,
                    INSERTED.order_date
                WHERE order_id = @orderId
                  AND status = 'serving'
            `);

        if (updateResult.recordset.length !== 1) {
            throw createError(
                409,
                "Không thể thanh toán đơn hàng"
            );
        }

        const activeResult = await new sql.Request(transaction)
            .input("tableId", sql.VarChar(10), order.table_id)
            .query(`
                SELECT CASE WHEN EXISTS (
                    SELECT 1
                    FROM dbo.orders
                    WHERE table_id = @tableId
                      AND status IN ('pending', 'serving')
                ) THEN 1 ELSE 0 END AS has_active_order
            `);

        if (activeResult.recordset[0].has_active_order === 0) {
            await new sql.Request(transaction)
                .input("tableId", sql.VarChar(10), order.table_id)
                .query(`
                    UPDATE dbo.[tables]
                    SET status = 'available'
                    WHERE table_id = @tableId
                      AND status = 'occupied'
                `);
        }
await new sql.Request(transaction)
    .input("orderId", sql.VarChar(20), orderId.trim())
    .query(`
        UPDATE t
        SET status = 'available'
        FROM dbo.[tables] AS t
        JOIN dbo.table_order_links AS l ON l.table_id = t.table_id
        WHERE l.order_id = @orderId
          AND t.status = 'occupied'
          AND NOT EXISTS (
              SELECT 1
              FROM dbo.orders AS o
              WHERE o.table_id = t.table_id
                AND o.status IN ('pending', 'serving')
          );

        DELETE FROM dbo.table_order_links
        WHERE order_id = @orderId;
    `);
        const tableAfterResult = await new sql.Request(transaction)
            .input("tableId", sql.VarChar(10), order.table_id)
            .query(`
                SELECT table_id, status
                FROM dbo.[tables]
                WHERE table_id = @tableId
            `);

        await transaction.commit();
        transactionStarted = false;

        return res.status(200).json({
            message: "Thanh toán đơn hàng thành công",
            order: updateResult.recordset[0],
            total_amount: totalResult.recordset[0].total_amount,
            table: tableAfterResult.recordset[0]
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error(
                    "Lỗi rollback:",
                    rollbackError.message
                );
            }
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                error: error.message
            });
        }

        console.error("Lỗi thanh toán đơn hàng:", error);

        return res.status(500).json({
            error: "Không thể thanh toán đơn hàng"
        });
    }
});


router.post("/:id/items", async (req, res) => {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Chua dang nhap"
        });
    }

    let decoded;

    try {
        decoded = jwt.verify(
            authorization.slice(7),
            process.env.JWT_SECRET,
            { algorithms: ["HS256"] }
        );
    } catch (error) {
        return res.status(401).json({
            error: "Token khong hop le hoac da het han"
        });
    }

    const orderId = req.params.id;
    const { items } = req.body || {};

    if (
        typeof orderId !== "string" ||
        !orderId.trim() ||
        orderId.length > 20
    ) {
        return res.status(400).json({
            error: "Ma don hang khong hop le"
        });
    }

    if (
        !Array.isArray(items) ||
        items.length === 0 ||
        items.length > 100
    ) {
        return res.status(400).json({
            error: "Danh sach mon khong hop le"
        });
    }

    for (const item of items) {
        if (
            !item ||
            typeof item.product_id !== "string" ||
            !item.product_id.trim() ||
            item.product_id.trim().length > 10 ||
            !Number.isInteger(item.quantity) ||
            item.quantity <= 0 ||
            item.quantity > 2147483647 ||
            (
                item.note !== undefined &&
                item.note !== null &&
                (
                    typeof item.note !== "string" ||
                    item.note.length > 255
                )
            )
        ) {
            return res.status(400).json({
                error: "Thong tin mon khong hop le"
            });
        }
    }

    if (
        typeof decoded.userId !== "string" ||
        !decoded.userId ||
        decoded.userId.length > 10
    ) {
        return res.status(401).json({
            error: "Thong tin dang nhap khong hop le"
        });
    }

    let transaction;
    let transactionStarted = false;

    try {
        const pool = await connectDB();

        const userResult = await pool.request()
            .input("userId", sql.VarChar(10), decoded.userId)
            .query(`
                SELECT
                    u.user_id,
                    u.role,
                    u.employee_id,
                    e.is_active AS employee_active
                FROM dbo.users AS u
                LEFT JOIN dbo.employees AS e
                    ON u.employee_id = e.employee_id
                WHERE u.user_id = @userId
                  AND u.is_active = 1
            `);

        const user = userResult.recordset[0];

        if (!user) {
            return res.status(403).json({
                error: "Tai khoan khong hoat dong"
            });
        }

        if (!addOrderItemRoles.has(user.role)) {
            return res.status(403).json({
                error: "Khong co quyen them mon"
            });
        }

        if (
            user.role !== "admin" &&
            (
                !user.employee_id ||
                !user.employee_active
            )
        ) {
            return res.status(403).json({
                error: "Tai khoan chua lien ket nhan vien hop le"
            });
        }

        transaction = new sql.Transaction(pool);

        await transaction.begin(
            sql.ISOLATION_LEVEL.SERIALIZABLE
        );

        transactionStarted = true;

        const orderResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT
                    o.order_id,
                    o.table_id,
                    o.status,
                    t.status AS table_status,
                    t.is_active AS table_active
                FROM dbo.orders AS o WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.tables AS t
                    ON o.table_id = t.table_id
                WHERE o.order_id = @orderId
            `);

        const order = orderResult.recordset[0];

        if (!order) {
            throw createError(
                404,
                "Don hang khong ton tai"
            );
        }

        if (
            order.status !== "pending" &&
            order.status !== "serving"
        ) {
            throw createError(
                409,
                "Don hang da ket thuc, khong the them mon"
            );
        }

        if (
            order.table_status !== "occupied" ||
            !order.table_active
        ) {
            throw createError(
                409,
                "Trang thai ban khong hop le"
            );
        }

        const addedItems = [];

        for (const item of items) {
            const detailResult = await new sql.Request(transaction)
                .input("orderId", sql.VarChar(20), order.order_id)
                .input(
                    "productId",
                    sql.VarChar(10),
                    item.product_id.trim()
                )
                .input("quantity", sql.Int, item.quantity)
                .input(
                    "note",
                    sql.NVarChar(255),
                    item.note || null
                )
                .query(`
                    INSERT INTO dbo.order_details (
                        order_id,
                        product_id,
                        quantity,
                        unit_price,
                        note
                    )
                    OUTPUT
                        INSERTED.order_detail_id,
                        INSERTED.order_id,
                        INSERTED.product_id,
                        INSERTED.quantity,
                        INSERTED.unit_price,
                        INSERTED.note
                    SELECT
                        @orderId,
                        p.product_id,
                        @quantity,
                        p.price,
                        @note
                    FROM dbo.products AS p WITH (HOLDLOCK)
                    WHERE p.product_id = @productId
                      AND p.is_active = 1
                      AND p.price >= 0
                `);

            if (detailResult.recordset.length !== 1) {
                throw createError(
                    400,
                    "San pham khong ton tai hoac da ngung ban"
                );
            }

            addedItems.push(detailResult.recordset[0]);
        }

        const totalResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), order.order_id)
            .query(`
                SELECT
                    COALESCE(
                        SUM(
                            CAST(quantity AS DECIMAL(18, 0)) *
                            unit_price
                        ),
                        0
                    ) AS total_amount
                FROM dbo.order_details
                WHERE order_id = @orderId
            `);

        const totalAmount =
            totalResult.recordset[0].total_amount;

        await transaction.commit();
        transactionStarted = false;

        return res.status(201).json({
            message: "Them mon thanh cong",
            order_id: order.order_id,
            table_id: order.table_id,
            status: order.status,
            added_items: addedItems,
            total_amount: totalAmount
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error(
                    "Loi rollback them mon:",
                    rollbackError.message
                );
            }
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                error: error.message
            });
        }

        if (
            error.number === 1205 ||
            error.number === 1222
        ) {
            return res.status(409).json({
                error: "Giao dich dang xung dot, vui long thu lai"
            });
        }

        console.error("Loi them mon:", error);

        return res.status(500).json({
            error: "Khong the them mon vao don"
        });
    }
});

router.patch("/:id/items/:itemId", async (req, res) => {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Chưa đăng nhập"
        });
    }

    let decoded;

    try {
        decoded = jwt.verify(
            authorization.slice(7),
            process.env.JWT_SECRET,
            { algorithms: ["HS256"] }
        );
    } catch (error) {
        return res.status(401).json({
            error: "Token không hợp lệ hoặc đã hết hạn"
        });
    }

    const orderId = req.params.id?.trim();
    const rawItemId = req.params.itemId;
    const itemId = Number(rawItemId);
    const quantity = req.body?.quantity;

    if (
        !orderId ||
        orderId.length > 20
    ) {
        return res.status(400).json({
            error: "Mã đơn hàng không hợp lệ"
        });
    }

    if (
        !/^[1-9]\d*$/.test(rawItemId) ||
        !Number.isSafeInteger(itemId) ||
        itemId > 2147483647
    ) {
        return res.status(400).json({
            error: "Mã chi tiết đơn hàng không hợp lệ"
        });
    }

    if (
        !Number.isInteger(quantity) ||
        quantity <= 0 ||
        quantity > 2147483647
    ) {
        return res.status(400).json({
            error: "Số lượng món không hợp lệ"
        });
    }

    if (
        typeof decoded.userId !== "string" ||
        !decoded.userId ||
        decoded.userId.length > 10
    ) {
        return res.status(401).json({
            error: "Thông tin đăng nhập không hợp lệ"
        });
    }

    let transaction;
    let transactionStarted = false;

    try {
        const pool = await connectDB();

        const userResult = await pool.request()
            .input("userId", sql.VarChar(10), decoded.userId)
            .query(`
                SELECT
                    u.user_id,
                    u.role
                FROM dbo.users u
                LEFT JOIN dbo.employees e
                    ON u.employee_id = e.employee_id
                WHERE u.user_id = @userId
                  AND u.is_active = 1
                  AND (
                      u.role = 'admin'
                      OR (
                          u.role = 'phucvu'
                          AND e.is_active = 1
                      )
                  )
            `);

        const user = userResult.recordset[0];

        if (!user) {
            return res.status(403).json({
                error: "Tài khoản không có quyền sửa món"
            });
        }

        const initialResult = await pool.request()
            .input("orderId", sql.VarChar(20), orderId)
            .query(`
                SELECT table_id
                FROM dbo.orders
                WHERE order_id = @orderId
            `);

        const initialOrder = initialResult.recordset[0];

        if (!initialOrder) {
            return res.status(404).json({
                error: "Đơn hàng không tồn tại"
            });
        }

        transaction = new sql.Transaction(pool);

        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        transactionStarted = true;

        const tableResult = await new sql.Request(transaction)
            .input("tableId", sql.VarChar(10), initialOrder.table_id)
            .query(`
                SELECT table_id, status
                FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK)
                WHERE table_id = @tableId
            `);

        const table = tableResult.recordset[0];

        if (!table) {
            throw createError(
                409,
                "Bàn của đơn hàng không tồn tại"
            );
        }

        const orderResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId)
            .query(`
                SELECT
                    order_id,
                    table_id,
                    status
                FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
                WHERE order_id = @orderId
            `);

        const order = orderResult.recordset[0];

        if (!order) {
            throw createError(
                404,
                "Đơn hàng không tồn tại"
            );
        }

        if (order.table_id !== initialOrder.table_id) {
            throw createError(
                409,
                "Thông tin bàn của đơn hàng đã thay đổi"
            );
        }

        if (order.status !== "pending") {
            throw createError(
                409,
                "Chỉ được sửa số lượng món khi đơn đang pending"
            );
        }

        if (table.status !== "occupied") {
            throw createError(
                409,
                "Trạng thái bàn không hợp lệ"
            );
        }

        const itemResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId)
            .input("itemId", sql.Int, itemId)
            .query(`
                SELECT
                    order_detail_id,
                    product_id,
                    quantity,
                    unit_price
                FROM dbo.order_details WITH (UPDLOCK, HOLDLOCK)
                WHERE order_id = @orderId
                  AND order_detail_id = @itemId
            `);

        if (itemResult.recordset.length === 0) {
            throw createError(
                404,
                "Món không tồn tại trong đơn hàng"
            );
        }

        const updateResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId)
            .input("itemId", sql.Int, itemId)
            .input("quantity", sql.Int, quantity)
            .query(`
                UPDATE dbo.order_details
                SET quantity = @quantity
                WHERE order_id = @orderId
                  AND order_detail_id = @itemId
            `);

        if (updateResult.rowsAffected[0] !== 1) {
            throw createError(
                409,
                "Không thể cập nhật số lượng món"
            );
        }

        const updatedItemResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId)
            .input("itemId", sql.Int, itemId)
            .query(`
                SELECT
                    order_detail_id,
                    order_id,
                    product_id,
                    quantity,
                    unit_price,
                    CAST(quantity AS DECIMAL(18,0)) *
                    unit_price AS line_total,
                    note
                FROM dbo.order_details
                WHERE order_id = @orderId
                  AND order_detail_id = @itemId
            `);

        const totalResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId)
            .query(`
                SELECT
                    COUNT(*) AS total_items,
                    COALESCE(
                        SUM(
                            CAST(quantity AS DECIMAL(18,0)) *
                            unit_price
                        ),
                        0
                    ) AS total_amount
                FROM dbo.order_details
                WHERE order_id = @orderId
            `);

        await transaction.commit();
        transactionStarted = false;

        return res.status(200).json({
            message: "Cập nhật số lượng món thành công",
            order_id: orderId,
            table_id: order.table_id,
            status: order.status,
            updated_item: updatedItemResult.recordset[0],
            total_items: totalResult.recordset[0].total_items,
            total_amount: totalResult.recordset[0].total_amount
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error(
                    "Lỗi rollback:",
                    rollbackError.message
                );
            }
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                error: error.message
            });
        }

        console.error(
            "Lỗi cập nhật số lượng món:",
            error
        );

        return res.status(500).json({
            error: "Không thể cập nhật số lượng món"
        });
    }
});

router.delete("/:id/items/:itemId", async (req, res) => {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Chưa đăng nhập"
        });
    }

    let decoded;

    try {
        decoded = jwt.verify(
            authorization.slice(7),
            process.env.JWT_SECRET,
            { algorithms: ["HS256"] }
        );
    } catch (error) {
        return res.status(401).json({
            error: "Token không hợp lệ hoặc đã hết hạn"
        });
    }

    const orderId = req.params.id?.trim();
    const rawItemId = req.params.itemId;
    const itemId = Number(rawItemId);

    if (
        !orderId ||
        orderId.length > 20
    ) {
        return res.status(400).json({
            error: "Mã đơn hàng không hợp lệ"
        });
    }

    if (
        !/^[1-9]\d*$/.test(rawItemId) ||
        !Number.isSafeInteger(itemId) ||
        itemId > 2147483647
    ) {
        return res.status(400).json({
            error: "Mã chi tiết đơn hàng không hợp lệ"
        });
    }

    if (
        typeof decoded.userId !== "string" ||
        !decoded.userId ||
        decoded.userId.length > 10
    ) {
        return res.status(401).json({
            error: "Thông tin đăng nhập không hợp lệ"
        });
    }

    const makeError = (statusCode, message) => {
        const error = new Error(message);
        error.statusCode = statusCode;
        return error;
    };

    let transaction;
    let transactionStarted = false;

    try {
        const pool = await connectDB();

        const userResult = await pool.request()
            .input("userId", sql.VarChar(10), decoded.userId)
            .query(`
                SELECT
                    u.user_id,
                    u.role
                FROM dbo.users u
                LEFT JOIN dbo.employees e
                    ON u.employee_id = e.employee_id
                WHERE u.user_id = @userId
                  AND u.is_active = 1
                  AND (
                      u.role = 'admin'
                      OR (
                          u.role = 'phucvu'
                          AND e.is_active = 1
                      )
                  )
            `);

        const user = userResult.recordset[0];

        if (!user) {
            return res.status(403).json({
                error: "Tài khoản không có quyền xóa món"
            });
        }

        const initialResult = await pool.request()
            .input("orderId", sql.VarChar(20), orderId)
            .query(`
                SELECT table_id
                FROM dbo.orders
                WHERE order_id = @orderId
            `);

        const initialOrder = initialResult.recordset[0];

        if (!initialOrder) {
            return res.status(404).json({
                error: "Đơn hàng không tồn tại"
            });
        }

        transaction = new sql.Transaction(pool);

        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        transactionStarted = true;

        const tableResult = await new sql.Request(transaction)
            .input("tableId", sql.VarChar(10), initialOrder.table_id)
            .query(`
                SELECT
                    table_id,
                    status,
                    is_active
                FROM dbo.[tables] WITH (UPDLOCK, HOLDLOCK)
                WHERE table_id = @tableId
            `);

        const table = tableResult.recordset[0];

        if (!table) {
            throw makeError(
                409,
                "Bàn của đơn hàng không tồn tại"
            );
        }

        const orderResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId)
            .query(`
                SELECT
                    order_id,
                    table_id,
                    status
                FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
                WHERE order_id = @orderId
            `);

        const order = orderResult.recordset[0];

        if (!order) {
            throw makeError(
                404,
                "Đơn hàng không tồn tại"
            );
        }

        if (order.table_id !== initialOrder.table_id) {
            throw makeError(
                409,
                "Thông tin bàn của đơn hàng đã thay đổi"
            );
        }

        if (order.status !== "pending") {
            throw makeError(
                409,
                "Chỉ được xóa món khi đơn đang pending"
            );
        }

        if (table.status !== "occupied") {
            throw makeError(
                409,
                "Trạng thái bàn không hợp lệ"
            );
        }

        const itemResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId)
            .input("itemId", sql.Int, itemId)
            .query(`
                SELECT
                    order_detail_id,
                    order_id,
                    product_id,
                    quantity,
                    unit_price,
                    note
                FROM dbo.order_details WITH (UPDLOCK, HOLDLOCK)
                WHERE order_id = @orderId
                  AND order_detail_id = @itemId
            `);

        const item = itemResult.recordset[0];

        if (!item) {
            throw makeError(
                404,
                "Món không tồn tại trong đơn hàng"
            );
        }

        const countResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId)
            .query(`
                SELECT COUNT(*) AS item_count
                FROM dbo.order_details WITH (UPDLOCK, HOLDLOCK)
                WHERE order_id = @orderId
            `);

        const itemCount = countResult.recordset[0].item_count;

        if (itemCount <= 1) {
            throw makeError(
                409,
                "Không thể xóa món cuối cùng, hãy hủy đơn hàng"
            );
        }

        const deleteResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId)
            .input("itemId", sql.Int, itemId)
            .query(`
                DELETE FROM dbo.order_details
                OUTPUT
                    DELETED.order_detail_id,
                    DELETED.order_id,
                    DELETED.product_id,
                    DELETED.quantity,
                    DELETED.unit_price,
                    DELETED.note
                WHERE order_id = @orderId
                  AND order_detail_id = @itemId
            `);

        if (deleteResult.recordset.length !== 1) {
            throw makeError(
                409,
                "Không thể xóa món khỏi đơn hàng"
            );
        }

        const totalResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId)
            .query(`
                SELECT
                    COUNT(*) AS total_items,
                    COALESCE(
                        SUM(
                            CAST(quantity AS DECIMAL(18,0)) *
                            unit_price
                        ),
                        0
                    ) AS total_amount
                FROM dbo.order_details
                WHERE order_id = @orderId
            `);

        const remainingResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId)
            .query(`
                SELECT
                    order_detail_id,
                    order_id,
                    product_id,
                    quantity,
                    unit_price,
                    CAST(quantity AS DECIMAL(18,0)) *
                        unit_price AS line_total,
                    note
                FROM dbo.order_details
                WHERE order_id = @orderId
                ORDER BY order_detail_id
            `);

        await transaction.commit();
        transactionStarted = false;

        return res.status(200).json({
            message: "Xóa món khỏi đơn hàng thành công",
            order_id: orderId,
            table_id: order.table_id,
            status: order.status,
            deleted_item: deleteResult.recordset[0],
            remaining_items: remainingResult.recordset,
            total_items: totalResult.recordset[0].total_items,
            total_amount: totalResult.recordset[0].total_amount
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error(
                    "Lỗi rollback:",
                    rollbackError.message
                );
            }
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                error: error.message
            });
        }

        console.error(
            "Lỗi xóa món khỏi đơn hàng:",
            error
        );

        return res.status(500).json({
            error: "Không thể xóa món khỏi đơn hàng"
        });
    }
});

module.exports = router;
