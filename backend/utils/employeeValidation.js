const EMPLOYEE_ROLES = new Set(["manager", "phucvu", "thungan", "kho"]);

function validateEmployee(body, creating) {
  const fullName = String(body.full_name || "").trim();
  const position = String(body.position || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();
  const username = String(body.username || "").trim();
  const password = body.password == null ? "" : body.password;
  const role = body.role || "";

  // Tài khoản là tùy chọn, nhưng nếu đã nhập username thì phải có vai trò hợp lệ.
  const invalid =
    !fullName ||
    fullName.length > 100 ||
    !position ||
    position.length > 50 ||
    (phone && !/^\+?[0-9]{9,15}$/.test(phone)) ||
    (email && (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
    (username && (username.length > 50 || !/^[A-Za-z0-9_.-]+$/.test(username))) ||
    (username && !EMPLOYEE_ROLES.has(role)) ||
    (!username && (password || role)) ||
    (password && (typeof password !== "string" || password.length < 12)) ||
    (creating && username && !password);

  if (invalid) return null;

  return {
    fullName,
    position,
    phone: phone || null,
    email: email || null,
    username,
    password,
    role,
    active: body.is_active !== false,
    accountActive: body.account_active !== false && body.is_active !== false
  };
}

module.exports = { validateEmployee };
