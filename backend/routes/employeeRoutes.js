
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { sql, connectDB } = require("../config/db");
const requireAdmin = require("../middleware/requireAdmin");
const { validateEmployee } = require("../utils/employeeValidation");

const router = express.Router();
router.use(requireAdmin);

const fields = `e.employee_id, e.full_name, e.phone, e.email, e.position, e.hire_date,
  e.is_active, u.user_id, u.username, u.role, u.is_active AS account_active`;

function bind(request, data) {
  return request
    .input("name", sql.NVarChar(100), data.fullName)
    .input("position", sql.NVarChar(50), data.position)
    .input("phone", sql.VarChar(15), data.phone)
    .input("email", sql.VarChar(100), data.email)
    .input("active", sql.Bit, data.active)
    .input("username", sql.VarChar(50), data.username || null)
    .input("role", sql.VarChar(20), data.role || null)
    .input("accountActive", sql.Bit, data.accountActive);
}

function failure(error, res) {
  if (res.headersSent) return;
  const number = error?.number ?? error?.originalError?.info?.number;

  if (error?.code === "EMPLOYEE_WRONG_DATABASE") {
    return res.status(503).json({
      error: "Ket noi sai database duoc phep"
    });
  }

  if ([2601, 2627].includes(number)) {
    return res.status(409).json({
      error: "Du lieu trung khoa duy nhat"
    });
  }

  console.error("Loi quan ly nhan vien:", error);
  return res.status(500).json({
    error: "Khong the xu ly nhan vien"
  });
}

async function verifyDatabase(tx) {
  const expected = process.env.EMPLOYEE_EXPECTED_DB;
  if (!expected) return;

  const result = await new sql.Request(tx)
    .query("SELECT DB_NAME() AS database_name");

  if (result.recordset[0]?.database_name !== expected) {
    const error = new Error("Wrong database");
    error.code = "EMPLOYEE_WRONG_DATABASE";
    throw error;
  }
}

async function findEmployeeConflict(tx, data, excludeId = null) {
  if (!data.email && !data.phone) return null;

  const result = await new sql.Request(tx)
    .input("email", sql.VarChar(100), data.email)
    .input("phone", sql.VarChar(15), data.phone)
    .input("excludeId", sql.VarChar(10), excludeId)
    .query(`
      SELECT TOP (1)
        e.employee_id,
        CASE WHEN @email IS NOT NULL AND e.email = @email
          THEN 'email' ELSE 'phone' END AS duplicate_field
      FROM dbo.employees e WITH (UPDLOCK, HOLDLOCK)
      WHERE ((@email IS NOT NULL AND e.email = @email)
          OR (@phone IS NOT NULL AND e.phone = @phone))
        AND (@excludeId IS NULL OR e.employee_id <> @excludeId)
    `);

  return result.recordset[0] || null;
}

async function findUsernameConflict(tx, username, excludeUserId = null) {
  if (!username) return false;

  const result = await new sql.Request(tx)
    .input("username", sql.VarChar(50), username)
    .input("excludeUserId", sql.VarChar(10), excludeUserId)
    .query(`
      SELECT TOP (1) user_id
      FROM dbo.users WITH (UPDLOCK, HOLDLOCK)
      WHERE username = @username
        AND (@excludeUserId IS NULL OR user_id <> @excludeUserId)
    `);

  return result.recordset.length > 0;
}

async function rollbackSilently(tx) {
  try {
    await tx.rollback();
  } catch (error) {
    console.error("Loi rollback employees:", error);
  }
}

function validEmployeeId(id) {
  return typeof id === "string" && /^[A-Za-z0-9]{1,10}$/.test(id);
}

