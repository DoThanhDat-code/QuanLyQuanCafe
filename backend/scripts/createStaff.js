
require("dotenv").config();

const bcrypt = require("bcryptjs");
const { sql, connectDB } = require("../config/db");

async function main() {
    const username = "phucvu01";
    const password = process.env.STAFF_PASSWORD;
    const userId = "U002";
    const employeeId = "NV02";

    if (!password || password.length < 12) {
        throw new Error(
            "STAFF_PASSWORD phai co it nhat 12 ky tu"
        );
    }

    const pool = await connectDB();

    const employee = await pool.request()
        .input("employeeId", sql.VarChar(10), employeeId)
        .query(`
            SELECT employee_id
            FROM dbo.employees
            WHERE employee_id = @employeeId
        `);

    if (employee.recordset.length === 0) {
        throw new Error("Khong tim thay nhan vien NV02");
    }

    const existing = await pool.request()
        .input("userId", sql.VarChar(10), userId)
        .input("username", sql.VarChar(50), username)
        .query(`
            SELECT user_id FROM dbo.users
            WHERE user_id = @userId
               OR username = @username
               OR employee_id = 'NV02'
        `);

    if (existing.recordset.length > 0) {
        throw new Error("Tai khoan hoac nhan vien da duoc lien ket");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.request()
        .input("userId", sql.VarChar(10), userId)
        .input("employeeId", sql.VarChar(10), employeeId)
        .input("username", sql.VarChar(50), username)
        .input("hash", sql.VarChar(255), passwordHash)
        .query(`
            INSERT INTO dbo.users (
                user_id,
                employee_id,
                username,
                password_hash,
                role,
                is_active
            )
            VALUES (
                @userId,
                @employeeId,
                @username,
                @hash,
                'phucvu',
                1
            )
        `);

    console.log("Tao tai khoan phucvu01 thanh cong!");
}

main()
    .catch(error => {
        console.error("Loi:", error.message);
        process.exitCode = 1;
    })
    .finally(() => sql.close());
