const jwt = require("jsonwebtoken");
const { sql, connectDB } = require("../config/db");

module.exports = async function requireManager(req, res, next) {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Chua dang nhap" });
    try {
        const token = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ["HS256"] });
        const pool = await connectDB();
        const result = await pool.request().input("id", sql.VarChar(10), token.userId).query(`
            SELECT u.user_id, u.role, u.is_active, e.is_active AS employee_active
            FROM dbo.users u LEFT JOIN dbo.employees e ON e.employee_id = u.employee_id
            WHERE u.user_id = @id
        `);
        const user = result.recordset[0];
        if (!user || !user.is_active || user.employee_active === false || user.employee_active === 0) {
            return res.status(401).json({ error: "Tai khoan khong con hoat dong" });
        }
        if (!["admin", "manager"].includes(user.role)) {
            return res.status(403).json({ error: "Khong co quyen quan ly" });
        }
        req.manager = user;
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
            return res.status(401).json({ error: "Token khong hop le hoac da het han" });
        }
        console.error("Loi kiem tra quyen:", error);
        return res.status(500).json({ error: "Khong the kiem tra quyen" });
    }
};
