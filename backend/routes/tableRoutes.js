
const express = require("express");
const router = express.Router();

const { sql, connectDB } = require("../config/db");

const validStatuses = [
    "available",
    "occupied",
    "reserved",
    "maintenance"
];

// 1. LAY DANH SACH BAN
// Giu nguyen API GET hien tai
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

// 2. XEM CHI TIET BAN
router.get("/:id", async (req, res) => {
    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input("id", sql.VarChar(10), req.params.id)
            .query(`
                SELECT *
                FROM dbo.[tables]
                WHERE table_id = @id
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
router.post("/", async (req, res) => {
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

// 4. SUA THONG TIN BAN
router.put("/:id", async (req, res) => {
    try {
        const { table_name, seats } = req.body || {};

        if (
            typeof table_name !== "string" ||
            !table_name.trim() ||
            table_name.length > 100 ||
            !Number.isInteger(seats) ||
            seats <= 0
        ) {
            return res.status(400).json({
                error: "Ten ban hoac so ghe khong hop le"
            });
        }

        const pool = await connectDB();

        const result = await pool.request()
            .input("id", sql.VarChar(10), req.params.id)
            .input("name", sql.NVarChar(100), table_name.trim())
            .input("seats", sql.Int, seats)
            .query(`
                UPDATE dbo.[tables]
                SET table_name = @name,
                    seats = @seats
                OUTPUT INSERTED.*
                WHERE table_id = @id
                  AND is_active = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                error: "Khong tim thay ban dang hoat dong"
            });
        }

        res.json({
            message: "Cap nhat ban thanh cong",
            table: result.recordset[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Khong the sua ban"
        });
    }
});

// 5. CAP NHAT TRANG THAI BAN
router.patch("/:id/status", async (req, res) => {
    try {
        const { status } = req.body || {};

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                error: "Trang thai khong hop le"
            });
        }

        const pool = await connectDB();

        const result = await pool.request()
            .input("id", sql.VarChar(10), req.params.id)
            .input("status", sql.VarChar(20), status)
            .query(`
                UPDATE dbo.[tables]
                SET status = @status
                OUTPUT INSERTED.*
                WHERE table_id = @id
                  AND is_active = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                error: "Khong tim thay ban dang hoat dong"
            });
        }

        res.json({
            message: "Cap nhat trang thai thanh cong",
            table: result.recordset[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Khong the cap nhat trang thai"
        });
    }
});

// 6. NGUNG SU DUNG BAN (KHONG XOA DU LIEU)
router.delete("/:id", async (req, res) => {
    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input("id", sql.VarChar(10), req.params.id)
            .query(`
                UPDATE dbo.[tables]
                SET is_active = 0
                OUTPUT INSERTED.*
                WHERE table_id = @id
                  AND is_active = 1
                  AND status = 'available'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM dbo.orders
                      WHERE orders.table_id = @id
                        AND orders.status IN (
                            'pending',
                            'preparing',
                            'serving'
                        )
                  )
            `);

        if (result.recordset.length === 0) {
            return res.status(409).json({
                error: "Ban khong ton tai, da ngung su dung hoac khong du dieu kien ngung su dung"
            });
        }

        res.json({
            message: "Da ngung su dung ban",
            table: result.recordset[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Khong the ngung su dung ban"
        });
    }
});

module.exports = router;
