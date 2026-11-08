
require("dotenv").config();

const bcrypt = require("bcryptjs");
const { sql, connectDB } = require("../config/db");

async function main() {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;

    if (
        !username ||
        !password ||
        password.length < 12
    ) {
        throw new Error(
            "Tai khoan va mat khau phai hop le; mat khau toi thieu 12 ky tu"
        );
    }

    const pool = await connectDB();

    const existing = await pool.request()
        .input("username", sql.VarChar(50), username)
        .query(`
            SELECT user_id
            FROM dbo.users
            WHERE username = @username
               OR user_id = 'U001'
        `);

    if (existing.recordset.length > 0) {
        throw new Error("Tai khoan admin da ton tai");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.request()
        .input("id", sql.VarChar(10), "U001")
        .input("username", sql.VarChar(50), username)
        .input("hash", sql.VarChar(255), passwordHash)
        .query(`
            INSERT INTO dbo.users (
                user_id,
                username,
                password_hash,
                role,
                is_active
            )
            VALUES (
                @id,
                @username,
                @hash,
                'admin',
                1
            )
        `);

    console.log("Tao tai khoan Admin thanh cong!");
}

main()
    .catch(error => {
        console.error("Loi:", error.message);
        process.exitCode = 1;
    })
    .finally(() => sql.close());
