
const jwt = require("jsonwebtoken");
const { sql, connectDB } = require("../config/db");

async function requireAdmin(req, res, next) {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Chua dang nhap"
        });
    }

    try {
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

        if (user.role !== "admin") {
            return res.status(403).json({
                error: "Chi Admin moi co quyen thuc hien"
            });
        }

        req.admin = user;
        next();

    } catch (error) {
        if (
            error.name === "TokenExpiredError" ||
            error.name === "JsonWebTokenError" ||
            error.name === "NotBeforeError"
        ) {
            return res.status(401).json({
                error: "Token khong hop le hoac da het han"
            });
        }

        console.error("Loi kiem tra Admin:", error);

        return res.status(500).json({
            error: "Khong the kiem tra quyen Admin"
        });
    }
}

module.exports = requireAdmin;
