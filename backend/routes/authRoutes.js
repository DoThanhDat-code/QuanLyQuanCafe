const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");

const { sql, connectDB } = require("../config/db");
const authenticate = require("../middleware/authenticate");

const router = express.Router();

// Đăng nhập và lưu phiên
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body || {};

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
                SELECT user_id, username, password_hash, role, is_active
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

        const sessionId = randomUUID();
        const expiresAtSeconds = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
        const expiresAt = new Date(expiresAtSeconds * 1000);

        const token = jwt.sign(
            {
                userId: user.user_id,
                role: user.role,
                sessionId,
                exp: expiresAtSeconds
            },
            process.env.JWT_SECRET,
            { algorithm: "HS256" }
        );

        const sessionInsert = await pool.request()
            .input("sessionId", sql.UniqueIdentifier, sessionId)
            .input("userId", sql.VarChar(10), user.user_id)
            .input("passwordHash", sql.VarChar(255), user.password_hash)
            .input("expiresAt", sql.DateTime2(3), expiresAt)
            .query(`
                INSERT INTO dbo.user_sessions (session_id, user_id, expires_at)
                SELECT @sessionId, user_id, @expiresAt
                FROM dbo.users WITH (UPDLOCK)
                WHERE user_id = @userId
                  AND is_active = 1
                  AND password_hash = @passwordHash
            `);

        if (sessionInsert.rowsAffected[0] !== 1) {
            return res.status(401).json({
                error: "Tài khoản vừa thay đổi. Vui lòng đăng nhập lại."
            });
        }

        return res.json({
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

        return res.status(500).json({
            error: "Khong the dang nhap"
        });
    }
});

// Lấy thông tin tài khoản từ phiên đã được xác thực
router.get("/me", authenticate, (req, res) => {
    return res.json({
        userId: req.user.user_id,
        username: req.user.username,
        role: req.user.role
    });
});

// Người dùng tự đổi mật khẩu
router.patch("/change-password", authenticate, async (req, res) => {
    const userId = req.user.user_id;
    const { currentPassword, newPassword } = req.body || {};

    if (
        typeof currentPassword !== "string" ||
        currentPassword.length === 0 ||
        typeof newPassword !== "string" ||
        newPassword.length < 12 ||
        Buffer.byteLength(newPassword, "utf8") > 72
    ) {
        return res.status(400).json({
            error: "Hãy nhập mật khẩu hiện tại và mật khẩu mới từ 12 ký tự, tối đa 72 byte."
        });
    }

    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input("id", sql.VarChar(10), userId)
            .query(`
                SELECT password_hash
                FROM dbo.users
                WHERE user_id = @id
                  AND is_active = 1
            `);

        const account = result.recordset[0];

        if (!account) {
            return res.status(401).json({
                error: "Tài khoản không còn hoạt động."
            });
        }

        if (!(await bcrypt.compare(currentPassword, account.password_hash))) {
            return res.status(400).json({
                error: "Mật khẩu hiện tại không đúng."
            });
        }

        if (await bcrypt.compare(newPassword, account.password_hash)) {
            return res.status(400).json({
                error: "Mật khẩu mới phải khác mật khẩu hiện tại."
            });
        }

        const newHash = await bcrypt.hash(newPassword, 12);

                const update = await pool.request()
            .input("id", sql.VarChar(10), userId)
            .input("oldHash", sql.VarChar(255), account.password_hash)
            .input("newHash", sql.VarChar(255), newHash)
            .query(`
                SET XACT_ABORT ON;

                BEGIN TRY
                    BEGIN TRANSACTION;

                    UPDATE dbo.users
                    SET password_hash = @newHash
                    WHERE user_id = @id
                      AND is_active = 1
                      AND password_hash = @oldHash;

                    DECLARE @updated INT = @@ROWCOUNT;

                    IF @updated = 1
                    BEGIN
                        UPDATE dbo.user_sessions
                        SET revoked_at = SYSUTCDATETIME()
                        WHERE user_id = @id
                          AND revoked_at IS NULL;
                    END;

                    COMMIT TRANSACTION;

                    SELECT @updated AS updated;
                END TRY
                BEGIN CATCH
                    IF @@TRANCOUNT > 0
                        ROLLBACK TRANSACTION;

                    THROW;
                END CATCH;
            `);

        if (update.recordset[0]?.updated !== 1) {
            return res.status(409).json({
                error: "Tài khoản vừa thay đổi. Hãy đăng nhập lại và thử lại."
            });
        }

        return res.status(200).json({
            message: "Đổi mật khẩu thành công."
        });
    } catch (error) {
        console.error("Lỗi đổi mật khẩu:", error);

        return res.status(500).json({
            error: "Không thể đổi mật khẩu."
        });
    }
});
// Đăng xuất và thu hồi phiên hiện tại
router.post("/logout", authenticate, async (req, res) => {
    try {
        const pool = await connectDB();

        await pool.request()
            .input("sessionId", sql.UniqueIdentifier, req.sessionId)
            .input("userId", sql.VarChar(10), req.user.user_id)
            .query(`
                UPDATE dbo.user_sessions
                SET revoked_at = SYSUTCDATETIME()
                WHERE session_id = @sessionId
                  AND user_id = @userId
                  AND revoked_at IS NULL
            `);

        return res.status(204).end();
    } catch (error) {
        console.error("Lỗi đăng xuất:", error);
        return res.status(500).json({
            error: "Không thể kết thúc phiên đăng nhập."
        });
    }
});
module.exports = router;