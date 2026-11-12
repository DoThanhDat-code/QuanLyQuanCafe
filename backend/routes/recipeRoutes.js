
const express = require("express");
const jwt = require("jsonwebtoken");
const { sql, connectDB } = require("../config/db");

const router = express.Router();

const validId = (id) =>
    typeof id === "string" &&
    /^[a-zA-Z0-9_-]{1,10}$/.test(id);

const validQuantity = (qty) =>
    typeof qty === "number" &&
    Number.isFinite(qty) &&
    qty > 0 &&
    qty <= 9999999999 &&
    Math.abs(qty * 10000 - Math.round(qty * 10000)) < 1e-6;

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        console.error("Recipe error:", err);
        res.status(500).json({
            error: "Lỗi xử lý công thức hoặc SQL Server"
        });
    }
};

router.use(async (req, res, next) => {
    try {
        const auth = req.headers.authorization || "";

        if (!auth.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Bạn chưa đăng nhập"
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
            .input("id", sql.VarChar(10), payload.userId)
            .query(`
                SELECT user_id, employee_id, role
                FROM dbo.users
                WHERE user_id = @id AND is_active = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({
                error: "Tài khoản không hoạt động"
            });
        }

        const user = result.recordset[0];

        const allowedRoles = [
            "admin", "manager", "kho",
            "service", "cashier"
        ];

        if (!allowedRoles.includes(user.role)) {
            return res.status(403).json({
                error: "Không có quyền truy cập"
            });
        }

        req.recipeUser = user;
        req.pool = pool;

        next();
    } catch (err) {
        return res.status(401).json({
            error: "Phiên đăng nhập không hợp lệ"
        });
    }
});

const managerOnly = (req, res, next) => {
    if (["admin", "manager"].includes(req.recipeUser.role)) {
        return next();
    }

    return res.status(403).json({
        error: "Chỉ quản lý được sửa công thức"
    });
};

router.get("/", handle(async (req, res) => {
    const result = await req.pool.request().query(`
        SELECT
            r.product_id,
            p.product_name,
            r.material_id,
            m.material_name,
            m.unit,
            r.quantity_per_item
        FROM dbo.product_recipes r
        JOIN dbo.products p
            ON r.product_id = p.product_id
        JOIN dbo.materials m
            ON r.material_id = m.material_id
        ORDER BY p.product_name, m.material_name
    `);

    res.json(result.recordset);
}));

router.put("/:productId", managerOnly, handle(async (req, res) => {
    const productId = req.params.productId;
    const items = req.body?.ingredients;

    if (
        !validId(productId) ||
        !Array.isArray(items) ||
        items.length === 0 ||
        items.length > 100 ||
        items.some(x =>
            !validId(x.material_id) ||
            !validQuantity(x.quantity_per_item)
        ) ||
        new Set(items.map(x => x.material_id)).size !== items.length
    ) {
        return res.status(400).json({
            error: "Công thức không hợp lệ"
        });
    }

    const tx = new sql.Transaction(req.pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
        const product = await new sql.Request(tx)
            .input("id", sql.VarChar(10), productId)
            .query(`
                SELECT product_id
                FROM dbo.products
                WHERE product_id = @id
            `);

        if (!product.recordset.length) {
            await tx.rollback();
            return res.status(404).json({
                error: "Không tìm thấy món"
            });
        }

        for (const item of items) {
            const material = await new sql.Request(tx)
                .input("id", sql.VarChar(10), item.material_id)
                .query(`
                    SELECT material_id
                    FROM dbo.materials
                    WHERE material_id = @id
                      AND is_active = 1
                `);

            if (!material.recordset.length) {
                await tx.rollback();
                return res.status(400).json({
                    error: "Nguyên liệu không tồn tại hoặc đã ngừng dùng"
                });
            }
        }

        await new sql.Request(tx)
            .input("id", sql.VarChar(10), productId)
            .query(`
                DELETE FROM dbo.product_recipes
                WHERE product_id = @id
            `);

        for (const item of items) {
            await new sql.Request(tx)
                .input("product", sql.VarChar(10), productId)
                .input("material", sql.VarChar(10), item.material_id)
                .input("qty", sql.Decimal(18, 4),
                       item.quantity_per_item)
                .query(`
                    INSERT INTO dbo.product_recipes
                        (product_id, material_id, quantity_per_item)
                    VALUES (@product, @material, @qty)
                `);
        }

        await tx.commit();

        res.json({
            message: "Đã lưu công thức thành công",
            product_id: productId,
            ingredients: items
        });
    } catch (err) {
        try { await tx.rollback(); } catch (_) {}
        throw err;
    }
}));

router.post("/produce", handle(async (req, res) => {
    const { product_id, quantity, batch_id, note } = req.body || {};

    const validBatch = typeof batch_id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batch_id);

    if (!validId(product_id) ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 || quantity > 10000 ||
        !validBatch ||
        (note != null &&
          (typeof note !== "string" || note.length > 255))) {
        return res.status(400).json({
            error: "Thông tin pha chế không hợp lệ"
        });
    }

    const tx = new sql.Transaction(req.pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
        const previous = await new sql.Request(tx)
            .input("batch", sql.UniqueIdentifier, batch_id)
            .query(`
                SELECT batch_id
                FROM dbo.production_batches WITH (UPDLOCK, HOLDLOCK)
                WHERE batch_id = @batch
            `);

        if (previous.recordset.length) {
            await tx.rollback();
            return res.status(409).json({
                error: "Lượt pha chế đã được ghi nhận"
            });
        }

        const product = await new sql.Request(tx)
            .input("id", sql.VarChar(10), product_id)
            .query(`
                SELECT is_active FROM dbo.products
                WHERE product_id = @id
            `);

        if (!product.recordset.length ||
            !product.recordset[0].is_active) {
            await tx.rollback();
            return res.status(404).json({
                error: "Món không tồn tại hoặc ngừng bán"
            });
        }

        const recipes = await new sql.Request(tx)
            .input("id", sql.VarChar(10), product_id)
            .query(`
                SELECT r.material_id, r.quantity_per_item,
                       m.material_name, m.unit, m.is_active
                FROM dbo.product_recipes r
                JOIN dbo.materials m
                    ON r.material_id = m.material_id
                WHERE r.product_id = @id
                ORDER BY r.material_id
            `);

        if (!recipes.recordset.length) {
            await tx.rollback();
            return res.status(409).json({
                error: "Món chưa có công thức"
            });
        }

        const used = [];

        for (const item of recipes.recordset) {
            if (!item.is_active) {
                await tx.rollback();
                return res.status(409).json({
                    error: `Nguyên liệu ${item.material_name} đã ngừng dùng`
                });
            }

            const needed = Math.round(
                Number(item.quantity_per_item) * quantity * 10000
            ) / 10000;

            if (needed <= 0 || needed > 99999999999999) {
                await tx.rollback();
                return res.status(400).json({
                    error: "Định lượng vượt giới hạn"
                });
            }

            const update = await new sql.Request(tx)
                .input("id", sql.VarChar(10), item.material_id)
                .input("needed", sql.Decimal(18, 4), needed)
                .query(`
                    UPDATE dbo.materials
                    SET quantity = quantity - @needed
                    OUTPUT INSERTED.quantity
                    WHERE material_id = @id
                      AND is_active = 1
                      AND quantity >= @needed
                `);

            if (!update.recordset.length) {
                await tx.rollback();
                return res.status(409).json({
                    error: `Không đủ ${item.material_name}, cần ${needed} ${item.unit}`
                });
            }

            used.push({
                material_id: item.material_id,
                material_name: item.material_name,
                quantity: needed,
                unit: item.unit
            });
        }

        await new sql.Request(tx)
            .input("batch", sql.UniqueIdentifier, batch_id)
            .input("product", sql.VarChar(10), product_id)
            .input("qty", sql.Int, quantity)
            .input("employee", sql.VarChar(10),
                   req.recipeUser.employee_id || null)
            .input("note", sql.NVarChar(255), note || null)
            .query(`
                INSERT INTO dbo.production_batches
                    (batch_id, product_id, quantity, employee_id, note)
                VALUES (@batch, @product, @qty, @employee, @note)
            `);

        for (const item of used) {
            await new sql.Request(tx)
                .input("id", sql.VarChar(10), item.material_id)
                .input("qty", sql.Decimal(18, 4), item.quantity)
                .input("employee", sql.VarChar(10),
                       req.recipeUser.employee_id || null)
                .input("batch", sql.UniqueIdentifier, batch_id)
                .input("note", sql.NVarChar(255),
                       `Pha chế ${quantity} x ${product_id}`)
                .query(`
                    INSERT INTO dbo.inventory_transactions
                        (material_id, employee_id, transaction_type,
                         quantity, transaction_date, note,
                         production_batch_id)
                    VALUES
                        (@id, @employee, 'OUT',
                         @qty, SYSDATETIME(), @note, @batch)
                `);
        }

        await tx.commit();

        res.status(201).json({
            message: "Pha chế thành công, đã trừ kho",
            batch_id,
            product_id,
            quantity,
            used
        });

    } catch (err) {
        try { await tx.rollback(); } catch (_) {}
        throw err;
    }
}));

module.exports = router;
