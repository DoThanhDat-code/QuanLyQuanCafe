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

    if (!["admin", "kho", "inventory"].includes(role)) {
        return res.status(403).json({
            success: false,
            error: "Ban khong co quyen quan ly kho"
        });
    }

    next();
}



// Ghi nhat ky thao tac trong CUNG transaction voi thay doi nguyen lieu.
async function writeInventoryAudit(tx, { materialId, action, userId, oldData = null, newData = null, note = null }) {
    await new sql.Request(tx)
        .input("materialId", sql.VarChar(10), materialId)
        .input("action", sql.VarChar(30), action)
        .input("userId", sql.VarChar(10), userId)
        .input("oldData", sql.NVarChar(sql.MAX), oldData === null ? null : JSON.stringify(oldData))
        .input("newData", sql.NVarChar(sql.MAX), newData === null ? null : JSON.stringify(newData))
        .input("note", sql.NVarChar(255), note)
        .query(`
            INSERT INTO dbo.inventory_audit_logs
                (material_id, action_type, user_id, old_data, new_data, note)
            VALUES (@materialId, @action, @userId, @oldData, @newData, @note)
        `);
}

function cleanAuditNote(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" || value.length > 255) return undefined;
    return value.trim() || null;
}

// 3. Lay danh sach nguyen lieu tu SQL Server
router.get("/ingredients", checkLogin, checkInventoryPermission, async (req, res) => {
    try {
        const includeInactive = req.query.status === "all";
        const result = await req.pool.request()
            .input("includeInactive", sql.Bit, includeInactive)
            .query(`
            SELECT
                material_id,
                material_name,
                unit,
                quantity,
                min_quantity,
                is_active
            FROM dbo.materials
            WHERE is_active = 1 OR @includeInactive = 1
            ORDER BY material_name, material_id
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
            min_quantity,
            note
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

            // 4. Neu trung ten voi nguyen lieu da xoa mem, tu dong khoi phuc.
            const duplicate = await new sql.Request(transaction)
                .input("name", sql.NVarChar(100), name)
                .query(`
                    SELECT material_id, material_name, unit, quantity, min_quantity, is_active
                    FROM dbo.materials WITH (UPDLOCK, HOLDLOCK)
                    WHERE material_name = @name
                `);

            if (duplicate.recordset.length > 0) {
                const oldData = duplicate.recordset[0];
                if (oldData.is_active) {
                    await transaction.rollback();
                    started = false;
                    return res.status(409).json({
                        success: false,
                        error: "Nguyen lieu nay da ton tai",
                        existing_material_id: oldData.material_id
                    });
                }

                // Khong duoc cong so luong khac don vi vao ton kho cu.
                if (oldData.unit.trim().toLowerCase() !== materialUnit.toLowerCase()) {
                    await transaction.rollback();
                    started = false;
                    return res.status(400).json({
                        success: false,
                        error: "Don vi khac voi nguyen lieu cu. Hay su dung don vi: " + oldData.unit,
                        existing_material_id: oldData.material_id
                    });
                }

                // Khi them lai, quantity la TON KHO MOI, khong phai luong nhap them.
                // Giu ma nguyen lieu va lich su cu; thay doi duoc ghi trong audit RESTORE.
                const materialId = oldData.material_id;
                const newStock = stock;

                const updated = await new sql.Request(transaction)
                    .input("id", sql.VarChar(10), materialId)
                    .input("minimum", sql.Decimal(18, 4), minimum)
                    .input("stock", sql.Decimal(18, 4), newStock)
                    .query(`
                        UPDATE dbo.materials
                        SET is_active = 1, min_quantity = @minimum, quantity = @stock
                        OUTPUT INSERTED.material_id, INSERTED.material_name, INSERTED.unit,
                               INSERTED.quantity, INSERTED.min_quantity, INSERTED.is_active
                        WHERE material_id = @id AND is_active = 0
                    `);
                const newData = updated.recordset[0];

                // Khong tao giao dich IN: day la dat lai ton kho khi khoi phuc,
                // khong phai nhap hang thuc te. Audit RESTORE luu ton cu va ton moi.

                await writeInventoryAudit(transaction, {
                    materialId,
                    action: "RESTORE",
                    userId: req.inventoryUser.user_id,
                    oldData,
                    newData,
                    note: typeof note === "string" ? note.trim().slice(0, 255) || null : null
                });

                await transaction.commit();
                started = false;
                return res.status(200).json({
                    success: true,
                    message: "Khoi phuc nguyen lieu thanh cong",
                    restored: true,
                    old_stock: Number(oldData.quantity),
                    new_stock: newStock,
                    ingredient: newData
                });
            }

            // 5. Lay cac ma hien tai de tao ma moi
            const existing = await new sql.Request(transaction)
                .query(`
                    SELECT material_id
                    FROM dbo.materials WITH (UPDLOCK, HOLDLOCK)
                    UNION
                    SELECT material_id
                    FROM dbo.inventory_audit_logs WITH (HOLDLOCK)
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
    typeof note === "string" && note.trim()
        ? note.trim().slice(0, 255)
        : "Nhap ton dau ky khi tao nguyen lieu"
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

            // Ghi nhat ky tao moi; giu nguyen lich su nhap ton dau ky o tren.
            await writeInventoryAudit(transaction, {
                materialId,
                action: "CREATE",
                userId: req.inventoryUser.user_id,
                newData: { material_id: materialId, material_name: name, unit: materialUnit,
                    quantity: stock, min_quantity: minimum, is_active: true },
                note: typeof note === "string" ? note.trim().slice(0, 255) || null : null
            });

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
                    CONVERT(VARCHAR(23), t.transaction_date, 126) + '+07:00' AS transaction_date,
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


/*
 * NGUNG SU DUNG NGUYEN LIEU - KHONG XOA DU LIEU/LICH SU CU
 * PATCH /api/inventory/ingredients/:id/deactivate
 */
router.patch("/ingredients/:id/deactivate", checkLogin, checkInventoryPermission, async (req, res) => {
    const materialId = String(req.params.id || "").trim();
    const note = cleanAuditNote(req.body?.note);
    if (!materialId || materialId.length > 10 || note === undefined) {
        return res.status(400).json({ success: false, error: "Ma nguyen lieu hoac ghi chu khong hop le" });
    }
    const tx = new sql.Transaction(req.pool);
    let started = false;
    try {
        await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        started = true;
        const found = await new sql.Request(tx)
            .input("id", sql.VarChar(10), materialId)
            .query(`SELECT material_id, material_name, unit, quantity, min_quantity, is_active
                    FROM dbo.materials WITH (UPDLOCK, HOLDLOCK) WHERE material_id = @id`);
        const oldData = found.recordset[0];
        if (!oldData || !oldData.is_active) {
            await tx.rollback(); started = false;
            return res.status(404).json({ success: false, error: "Nguyen lieu khong ton tai hoac da ngung su dung" });
        }
        await new sql.Request(tx).input("id", sql.VarChar(10), materialId)
            .query(`UPDATE dbo.materials SET is_active = 0 WHERE material_id = @id AND is_active = 1`);
        const newData = { ...oldData, is_active: false };
        await writeInventoryAudit(tx, {
            materialId, action: "DEACTIVATE", userId: req.inventoryUser.user_id,
            oldData, newData, note
        });
        await tx.commit(); started = false;
        return res.json({ success: true, message: "Da ngung su dung nguyen lieu", ingredient: newData });
    } catch (error) {
        if (started) { try { await tx.rollback(); } catch (e) { console.error("Rollback error:", e); } }
        console.error("Deactivate ingredient error:", error);
        return res.status(500).json({ success: false, error: "Khong the ngung su dung nguyen lieu" });
    }
});

/*
 * KHOI PHUC NGUYEN LIEU - GIU NGUYEN TON KHO VA LICH SU
 * PATCH /api/inventory/ingredients/:id/restore
 */
router.patch("/ingredients/:id/restore", checkLogin, checkInventoryPermission, async (req, res) => {
    const materialId = String(req.params.id || "").trim();
    const note = cleanAuditNote(req.body?.note);
    if (!materialId || materialId.length > 10 || note === undefined) {
        return res.status(400).json({ success: false, error: "Ma nguyen lieu hoac ghi chu khong hop le" });
    }
    const tx = new sql.Transaction(req.pool);
    let started = false;
    try {
        await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        started = true;
        const found = await new sql.Request(tx)
            .input("id", sql.VarChar(10), materialId)
            .query(`SELECT material_id, material_name, unit, quantity, min_quantity, is_active
                    FROM dbo.materials WITH (UPDLOCK, HOLDLOCK) WHERE material_id = @id`);
        const oldData = found.recordset[0];
        if (!oldData) {
            await tx.rollback(); started = false;
            return res.status(404).json({ success: false, error: "Khong tim thay nguyen lieu" });
        }
        if (oldData.is_active) {
            await tx.rollback(); started = false;
            return res.status(409).json({ success: false, error: "Nguyen lieu dang duoc su dung" });
        }
        await new sql.Request(tx).input("id", sql.VarChar(10), materialId)
            .query(`UPDATE dbo.materials SET is_active = 1 WHERE material_id = @id AND is_active = 0`);
        const newData = { ...oldData, is_active: true };
        await writeInventoryAudit(tx, {
            materialId, action: "RESTORE", userId: req.inventoryUser.user_id,
            oldData, newData, note
        });
        await tx.commit(); started = false;
        return res.json({ success: true, message: "Khoi phuc nguyen lieu thanh cong", ingredient: newData });
    } catch (error) {
        if (started) { try { await tx.rollback(); } catch (e) { console.error("Rollback error:", e); } }
        console.error("Restore ingredient error:", error);
        return res.status(500).json({ success: false, error: "Khong the khoi phuc nguyen lieu" });
    }
});

/*
 * SUA THONG TIN NGUYEN LIEU - KHONG SUA TON KHO TAI DAY
 * PUT /api/inventory/ingredients/:id
 */
router.put("/ingredients/:id", checkLogin, checkInventoryPermission, async (req, res) => {
    const materialId = String(req.params.id || "").trim();
    const { material_name, unit, min_quantity } = req.body || {};
    const note = cleanAuditNote(req.body?.note);
    const minimum = Number(min_quantity);
    if (!materialId || materialId.length > 10 ||
        typeof material_name !== "string" || !material_name.trim() || material_name.trim().length > 100 ||
        typeof unit !== "string" || !unit.trim() || unit.trim().length > 30 ||
        min_quantity === undefined || min_quantity === null || String(min_quantity).trim() === "" ||
        typeof min_quantity === "boolean" || !Number.isFinite(minimum) || minimum < 0 ||
        minimum > 99999999999999 || Math.round(minimum * 10000) !== minimum * 10000 ||
        note === undefined) {
        return res.status(400).json({ success: false, error: "Thong tin nguyen lieu khong hop le" });
    }
    const name = material_name.trim();
    const materialUnit = unit.trim();
    const tx = new sql.Transaction(req.pool);
    let started = false;
    try {
        await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        started = true;
        const found = await new sql.Request(tx)
            .input("id", sql.VarChar(10), materialId)
            .query(`SELECT material_id, material_name, unit, quantity, min_quantity, is_active
                    FROM dbo.materials WITH (UPDLOCK, HOLDLOCK) WHERE material_id = @id`);
        const oldData = found.recordset[0];
        if (!oldData || !oldData.is_active) {
            await tx.rollback(); started = false;
            return res.status(404).json({ success: false, error: "Nguyen lieu khong ton tai hoac da ngung su dung" });
        }
        const duplicate = await new sql.Request(tx)
            .input("name", sql.NVarChar(100), name)
            .input("id", sql.VarChar(10), materialId)
            .query(`SELECT material_id FROM dbo.materials WITH (UPDLOCK, HOLDLOCK)
                    WHERE material_name = @name AND material_id <> @id`);
        if (duplicate.recordset.length) {
            await tx.rollback(); started = false;
            return res.status(409).json({ success: false, error: "Ten nguyen lieu da ton tai" });
        }
        const updated = await new sql.Request(tx)
            .input("id", sql.VarChar(10), materialId)
            .input("name", sql.NVarChar(100), name)
            .input("unit", sql.NVarChar(30), materialUnit)
            .input("minimum", sql.Decimal(18, 4), minimum)
            .query(`UPDATE dbo.materials
                    SET material_name = @name, unit = @unit, min_quantity = @minimum
                    OUTPUT INSERTED.material_id, INSERTED.material_name, INSERTED.unit,
                           INSERTED.quantity, INSERTED.min_quantity, INSERTED.is_active
                    WHERE material_id = @id AND is_active = 1`);
        const newData = updated.recordset[0];
        await writeInventoryAudit(tx, {
            materialId, action: "UPDATE", userId: req.inventoryUser.user_id,
            oldData, newData, note
        });
        await tx.commit(); started = false;
        return res.json({ success: true, message: "Cap nhat nguyen lieu thanh cong", ingredient: newData });
    } catch (error) {
        if (started) { try { await tx.rollback(); } catch (e) { console.error("Rollback error:", e); } }
        console.error("Update ingredient error:", error);
        return res.status(500).json({ success: false, error: "Khong the cap nhat nguyen lieu" });
    }
});

/*
 * Xóa nguyên liệu chưa phát sinh giao dịch hoặc liên kết công thức.
 * Migration 006 cho phép giữ nhật ký sau khi xóa nguyên liệu.
 */
router.delete("/ingredients/:id", checkLogin, checkInventoryPermission, async (req, res) => {
    const materialId = req.params.id.trim();
    if (!materialId || materialId.length > 10) {
        return res.status(400).json({ success: false, error: "Mã nguyên liệu không hợp lệ." });
    }

    const tx = new sql.Transaction(req.pool);
    let started = false;
    try {
        await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        started = true;

        const found = await new sql.Request(tx)
            .input("id", sql.VarChar(10), materialId)
            .query(`
                SELECT material_id, material_name, unit, quantity, min_quantity, is_active
                FROM dbo.materials WITH (UPDLOCK, HOLDLOCK)
                WHERE material_id = @id
            `);
        const material = found.recordset[0];
        if (!material) {
            await tx.rollback();
            return res.status(404).json({ success: false, error: "Không tìm thấy nguyên liệu." });
        }
        if (Number(material.quantity) !== 0) {
            await tx.rollback();
            return res.status(409).json({
                success: false,
                error: "Nguyên liệu còn tồn kho. Bạn có thể chọn Ngừng sử dụng."
            });
        }

        const references = await new sql.Request(tx)
            .input("id", sql.VarChar(10), materialId)
            .query(`
                DECLARE @usedInRecipe BIT = 0;
                IF OBJECT_ID(N'dbo.product_recipes', N'U') IS NOT NULL
                BEGIN
                    EXEC sys.sp_executesql
                        N'SET @used = CASE WHEN EXISTS (
                            SELECT 1 FROM dbo.product_recipes WITH (UPDLOCK, HOLDLOCK)
                            WHERE material_id = @materialId
                        ) THEN 1 ELSE 0 END;',
                        N'@materialId VARCHAR(10), @used BIT OUTPUT',
                        @materialId = @id, @used = @usedInRecipe OUTPUT;
                END;

                SELECT @usedInRecipe AS used_in_recipe,
                    CASE WHEN EXISTS (
                        SELECT 1 FROM dbo.inventory_transactions WITH (UPDLOCK, HOLDLOCK)
                        WHERE material_id = @id
                    ) THEN 1 ELSE 0 END AS has_transactions;
            `);
        const { used_in_recipe, has_transactions } = references.recordset[0];
        if (used_in_recipe || has_transactions) {
            await tx.rollback();
            return res.status(409).json({
                success: false,
                error: "Nguyên liệu đã có giao dịch hoặc được dùng trong công thức. Hãy chọn Ngừng sử dụng."
            });
        }

        await new sql.Request(tx)
            .input("id", sql.VarChar(10), materialId)
            .query("DELETE FROM dbo.materials WHERE material_id = @id");
        await writeInventoryAudit(tx, {
            materialId: material.material_id,
            action: "DELETE",
            userId: req.inventoryUser.user_id,
            oldData: material
        });

        await tx.commit();
        return res.json({ success: true, message: "Đã xóa nguyên liệu." });
    } catch (error) {
        if (started) {
            try {
                await tx.rollback();
            } catch (rollbackError) {
                console.error("Rollback inventory delete:", rollbackError);
            }
        }

        if (error.number === 547) {
            return res.status(409).json({
                success: false,
                error: "Nguyên liệu đang được dữ liệu khác tham chiếu. Hãy chọn Ngừng sử dụng."
            });
        }
        if (error.number === 1205) {
            return res.status(409).json({
                success: false,
                error: "Nguyên liệu đang được cập nhật. Hãy tải lại và thử lại."
            });
        }
        console.error("Delete ingredient error:", error);
        return res.status(500).json({ success: false, error: "Không thể xóa nguyên liệu." });
    }
});

/*
 * NHAT KY THAO TAC NGUYEN LIEU (KE CA DA NGUNG SU DUNG)
 * GET /api/inventory/audit-logs
 */
router.get("/audit-logs", checkLogin, checkInventoryPermission, async (req, res) => {
    try {
        const result = await req.pool.request().query(`
            SELECT TOP (200) a.log_id, a.material_id,
                   COALESCE(m.material_name, JSON_VALUE(
                       CASE WHEN ISJSON(a.old_data) = 1 THEN a.old_data END,
                       '$.material_name'
                   ), JSON_VALUE(
                       CASE WHEN ISJSON(a.new_data) = 1 THEN a.new_data END,
                       '$.material_name'
                   )) AS material_name,
                   a.action_type, a.user_id, u.username AS performed_by,
                   a.old_data, a.new_data, a.note, a.created_at
            FROM dbo.inventory_audit_logs AS a
            LEFT JOIN dbo.materials AS m ON m.material_id = a.material_id
            LEFT JOIN dbo.users AS u ON u.user_id = a.user_id
            ORDER BY a.created_at DESC, a.log_id DESC
        `);
        return res.json({ success: true, total: result.recordset.length, logs: result.recordset });
    } catch (error) {
        console.error("Inventory audit logs error:", error);
        return res.status(500).json({ success: false, error: "Khong the lay nhat ky thao tac" });
    }
});

module.exports = router;