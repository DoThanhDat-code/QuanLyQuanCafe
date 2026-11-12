const express = require("express");
const { connectDB } = require("../config/db");
const authenticate = require("../middleware/authenticate");

const router = express.Router();

const tableReadRoles = ["admin", "waiter", "phucvu", "cashier", "thungan"];

// Lấy danh sách bàn
router.get("/", authenticate, async (req, res) => {
    if (!tableReadRoles.includes(req.user.role)) {
        return res.status(403).json({
            error: "Bạn không có quyền xem danh sách bàn."
        });
    }

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

        return res.json(result.recordset);
    } catch (error) {
        console.error("Loi lay danh sach ban:", error);

        return res.status(500).json({
            error: "Khong the lay danh sach ban"
        });
    }
});

module.exports = router;