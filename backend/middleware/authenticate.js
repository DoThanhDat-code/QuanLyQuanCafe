const jwt = require("jsonwebtoken");
const { sql, connectDB } = require("../config/db");

async function authenticate(req, res, next) {
    const token = (req.headers.authorization || "").match(/^Bearer (\S+)$/i)?.[1];

    if (!token) {
        return res.status(401).json({ error: "Bạn chưa đăng nhập." });
    }

    let session;
    try {
        session = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ["HS256"]
        });
    } catch {
        return res.status(401).json({
            error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn."
        });
    }

    const { userId, sessionId } = session;
    const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

    if (
        typeof userId !== "string" ||
        !/^[A-Za-z0-9]{1,10}$/.test(userId) ||
        typeof sessionId !== "string" ||
        !uuidPattern.test(sessionId)
    ) {
        return res.status(401).json({
            error: "Vui lòng đăng nhập lại."
        });
    }

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input("userId", sql.VarChar(10), userId)
            .input("sessionId", sql.UniqueIdentifier, sessionId)
            .query(`
                SELECT u.user_id, u.username, u.role, u.employee_id
                FROM dbo.user_sessions AS s
                JOIN dbo.users AS u ON u.user_id = s.user_id
                WHERE s.session_id = @sessionId
                  AND s.user_id = @userId
                  AND s.revoked_at IS NULL
                  AND s.expires_at > SYSUTCDATETIME()
                  AND u.is_active = 1
            `);

        const user = result.recordset[0];

        if (!user) {
            return res.status(401).json({
                error: "Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại."
            });
        }

        req.user = user;
        req.sessionId = sessionId;
    } catch (error) {
        console.error("Lỗi kiểm tra phiên:", error);
        return res.status(500).json({
            error: "Không thể kiểm tra phiên đăng nhập."
        });
    }

    next();
}

module.exports = authenticate;