router.get("/", async (req, res) => {
  try {
    const rawQuery = req.query.q;

    if (
      rawQuery !== undefined &&
      (typeof rawQuery !== "string" || rawQuery.trim().length > 100)
    ) {
      return res.status(400).json({
        error: "Tu khoa tim kiem khong hop le"
      });
    }

    const keyword = (rawQuery || "").trim();
    const search = `%${keyword.replace(/[~%_\[]/g, "~$&")}%`;
    const pool = await connectDB();

    const result = await pool.request()
      .input("search", sql.NVarChar(250), search)
      .query(`
        SELECT ${fields}
        FROM dbo.employees e
        LEFT JOIN dbo.users u ON u.employee_id = e.employee_id
        WHERE e.employee_id LIKE @search ESCAPE '~'
           OR e.full_name LIKE @search ESCAPE '~'
           OR e.phone LIKE @search ESCAPE '~'
           OR e.position LIKE @search ESCAPE '~'
        ORDER BY e.employee_id
      `);

    return res.status(200).json(result.recordset);
  } catch (error) {
    return failure(error, res);
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!validEmployeeId(req.params.id)) {
      return res.status(400).json({
        error: "Ma nhan vien khong hop le"
      });
    }

    const pool = await connectDB();

    const result = await pool.request()
      .input("id", sql.VarChar(10), req.params.id)
      .query(`
        SELECT ${fields}
        FROM dbo.employees e
        LEFT JOIN dbo.users u ON u.employee_id = e.employee_id
        WHERE e.employee_id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        error: "Khong tim thay nhan vien"
      });
    }

    return res.status(200).json(result.recordset[0]);
  } catch (error) {
    return failure(error, res);
  }
});

router.post("/", async (req, res) => {
  const data = validateEmployee(req.body, true);

  if (!data) {
    return res.status(400).json({
      error: "Thong tin nhan vien khong hop le"
    });
  }

  let tx;
  let started = false;

  try {
    const passwordHash = data.username
      ? await bcrypt.hash(data.password, 12)
      : null;

    const pool = await connectDB();
    tx = new sql.Transaction(pool);

    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    started = true;

    await verifyDatabase(tx);

    const conflict = await findEmployeeConflict(tx, data);

    if (conflict) {
      await tx.rollback();
      started = false;

      return res.status(409).json({
        error: conflict.duplicate_field === "email"
          ? "Email nhan vien da ton tai"
          : "So dien thoai nhan vien da ton tai"
      });
    }

    if (await findUsernameConflict(tx, data.username)) {
      await tx.rollback();
      started = false;

      return res.status(409).json({
        error: "Ten dang nhap da ton tai"
      });
    }

    const id = "NV" + crypto.randomBytes(4)
      .toString("hex").toUpperCase();

    const userId = "U" + crypto.randomBytes(4)
      .toString("hex").toUpperCase();

    await bind(new sql.Request(tx), data)
      .input("id", sql.VarChar(10), id)
      .query(`
        INSERT dbo.employees(
          employee_id, full_name, phone, email, position, is_active
        )
        VALUES(@id, @name, @phone, @email, @position, @active)
      `);

    if (data.username) {
      await bind(new sql.Request(tx), data)
        .input("id", sql.VarChar(10), id)
        .input("userId", sql.VarChar(10), userId)
        .input("hash", sql.VarChar(255), passwordHash)
        .query(`
          INSERT dbo.users(
            user_id, employee_id, username, password_hash, role, is_active
          )
          VALUES(@userId, @id, @username, @hash, @role, @accountActive)
        `);
    }

    await tx.commit();
    started = false;

    return res.status(201).json({
      employee_id: id
    });

  } catch (error) {
    if (started) await rollbackSilently(tx);
    return failure(error, res);
  }
});

router.put("/:id", async (req, res) => {
  if (!validEmployeeId(req.params.id)) {
    return res.status(400).json({
      error: "Ma nhan vien khong hop le"
    });
  }

  const data = validateEmployee(req.body, false);

  if (!data) {
    return res.status(400).json({
      error: "Thong tin nhan vien khong hop le"
    });
  }

  let tx;
  let started = false;

  try {
    const passwordHash = data.password
      ? await bcrypt.hash(data.password, 12)
      : null;

    const pool = await connectDB();
    tx = new sql.Transaction(pool);

    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    started = true;

    await verifyDatabase(tx);

    const existing = await new sql.Request(tx)
      .input("id", sql.VarChar(10), req.params.id)
      .query(`
        SELECT e.employee_id, u.user_id
        FROM dbo.employees e WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN dbo.users u ON u.employee_id = e.employee_id
        WHERE e.employee_id = @id
      `);

    const row = existing.recordset[0];

    if (!row) {
      await tx.rollback();
      started = false;

      return res.status(404).json({
        error: "Khong tim thay nhan vien"
      });
    }

    if (row.user_id && !data.username) {
      await tx.rollback();
      started = false;

      return res.status(400).json({
        error: "Khong duoc xoa tai khoan qua bieu mau nay"
      });
    }

    if (!row.user_id && data.username && !data.password) {
      await tx.rollback();
      started = false;

      return res.status(400).json({
        error: "Tai khoan moi can mat khau it nhat 12 ky tu"
      });
    }

    const conflict = await findEmployeeConflict(
      tx, data, req.params.id
    );

    if (conflict) {
      await tx.rollback();
      started = false;

      return res.status(409).json({
        error: conflict.duplicate_field === "email"
          ? "Email nhan vien da ton tai"
          : "So dien thoai nhan vien da ton tai"
      });
    }

    if (await findUsernameConflict(
      tx, data.username, row.user_id
    )) {
      await tx.rollback();
      started = false;

      return res.status(409).json({
        error: "Ten dang nhap da ton tai"
      });
    }

    await bind(new sql.Request(tx), data)
      .input("id", sql.VarChar(10), req.params.id)
      .query(`
        UPDATE dbo.employees
        SET full_name = @name,
            phone = @phone,
            email = @email,
            position = @position,
            is_active = @active
        WHERE employee_id = @id
      `);

    if (row.user_id) {
      const request = bind(new sql.Request(tx), data)
        .input("userId", sql.VarChar(10), row.user_id);

      if (passwordHash) {
        request.input(
          "hash", sql.VarChar(255), passwordHash
        );
      }

      await request.query(`
        UPDATE dbo.users
        SET username = @username,
            role = @role,
            is_active = @accountActive
            ${passwordHash ? ", password_hash = @hash" : ""}
        WHERE user_id = @userId
      `);

    } else if (data.username) {
      const userId = "U" + crypto.randomBytes(4)
        .toString("hex").toUpperCase();

      await bind(new sql.Request(tx), data)
        .input("id", sql.VarChar(10), req.params.id)
        .input("userId", sql.VarChar(10), userId)
        .input("hash", sql.VarChar(255), passwordHash)
        .query(`
          INSERT dbo.users(
            user_id, employee_id, username,
            password_hash, role, is_active
          )
          VALUES(
            @userId, @id, @username,
            @hash, @role, @accountActive
          )
        `);
    }

    await tx.commit();
    started = false;

    return res.status(200).json({
      employee_id: req.params.id
    });

  } catch (error) {
    if (started) await rollbackSilently(tx);
    return failure(error, res);
  }
});

module.exports = router;
