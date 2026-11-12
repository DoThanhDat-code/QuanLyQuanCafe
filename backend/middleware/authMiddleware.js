
const jwt = require("jsonwebtoken");

const { sql, connectDB } = require("../config/db");

// ============================================
// MIDDLEWARE XAC THUC TAI KHOAN
// ============================================

async function authMiddleware(req, res, next) {

    // KIEM TRA HEADER AUTHORIZATION
    const authorization =
        req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Vui lòng đăng nhập"
        });
    }

    // LAY TOKEN
    const token = authorization.slice(7).trim();

    let decoded;

    // KIEM TRA TOKEN
    try {
        decoded = jwt.verify(
            token,
            process.env.JWT_SECRET,
            {
                algorithms: ["HS256"]
            }
        );

    } catch (error) {
        return res.status(401).json({
            error: "Token không hợp lệ hoặc đã hết hạn"
        });
    }

    // KIEM TRA MA NGUOI DUNG
    if (
        typeof decoded.userId !== "string" ||
        !decoded.userId ||
        decoded.userId.length > 10
    ) {
        return res.status(401).json({
            error: "Thông tin tài khoản không hợp lệ"
        });
    }

    try {

        // KET NOI SQL SERVER
        const pool = await connectDB();

        // KIEM TRA TAI KHOAN TRONG DATABASE
        const result = await pool.request()

            .input(
                "id",
                sql.VarChar(10),
                decoded.userId
            )

            .query(`
                SELECT
                    user_id,
                    username,
                    role,
                    is_active
                FROM dbo.users
                WHERE user_id = @id
                  AND is_active = 1
            `);

        const user = result.recordset[0];

        // TAI KHOAN KHONG TON TAI HOAC BI KHOA
        if (!user) {
            return res.status(401).json({
                error: "Tài khoản không còn hoạt động"
            });
        }

        // GAN THONG TIN NGUOI DUNG
        req.user = {
            userId: user.user_id,
            username: user.username,
            role: user.role
        };

        // CHO PHEP CHAY TIEP API
        next();

    } catch (error) {

        console.error(
            "Loi xac thuc tai khoan:",
            error
        );

        return res.status(500).json({
            error: "Không thể xác thực tài khoản"
        });
    }
}

// ============================================
// XUAT MIDDLEWARE
// ============================================

module.exports = authMiddleware;
