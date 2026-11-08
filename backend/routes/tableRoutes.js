
const express = require("express");
const router = express.Router();

const { connectDB } = require("../config/db");

// LAY DANH SACH BAN
router.get("/", async (req, res) => {
    try {
        const pool = await connectDB();

        const result = await pool.request().query(`
            SELECT
                table_id,
                table_name,
                seats,
                status,
                is_active
            FROM dbo.[tables]
            ORDER BY table_id
        `);

        res.json(result.recordset);

    } catch (error) {
        console.error("Loi lay danh sach ban:", error);

        res.status(500).json({
            error: "Khong the lay danh sach ban"
        });
    }
});

module.exports = router;
