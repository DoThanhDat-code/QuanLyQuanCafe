
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { sql, connectDB } = require("../config/db");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

router.use(requireAdmin);

// Admin tao tai khoan moi
router.post("/", async (req, res) => {
    const { username, password, role, employee_id } = req.body || {};

    const allowedRoles = ["manager", "phucvu", "thungan", "kho"];

    if (
        typeof username !== "string" ||
        !/^[a-zA-Z0-9_]{3,50}$/.test(username) ||
        typeof password !== "string" ||
        password.length < 12 ||
        password.length > 72 ||
        !allowedRoles.includes(role) ||
        (employee_id != null &&
            (typeof employee_id !== "string" ||
             employee_id.length > 10))
    ) {
        return res.status(400).json({
            error: "Thong tin tai khoan khong hop le"
        });
    }

    try {
        const pool = await connectDB();

        const existing = await pool.request()
            .input("username", sql.VarChar(50), username)
            .query(`
                SELECT user_id
                FROM dbo.users
                WHERE username = @username
            `);

        if (existing.recordset.length > 0) {
            return res.status(409).json({
                error: "Ten dang nhap da ton tai"
            });
        }

        // Kiem tra ma nhan vien neu co
        if (employee_id) {
            const employee = await pool.request()
                .input("employeeId", sql.VarChar(10), employee_id)
                .query(`
                    SELECT employee_id
                    FROM dbo.employees
                    WHERE employee_id = @employeeId
                      AND is_active = 1
                `);

            if (employee.recordset.length === 0) {
                return res.status(400).json({
                    error: "Nhan vien khong ton tai hoac da nghi"
                });
            }
        }

        const userId = "U" +
            crypto.randomBytes(4).toString("hex").toUpperCase();

        const passwordHash = await bcrypt.hash(password, 12);

        await pool.request()
            .input("id", sql.VarChar(10), userId)
            .input("employeeId", sql.VarChar(10), employee_id || null)
            .input("username", sql.VarChar(50), username)
            .input("hash", sql.VarChar(255), passwordHash)
            .input("role", sql.VarChar(20), role)
            .query(`
                INSERT INTO dbo.users
                    (user_id, employee_id, username,
                     password_hash, role, is_active)
                VALUES
                    (@id, @employeeId, @username,
                     @hash, @role, 1)
            `);

        return res.status(201).json({
            message: "Tao tai khoan thanh cong",
            user: {
                userId,
                username,
                role,
                employee_id: employee_id || null
            }
        });

    } catch (error) {
        console.error("Loi tao tai khoan:", error);

        if (error.number === 2601 || error.number === 2627) {
            return res.status(409).json({
                error: "Tai khoan hoac nhan vien da duoc su dung"
            });
        }

        return res.status(500).json({
            error: "Khong the tao tai khoan"
        });
    }
});

    // ADMIN XEM DANH SACH TAI KHOAN
    router.get("/", async (req, res) => {
        try {
            const pool = await connectDB();

            const result = await pool.request().query(`
                SELECT
                    u.user_id,
                    u.username,
                    u.role,
                    u.is_active,
                    u.created_at,
                    u.employee_id,
                    e.full_name
                FROM dbo.users u
                LEFT JOIN dbo.employees e
                    ON u.employee_id = e.employee_id
                ORDER BY u.created_at DESC
            `);

            return res.status(200).json(result.recordset);

        } catch (error) {
            console.error("Loi lay danh sach tai khoan:", error);

            return res.status(500).json({
                error: "Khong the lay danh sach tai khoan"
            });
        }
    });

 // ADMIN THAY DOI QUYEN TAI KHOAN
router.patch("/:id/role", async (req, res) => {
    const { id } = req.params;
    const { role } = req.body || {};

    const allowedRoles = [
        "manager",
        "phucvu",
        "thungan",
        "kho"
    ];

    if (
        !allowedRoles.includes(role) ||
        !/^[A-Za-z0-9]{1,10}$/.test(id)
    ) {
        return res.status(400).json({
            error: "Thong tin phan quyen khong hop le"
        });
    }

    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input("id", sql.VarChar(10), id)
            .input("role", sql.VarChar(20), role)
            .query(`
                UPDATE dbo.users
                SET role = @role
                OUTPUT inserted.user_id,
                       inserted.username,
                       inserted.role
                WHERE user_id = @id
                  AND role <> 'admin'
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                error: "Khong tim thay tai khoan co the doi quyen"
            });
        }

        return res.status(200).json({
            message: "Cap nhat quyen thanh cong",
            user: result.recordset[0]
        });

    } catch (error) {
        console.error("Loi cap nhat quyen:", error);

        return res.status(500).json({
            error: "Khong the cap nhat quyen"
        });
    }
});

router.patch("/:id/status", async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body || {};

    if (
        !/^[A-Za-z0-9]{1,10}$/.test(id) ||
        typeof is_active !== "boolean"
    ) {
        return res.status(400).json({
            error: "Du lieu khong hop le"
        });
    }

    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input("id", sql.VarChar(10), id)
            .input("active", sql.Bit, is_active)
            .query(`
                UPDATE dbo.users
                SET is_active = @active
                OUTPUT
                    inserted.user_id,
                    inserted.username,
                    inserted.role,
                    inserted.is_active
                WHERE user_id = @id
                  AND role <> 'admin'
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                error: "Khong tim thay tai khoan co the cap nhat"
            });
        }

        return res.status(200).json({
            message: "Cap nhat trang thai thanh cong",
            user: result.recordset[0]
        });

    } catch (error) {
        console.error("Loi cap nhat trang thai:", error);

        return res.status(500).json({
            error: "Khong the cap nhat trang thai"
        });
    }
});

module.exports = router;
