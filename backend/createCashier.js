
require("dotenv").config();

const bcrypt = require("bcryptjs");
const { sql, connectDB } = require("./config/db");

async function createCashier() {
  try {
    const pool = await connectDB();

    const username = "thungan";
    const password = "ThuNgan@2026";
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.request()
      .input("username", sql.VarChar(50), username)
      .input("employeeId", sql.VarChar(10), "NV03")
      .input("passwordHash", sql.VarChar(255), passwordHash)
      .query(`
        INSERT INTO dbo.users
        (
          user_id,
          employee_id,
          username,
          password_hash,
          role,
          is_active,
          created_at
        )
        SELECT
          'U_TEST01',
          @employeeId,
          @username,
          @passwordHash,
          'thungan',
          1,
          GETDATE()
        WHERE NOT EXISTS (
          SELECT 1
          FROM dbo.users
          WHERE username = @username
             OR user_id = 'U_TEST01'
        )
      `);

    if (result.rowsAffected[0] === 0) {
      console.log("Tai khoan da ton tai, khong tao trung.");
    } else {
      console.log("Da tao tai khoan thu ngan thanh cong!");
    }
  } catch (error) {
    console.error("Loi tao tai khoan:", error.message);
  } finally {
    sql.close();
  }
}

createCashier();
