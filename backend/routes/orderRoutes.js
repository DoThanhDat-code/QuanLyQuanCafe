const express = require("express");
const jwt = require("jsonwebtoken");

const { sql, connectDB } = require("../config/db");

const router = express.Router();

const createOrderRoles = new Set([
    "admin",
    "manager",
    "phucvu"
]);

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

router.get("/", async (req, res) => {
    try {
        const pool = await connectDB();

        const result = await pool.request().query(`
            SELECT
                order_id,
                table_id,
                employee_id,
                order_date,
                status,
                note,
                created_at
            FROM dbo.orders
            ORDER BY created_at DESC, order_id DESC
        `);

        res.status(200).json(result.recordset);
    } catch (error) {
        console.error("Lỗi lấy danh sách đơn hàng:", error.message);

        res.status(500).json({
            message: "Không thể lấy danh sách đơn hàng"
        });
    }
});
router.get("/:id", async (req, res) => {
    const orderId = req.params.id;

    if (
        typeof orderId !== "string" ||
        !orderId.trim() ||
        orderId.trim().length > 20
    ) {
        return res.status(400).json({
            error: "Mã đơn hàng không hơp lệ"
        });
    }

    try {
        const pool = await connectDB();

        const orderResult = await pool.request()
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
                    o.note,
                    o.created_at
                FROM dbo.orders o
                LEFT JOIN dbo.[tables] t
                    ON o.table_id = t.table_id
                LEFT JOIN dbo.employees e
                    ON o.employee_id = e.employee_id
                WHERE o.order_id = @orderId
            `);

        const order = orderResult.recordset[0];

        if (!order) {
            return res.status(404).json({
                error: "Đơn hàng không tồn tại"
            });
        }

        const itemsResult = await pool.request()
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT
                    od.order_detail_id,
                    od.product_id,
                    p.product_name,
                    od.quantity,
                    od.unit_price,
                    od.note,
                    CAST(od.quantity AS DECIMAL(18, 0)) *
                    CAST(od.unit_price AS DECIMAL(18, 0)) AS line_total
                FROM dbo.order_details od
                LEFT JOIN dbo.products p
                    ON od.product_id = p.product_id
                WHERE od.order_id = @orderId
                ORDER BY od.order_detail_id
            `);

        const totalResult = await pool.request()
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT
                    COALESCE(
                        SUM(
                            CAST(quantity AS DECIMAL(18, 0)) *
                            CAST(unit_price AS DECIMAL(18, 0))
                        ),
                        0
                    ) AS total_amount
                FROM dbo.order_details
                WHERE order_id = @orderId
            `);

        res.status(200).json({
            order,
            items: itemsResult.recordset,
            total_amount: totalResult.recordset[0].total_amount
        });

    } catch (error) {
        console.error("Lỗi lấy chi tiết đơn hàng:", error);

        res.status(500).json({
            error: "Không thể lấy chi tiết đơn hàng"
        });
    }
});
router.post("/:id/items", async (req, res) => {
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
    const { product_id, quantity, note } = req.body || {};

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
        typeof product_id !== "string" ||
        !product_id.trim() ||
        product_id.trim().length > 10 ||
        !Number.isInteger(quantity) ||
        quantity <= 0 ||
        quantity > 2147483647 ||
        (
            note !== undefined &&
            note !== null &&
            (typeof note !== "string" || note.length > 255)
        )
    ) {
        return res.status(400).json({
            error: "Thông tin món không hơp lệ"
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
                error: "Tài khoản không có quyền thêm món"
            });
        }

        transaction = new sql.Transaction(pool);

        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        transactionStarted = true;

        const orderResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT order_id, status, table_id
                FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
                WHERE order_id = @orderId
            `);

        const order = orderResult.recordset[0];

        if (!order) {
            throw createError(404, "Đơn hàng không tồn tại");
        }

        if (!["pending", "serving"].includes(order.status)) {
            throw createError(
                409,
                "Trạng thái đơn hàng không cho phép thêm món"
            );
        }

        const itemResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId.trim())
            .input("productId", sql.VarChar(10), product_id.trim())
            .input("quantity", sql.Int, quantity)
            .input("note", sql.NVarChar(255), note || null)
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
                    product_id,
                    @quantity,
                    price,
                    @note
                FROM dbo.products WITH (UPDLOCK, HOLDLOCK)
                WHERE product_id = @productId
                  AND is_active = 1
            `);

        const item = itemResult.recordset[0];

        if (!item) {
            throw createError(
                400,
                "Sản phẩm không tồn tại hoặc đã ngừng kinh doanh"
            );
        }

        const totalResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT
                    COALESCE(
                        SUM(
                            CAST(quantity AS DECIMAL(18, 0)) *
                            CAST(unit_price AS DECIMAL(18, 0))
                        ),
                        0
                    ) AS total_amount
                FROM dbo.order_details
                WHERE order_id = @orderId
            `);

        await transaction.commit();
        transactionStarted = false;

        res.status(201).json({
            message: "Thêm món thành công",
            order_id: order.order_id,
            status: order.status,
            item,
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

        console.error("Lỗi thêm món:", error);

        res.status(500).json({
            error: "Không thể thêm món"
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
            error: "Chỉ hỗ trợ chuyển từ đang cờ xử lý sang đang phục vụ"
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
            throw createError(409, "Bàn không còn họat động");
        }

        if (table.status !== "available") {
            throw createError(409, "Bàn không ở trạng thái trọng");
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
            throw createError(409, "Không thể cập nhật trạng thái bạn");
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
            throw createError(403, "Chỉ admin dược hủy đơn đang đang phục vụ");
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
            error: "Chưa đang nhập"
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

        if (!user || !["admin", "phucvu"].includes(user.role)) {
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
            throw createError(409, "Bàn của đơn hàng không tồn tại");
        }

        const orderResult = await new sql.Request(transaction)
            .input("orderId", sql.VarChar(20), orderId.trim())
            .query(`
                SELECT order_id, table_id, employee_id, status
                FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
                WHERE order_id = @orderId
            `);

        const order = orderResult.recordset[0];

        if (!order) {
            throw createError(404, "Đơn hàng không tồn tại");
        }

        if (order.table_id !== initialOrder.table_id) {
            throw createError(409, "Thông tin bàn cua đơn hàng đã thay ");
        }

        if (order.status !== "serving") {
            throw createError(409, "Đơn hàng đã thanh thoán");
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
            throw createError(409, "Không thể thanh toán đơn hàng");
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
                console.error("Lỗi rollback:", rollbackError.message);
            }
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                error: error.message
            });
        }

        console.error("Lỗi thanh tóan đơn hàng:", error);

        res.status(500).json({
            error: "Không thể thanh toán đơn hàng"
        });
    }
});
module.exports = router;