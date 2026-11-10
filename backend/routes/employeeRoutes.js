const express = require("express");
const bcrypt = require("bcryptjs");
const { sql, connectDB } = require("../config/db");
const requireManager = require("../middleware/requireManager");
const router = express.Router();
router.use(requireManager);

const roles = new Set(["manager", "phucvu", "thungan", "kho"]);
const fields = `e.employee_id, e.full_name, e.phone, e.email, e.position, e.hire_date,
    e.is_active, u.user_id, u.username, u.role, u.is_active AS account_active`;

function validate(body, creating) {
  const fullName = String(body.full_name || "").trim();
  const position = String(body.position || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();
  const username = String(body.username || "").trim();
  const password = body.password == null ? "" : body.password;
  const role = body.role || "";
  if (
    !fullName ||
    fullName.length > 100 ||
    !position ||
    position.length > 50 ||
    (phone && !/^\+?[0-9]{9,15}$/.test(phone)) ||
    (email &&
      (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
    (username &&
      (username.length > 50 || !/^[A-Za-z0-9_.-]+$/.test(username))) ||
    (username && !roles.has(role)) ||
    (!username && (password || role)) ||
    (password && (typeof password !== "string" || password.length < 12)) ||
    (creating && username && !password)
  )
    return null;
  return {
    fullName,
    position,
    phone: phone || null,
    email: email || null,
    username,
    password,
    role,
    active: body.is_active !== false,
    accountActive: body.account_active !== false && body.is_active !== false,
  };
}

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
  if ([2601, 2627].includes(error.number))
    return res.status(409).json({ error: "Ma hoac ten dang nhap da ton tai" });
  console.error("Loi quan ly nhan vien:", error);
  return res.status(500).json({ error: "Khong the luu nhan vien" });
}

router.get("/", async (_req, res) => {
  try {
    const pool = await connectDB();
    const result = await pool.request()
      .query(`SELECT ${fields} FROM dbo.employees e
            LEFT JOIN dbo.users u ON u.employee_id = e.employee_id ORDER BY e.employee_id`);
    res.json(result.recordset);
  } catch (error) {
    failure(error, res);
  }
});

router.post("/", async (req, res) => {
  const data = validate(req.body || {}, true);
  if (!data)
    return res.status(400).json({ error: "Thong tin nhan vien khong hop le" });
  let tx;
  try {
    const pool = await connectDB();
    tx = new sql.Transaction(pool);
    await tx.begin();
    const id =
      "NV" + require("crypto").randomBytes(4).toString("hex").toUpperCase();
    const userId =
      "U" + require("crypto").randomBytes(4).toString("hex").toUpperCase();
    await bind(new sql.Request(tx), data).input("id", sql.VarChar(10), id)
      .query(`
            INSERT dbo.employees(employee_id, full_name, phone, email, position, is_active)
            VALUES(@id, @name, @phone, @email, @position, @active)`);
    if (data.username) {
      const hash = await bcrypt.hash(data.password, 12);
      await bind(new sql.Request(tx), data)
        .input("id", sql.VarChar(10), id)
        .input("userId", sql.VarChar(10), userId)
        .input("hash", sql.VarChar(255), hash).query(`
                INSERT dbo.users(user_id, employee_id, username, password_hash, role, is_active)
                VALUES(@userId, @id, @username, @hash, @role, @accountActive)`);
    }
    await tx.commit();
    res.status(201).json({ employee_id: id });
  } catch (error) {
    if (tx) await tx.rollback().catch(() => {});
    failure(error, res);
  }
});

router.put("/:id", async (req, res) => {
  const data = validate(req.body || {}, false);
  if (!data)
    return res.status(400).json({ error: "Thong tin nhan vien khong hop le" });
  let tx;
  try {
    const pool = await connectDB();
    tx = new sql.Transaction(pool);
    await tx.begin();
    const existing = await new sql.Request(tx)
      .input("id", sql.VarChar(10), req.params.id)
      .query(
        "SELECT e.employee_id, u.user_id FROM dbo.employees e LEFT JOIN dbo.users u ON u.employee_id=e.employee_id WHERE e.employee_id=@id",
      );
    const row = existing.recordset[0];
    if (!row) {
      await tx.rollback();
      return res.status(404).json({ error: "Khong tim thay nhan vien" });
    }
    if (row.user_id && !data.username) {
      await tx.rollback();
      return res
        .status(400)
        .json({ error: "Khong duoc xoa tai khoan qua bieu mau nay" });
    }
    if (!row.user_id && data.username && !data.password) {
      await tx.rollback();
      return res
        .status(400)
        .json({ error: "Tai khoan moi can mat khau it nhat 12 ky tu" });
    }
    await bind(new sql.Request(tx), data).input(
      "id",
      sql.VarChar(10),
      req.params.id,
    ).query(`
            UPDATE dbo.employees SET full_name=@name, phone=@phone, email=@email,
            position=@position, is_active=@active WHERE employee_id=@id`);
    if (row.user_id) {
      const request = bind(new sql.Request(tx), data).input(
        "id",
        sql.VarChar(10),
        row.user_id,
      );
      if (data.password)
        request.input(
          "hash",
          sql.VarChar(255),
          await bcrypt.hash(data.password, 12),
        );
      await request.query(`UPDATE dbo.users SET username=@username, role=@role,
                is_active=@accountActive ${data.password ? ", password_hash=@hash" : ""} WHERE user_id=@id`);
    } else if (data.username) {
      await bind(new sql.Request(tx), data)
        .input("id", sql.VarChar(10), req.params.id)
        .input(
          "userId",
          sql.VarChar(10),
          "U" + require("crypto").randomBytes(4).toString("hex").toUpperCase(),
        )
        .input("hash", sql.VarChar(255), await bcrypt.hash(data.password, 12))
        .query(`
                INSERT dbo.users(user_id, employee_id, username, password_hash, role, is_active)
                VALUES(@userId, @id, @username, @hash, @role, @accountActive)`);
    }
    await tx.commit();
    res.json({ employee_id: req.params.id });
  } catch (error) {
    if (tx) await tx.rollback().catch(() => {});
    failure(error, res);
  }
});

module.exports = router;
