
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { sql, connectDB } = require("../config/db");

const router = express.Router();

// DANG NHAP
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (
            typeof username !== "string" ||
            typeof password !== "string" ||
            !username.trim() ||
            !password
        ) {
            return res.status(400).json({
                error: "Vui long nhap tai khoan va mat khau"
            });
        }

        const pool = await connectDB();

        const result = await pool.request()
            .input("username", sql.VarChar(50), username.trim())
            .query(`
                SELECT
                    user_id,
                    username,
                    password_hash,
                    role,
                    is_active
                FROM dbo.users
                WHERE username = @username
            `);

        const user = result.recordset[0];

        if (
            !user ||
            !user.is_active ||
            !(await bcrypt.compare(password, user.password_hash))
        ) {
            return res.status(401).json({
                error: "Tai khoan hoac mat khau khong dung"
            });
        }

        const token = jwt.sign(
            {
                userId: user.user_id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                algorithm: "HS256",
                expiresIn: "2h"
            }
        );

        res.json({
            message: "Dang nhap thanh cong",
            token,
            user: {
                userId: user.user_id,
                username: user.username,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Loi dang nhap:", error);

        res.status(500).json({
            error: "Khong the dang nhap"
        });
    }
});

// KIEM TRA TOKEN VA THONG TIN TAI KHOAN
router.get("/me", async (req, res) => {
    try {
        const authorization = req.headers.authorization || "";

        if (!authorization.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Chua dang nhap"
            });
        }

        const token = authorization.slice(7);

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET,
            { algorithms: ["HS256"] }
        );

        const pool = await connectDB();

        const result = await pool.request()
            .input("id", sql.VarChar(10), decoded.userId)
            .query(`
                SELECT user_id, username, role
                FROM dbo.users
                WHERE user_id = @id
                  AND is_active = 1
            `);

        const user = result.recordset[0];

        if (!user) {
            return res.status(401).json({
                error: "Tai khoan khong con hoat dong"
            });
        }

        res.json({
            userId: user.user_id,
            username: user.username,
            role: user.role
        });

    } catch (error) {
        res.status(401).json({
            error: "Token khong hop le hoac da het han"
        });
    }
});

module.exports = router;
