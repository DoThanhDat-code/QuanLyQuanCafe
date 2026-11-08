
const express = require("express");
const router = express.Router();
const { connectDB } = require("../config/db");

router.get("/", async (req, res) => {
    try {
        const pool = await connectDB();

        const result = await pool.request().query(`
            SELECT
                p.product_id,
                p.product_name,
                c.category_name,
                p.price,
                p.is_active
            FROM dbo.products p
            JOIN dbo.categories c
                ON p.category_id = c.category_id
            ORDER BY p.product_id
        `);

        res.json(result.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Khong the lay danh sach san pham"
        });
    }
});

module.exports = router;
