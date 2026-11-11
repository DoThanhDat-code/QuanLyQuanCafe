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
        console.error("Loi lay danh sach don hang:", error.message);

        res.status(500).json({
            message: "Khong the lay danh sach don hang"
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
            error: "Ma don hang khong hop le"
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
                error: "Don hang khong ton tai"
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
        console.error("Loi lay chi tiet don hang:", error);

        res.status(500).json({
            error: "Khong the lay chi tiet don hang"
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
    const { product_id, quantity, note } = req.body || {};

    if (
        typeof orderId !== "string" ||
        !orderId.trim() ||
        orderId.trim().length > 20
    ) {
        return res.status(400).json({
            error: "Ma don hang khong hop le"
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
            error: "Thong tin mon khong hop le"
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
                error: "Tai khoan khong co quyen them mon"
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
            throw createError(404, "Don hang khong ton tai");
        }

        if (!["pending", "serving"].includes(order.status)) {
            throw createError(
                409,
                "Trang thai don hang khong cho phep them mon"
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
                "San pham khong ton tai hoac da ngung kinh doanh"
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
            message: "Them mon thanh cong",
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
                console.error("Loi rollback:", rollbackError.message);
            }
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                error: error.message
            });
        }

        console.error("Loi them mon:", error);

        res.status(500).json({
            error: "Khong the them mon"
        });
    }
});
router.patch("/:id/status", async (req, res) => {
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
    const { status } = req.body || {};

    if (
        typeof orderId !== "string" ||
        !orderId.trim() ||
        orderId.trim().length > 20
    ) {
        return res.status(400).json({
            error: "Ma don hang khong hop le"
        });
    }

    if (status !== "serving") {
        return res.status(400).json({
            error: "Chi ho tro chuyen tu pending sang serving"
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
                error: "Tai khoan khong co quyen chuyen trang thai don hang"
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
            throw createError(404, "Don hang khong ton tai");
        }

        if (order.status !== "pending") {
            throw createError(
                409,
                "Chi don pending moi duoc chuyen sang serving"
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
                "Khong the chuyen trang thai don hang"
            );
        }

        await transaction.commit();
        transactionStarted = false;

        res.status(200).json({
            message: "Chuyen trang thai don hang thanh cong",
            order: updateResult.recordset[0]
        });

    } catch (error) {
        if (transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Loi rollback:", rollbackError.message);
            }
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                error: error.message
            });
        }

        console.error("Loi chuyen trang thai don hang:", error);

        res.status(500).json({
            error: "Khong the chuyen trang thai don hang"
        });
    }
});
router.post("/", async (req, res) => {
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

    const { table_id, items, note } = req.body || {};

    if (
        typeof table_id !== "string" ||
        !table_id.trim() ||
        table_id.trim().length > 10
    ) {
        return res.status(400).json({
            error: "Ma ban khong hop le"
        });
    }

    if (
        note !== undefined &&
        note !== null &&
        (typeof note !== "string" || note.length > 500)
    ) {
        return res.status(400).json({
            error: "Ghi chu don hang khong hop le"
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
                error: "Thong tin dang nhap khong hop le"
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
                error: "Tai khoan chua lien ket voi nhan vien dang hoat dong"
            });
        }

        if (!createOrderRoles.has(user.role)) {
            return res.status(403).json({
                error: "Tai khoan khong co quyen tao don hang"
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
            throw createError(404, "Ban khong ton tai");
        }

        if (!table.is_active) {
            throw createError(409, "Ban khong con hoat dong");
        }

        if (table.status !== "available") {
            throw createError(409, "Ban khong o trang thai trong");
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
            throw createError(409, "Ban dang co don hang chua hoan tat");
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
            throw createError(503, "Khong the cap ma don hang");
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
            throw createError(500, "Khong the tao ma don hang");
        }

        const orderId = "ORD" + String(nextNumber).padStart(3, "0");

        if (orderId.length > 20) {
            throw createError(500, "Ma don hang vuot qua gioi han");
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
                    "San pham khong ton tai hoac da ngung kinh doanh"
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
            throw createError(409, "Khong the cap nhat trang thai ban");
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
            message: "Tao don hang thanh cong",
            order: orderResult.recordset[0],
            total_amount: totalResult.recordset[0].total_amount
        });

    } catch (error) {
        if (transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Loi rollback:", rollbackError.message);
            }
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                error: error.message
            });
        }

        if (error.number === 2627 || error.number === 2601) {
            return res.status(409).json({
                error: "Ma don hang da ton tai"
            });
        }

        console.error("Loi tao don hang:", error);

        res.status(500).json({
            error: "Khong the tao don hang"
        });
    }
});
router.patch("/:id/cancel", async (req, res) => {
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

    if (
        typeof orderId !== "string" ||
        !orderId.trim() ||
        orderId.trim().length > 20
    ) {
        return res.status(400).json({
            error: "Ma don hang khong hop le"
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
                error: "Tai khoan khong co quyen huy don hang"
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
                error: "Don hang khong ton tai"
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
            throw createError(409, "Ban cua don hang khong ton tai");
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
            throw createError(404, "Don hang khong ton tai");
        }

        if (order.table_id !== initialOrder.table_id) {
            throw createError(409, "Thong tin ban cua don hang da thay doi");
        }

        if (!["pending", "serving"].includes(order.status)) {
            throw createError(409, "Trang thai don hang khong cho phep huy");
        }

        if (order.status === "serving" && user.role !== "admin") {
            throw createError(403, "Chi admin duoc huy don dang serving");
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
            throw createError(409, "Khong the huy don hang");
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
            message: "Huy don hang thanh cong",
            order: updateResult.recordset[0],
            table: tableAfterResult.recordset[0]
        });

    } catch (error) {
        if (transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Loi rollback:", rollbackError.message);
            }
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                error: error.message
            });
        }

        console.error("Loi huy don hang:", error);

        res.status(500).json({
            error: "Khong the huy don hang"
        });
    }
});
router.patch("/:id/pay", async (req, res) => {
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

    if (
        typeof orderId !== "string" ||
        !orderId.trim() ||
        orderId.trim().length > 20
    ) {
        return res.status(400).json({
            error: "Ma don hang khong hop le"
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
                error: "Tai khoan khong co quyen thanh toan don hang"
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
                error: "Don hang khong ton tai"
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
            throw createError(409, "Ban cua don hang khong ton tai");
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
            throw createError(404, "Don hang khong ton tai");
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
            throw createError(409, "Khong the thanh toan don hang");
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
            message: "Thanh toan don hang thanh cong",
            order: updateResult.recordset[0],
            total_amount: totalResult.recordset[0].total_amount,
            table: tableAfterResult.recordset[0]
        });

    } catch (error) {
        if (transactionStarted) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Loi rollback:", rollbackError.message);
            }
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                error: error.message
            });
        }

        console.error("Loi thanh toan don hang:", error);

        res.status(500).json({
            error: "Khong the thanh toan don hang"
        });
    }
});
module.exports = router;