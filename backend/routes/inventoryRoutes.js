
const express = require("express");
const jwt = require("jsonwebtoken");
const { sql, connectDB } = require("../config/db");

const router = express.Router();

// 1. Kiem tra Inventory API
router.get("/health", (req, res) => {
    res.json({
        success: true,
        message: "Inventory API dang hoat dong"
    });
});

// 2. Middleware kiem tra dang nhap
async function checkLogin(req, res, next) {
    try {
        const auth = req.headers.authorization || "";

        if (!auth.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Ban chua dang nhap"
            });
        }

        const token = auth.slice(7);

        const payload = jwt.verify(
            token,
            process.env.JWT_SECRET,
            { algorithms: ["HS256"] }
        );

        const pool = await connectDB();

        const result = await pool.request()
            .input("userId", sql.VarChar(10), payload.userId)
            .query(`
                SELECT user_id, employee_id, role
                FROM dbo.users
                WHERE user_id = @userId
                  AND is_active = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({
                error: "Tai khoan khong hop le"
            });
        }

        req.inventoryUser = result.recordset[0];
        req.pool = pool;

        next();

    } catch (error) {
        console.error("Inventory auth error:", error.message);

        return res.status(401).json({
            error: "Phien dang nhap khong hop le"
        });
    }
}

function checkInventoryPermission(req, res, next) {
    const role = String(
        req.inventoryUser?.role || ""
    ).toLowerCase();

    if (role !== "admin" && role !== "kho") {
        return res.status(403).json({
            success: false,
            error: "Ban khong co quyen quan ly kho"
        });
    }

    next();
}


// 3. Lay danh sach nguyen lieu tu SQL Server
router.get("/ingredients", checkLogin, async (req, res) => {
    try {
        const result = await req.pool.request().query(`
            SELECT
                material_id,
                material_name,
                unit,
                quantity,
                min_quantity,
                is_active
            FROM dbo.materials
            ORDER BY material_name
        `);

        return res.json({
            success: true,
            total: result.recordset.length,
            ingredients: result.recordset
        });

    } catch (error) {
        console.error("Inventory ingredients error:", error);

        return res.status(500).json({
            success: false,
            error: "Khong the lay danh sach nguyen lieu"
        });
    }
});


/*
 * THEM NGUYEN LIEU VAO SQL SERVER
 * POST /api/inventory/ingredients
 */
router.post(
    "/ingredients",
    checkLogin,
    checkInventoryPermission,
    async (req, res) => {

        const {
            material_name,
            unit,
            quantity,
            min_quantity
        } = req.body || {};

        // 1. Kiem tra ten va don vi
        if (
            typeof material_name !== "string" ||
            typeof unit !== "string" ||
            !material_name.trim() ||
            !unit.trim() ||
            material_name.trim().length > 100 ||
            unit.trim().length > 30
        ) {
            return res.status(400).json({
                success: false,
                error: "Ten hoac don vi nguyen lieu khong hop le"
            });
        }

        // 2. Kiem tra so luong
        const stock = Number(quantity);
        const minimum = Number(min_quantity);

        if (
            quantity === undefined ||
            quantity === null ||
            quantity === "" ||
            min_quantity === undefined ||
            min_quantity === null ||
            min_quantity === "" ||
            !Number.isFinite(stock) ||
            !Number.isFinite(minimum) ||
            stock < 0 ||
            minimum < 0 ||
            Math.round(stock * 10000) !== stock * 10000 ||
            Math.round(minimum * 10000) !== minimum * 10000 ||
            stock > 99999999999999 ||
            minimum > 99999999999999
        ) {
            return res.status(400).json({
                success: false,
                error: "So luong phai khong am va toi da 4 chu so thap phan"
            });
        }

        const name = material_name.trim();
        const materialUnit = unit.trim();

        const transaction = new sql.Transaction(req.pool);
        let started = false;

        try {
            // 3. Bat dau SQL Transaction
            await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
            started = true;

            // 4. Kiem tra nguyen lieu trung ten
            const duplicate = await new sql.Request(transaction)
                .input("name", sql.NVarChar(100), name)
                .query(`
                    SELECT material_id
                    FROM dbo.materials WITH (UPDLOCK, HOLDLOCK)
                    WHERE material_name = @name
                `);

            if (duplicate.recordset.length > 0) {
                await transaction.rollback();
                started = false;

                return res.status(409).json({
                    success: false,
                    error: "Nguyen lieu nay da ton tai"
                });
            }

            // 5. Lay cac ma hien tai de tao ma moi
            const existing = await new sql.Request(transaction)
                .query(`
                    SELECT material_id
                    FROM dbo.materials WITH (UPDLOCK, HOLDLOCK)
                `);

            let maxId = 0;

            for (const item of existing.recordset) {
                const match = /^NL(\d+)$/.exec(item.material_id);

                if (match) {
                    maxId = Math.max(maxId, Number(match[1]));
                }
            }

            const nextNumber = maxId + 1;
            const materialId =
                "NL" + String(nextNumber).padStart(2, "0");

            if (materialId.length > 10) {
                throw new Error("Da vuot gioi han ma nguyen lieu");
            }

            // 6. Them nguyen lieu
            await new sql.Request(transaction)
                .input("id", sql.VarChar(10), materialId)
                .input("name", sql.NVarChar(100), name)
                .input("unit", sql.NVarChar(30), materialUnit)
                .input("stock", sql.Decimal(18, 4), stock)
                .input("minimum", sql.Decimal(18, 4), minimum)
                .query(`
                    INSERT INTO dbo.materials (
                        material_id,
                        material_name,
                        unit,
                        quantity,
                        min_quantity,
                        is_active
                    )
                    VALUES (
                        @id,
                        @name,
                        @unit,
                        @stock,
                        @minimum,
                        1
                    )
                `);

            // 7. Ghi lich su neu ton dau ky > 0
            if (stock > 0) {
                const employeeId =
                    req.inventoryUser.employee_id || null;

                await new sql.Request(transaction)
                    .input("materialId", sql.VarChar(10), materialId)
                    .input("employeeId", sql.VarChar(10), employeeId)
                    .input("stock", sql.Decimal(18, 4), stock)
                    .input(
                        "note",
                        sql.NVarChar(255),
                        "Nhap ton dau ky khi tao nguyen lieu"
                    )
                    .query(`
                        INSERT INTO dbo.inventory_transactions (
                            material_id,
                            employee_id,
                            transaction_type,
                            quantity,
                            note
                        )
                        VALUES (
                            @materialId,
                            @employeeId,
                            'IN',
                            @stock,
                            @note
                        )
                    `);
            }

            // 8. Xac nhan giao dich
            await transaction.commit();
            started = false;

            return res.status(201).json({
                success: true,
                message: "Them nguyen lieu thanh cong",
                ingredient: {
                    material_id: materialId,
                    material_name: name,
                    unit: materialUnit,
                    quantity: stock,
                    min_quantity: minimum,
                    is_active: true
                }
            });

        } catch (error) {
            if (started) {
                try {
                    await transaction.rollback();
                } catch (rollbackError) {
                    console.error(
                        "Loi rollback:",
                        rollbackError.message
                    );
                }
            }

            console.error("Loi them nguyen lieu:", error);

            return res.status(500).json({
                success: false,
                error: "Khong the them nguyen lieu"
            });
        }
    }
);

/*
 * API NHAP / XUAT KHO
 * POST /api/inventory/transactions
 */
router.post(
    "/transactions",
    checkLogin,
    checkInventoryPermission,
    async (req, res) => {
        const {
            material_id,
            transaction_type,
            quantity,
            note
        } = req.body || {};

        const materialId = String(material_id || "").trim();
        const type = String(transaction_type || "")
            .trim()
            .toUpperCase();

        const amount = Number(quantity);

        if (!materialId || materialId.length > 10) {
            return res.status(400).json({
                error: "Ma nguyen lieu khong hop le"
            });
        }

        if (!["IN", "OUT"].includes(type)) {
            return res.status(400).json({
                error: "Loai giao dich phai la IN hoac OUT"
            });
        }

        if (
            quantity === null ||
            quantity === undefined ||
            typeof quantity === "boolean" ||
            String(quantity).trim() === "" ||
            !Number.isFinite(amount) ||
            amount <= 0 ||
            Math.round(amount * 10000) !== amount * 10000 ||
            amount > 99999999999999
        ) {
            return res.status(400).json({
                error: "So luong phai lon hon 0 va toi da 4 chu so thap phan"
            });
        }

        if (typeof note !== "undefined" &&
            (typeof note !== "string" || note.length > 255)) {
            return res.status(400).json({
                error: "Ghi chu khong hop le"
            });
        }

        const transaction = new sql.Transaction(req.pool);
        let started = false;

        try {
            await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
            started = true;

            const materialResult = await new sql.Request(transaction)
                .input("materialId", sql.VarChar(10), materialId)
                .query(`
                    SELECT material_id, material_name, quantity
                    FROM dbo.materials WITH (UPDLOCK, HOLDLOCK)
                    WHERE material_id = @materialId
                      AND is_active = 1
                `);

            const material = materialResult.recordset[0];

            if (!material) {
                await transaction.rollback();
                started = false;

                return res.status(404).json({
                    error: "Nguyen lieu khong ton tai hoac da ngung su dung"
                });
            }

            const currentStock = Number(material.quantity);

            if (type === "OUT" && amount > currentStock) {
                await transaction.rollback();
                started = false;

                return res.status(400).json({
                    error: "So luong xuat vuot qua ton kho",
                    current_stock: currentStock
                });
            }

            const change = type === "IN" ? amount : -amount;
            const newStock = currentStock + change;

            if (newStock > 99999999999999) {
                await transaction.rollback();
                started = false;

                return res.status(400).json({
                    error: "Ton kho vuot gioi han cho phep"
                });
            }

            await new sql.Request(transaction)
                .input("materialId", sql.VarChar(10), materialId)
                .input("newStock", sql.Decimal(18, 4), newStock)
                .query(`
                    UPDATE dbo.materials
                    SET quantity = @newStock
                    WHERE material_id = @materialId
                `);


const saved = await new sql.Request(transaction)
    .input("materialId", sql.VarChar(10), materialId)
    .input(
        "employeeId",
        sql.VarChar(10),
        req.inventoryUser.employee_id || null
    )
    .input(
        "userId",
        sql.VarChar(10),
        req.inventoryUser.user_id
    )
    .input("type", sql.VarChar(10), type)
    .input("amount", sql.Decimal(18, 4), amount)
    .input("note", sql.NVarChar(255), note?.trim() || null)
    .query(`
        INSERT INTO dbo.inventory_transactions
            (
                material_id,
                employee_id,
                user_id,
                transaction_type,
                quantity,
                note
            )
        OUTPUT INSERTED.transaction_id
        VALUES
            (
                @materialId,
                @employeeId,
                @userId,
                @type,
                @amount,
                @note
            )
    `);


            await transaction.commit();
            started = false;

            return res.status(201).json({
                success: true,
                message: type === "IN"
                    ? "Nhap kho thanh cong"
                    : "Xuat kho thanh cong",
                transaction_id: saved.recordset[0].transaction_id,
                material_id: materialId,
                material_name: material.material_name,
                transaction_type: type,
                quantity: amount,
                old_stock: currentStock,
                new_stock: newStock
            });

        } catch (error) {
            if (started) {
                try {
                    await transaction.rollback();
                } catch (rollbackError) {
                    console.error(
                        "Rollback error:",
                        rollbackError.message
                    );
                }
            }

            console.error("Inventory transaction error:", error);

            return res.status(500).json({
                error: "Khong the thuc hien giao dich kho"
            });
        }
    }
);


// ==========================================
// LICH SU NHAP / XUAT KHO TU SQL SERVER
// GET /api/inventory/history
// ==========================================


router.get(
    "/history",
    checkLogin,
    checkInventoryPermission,
    async (req, res) => {
        try {
            const result = await req.pool.request().query(`
                SELECT TOP (100)
                    t.transaction_id,
                    t.material_id,
                    m.material_name,
                    m.unit,
                    t.transaction_type,
                    t.quantity,
                    t.transaction_date,
                    t.employee_id,
                    t.user_id,
                    COALESCE(
                        u.username,
                        t.employee_id
                    ) AS performed_by,
                    t.note
                FROM dbo.inventory_transactions AS t
                INNER JOIN dbo.materials AS m
                    ON t.material_id = m.material_id
                LEFT JOIN dbo.users AS u
                    ON t.user_id = u.user_id
                ORDER BY
                    t.transaction_date DESC,
                    t.transaction_id DESC
            `);

            return res.json({
                success: true,
                total: result.recordset.length,
                history: result.recordset
            });

        } catch (error) {
            console.error(
                "Inventory history error:",
                error
            );

            return res.status(500).json({
                success: false,
                error: "Khong the lay lich su nhap xuat kho"
            });
        }
    }
);

module.exports = router;
