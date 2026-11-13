
const EMPLOYEE_ROLES = new Set(["manager", "phucvu", "thungan", "kho"]);

function parseActive(value) {
  if (value === undefined) return true;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return null;
}

function validateEmployee(body, creating) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  if (
    typeof body.full_name !== "string" ||
    typeof body.position !== "string"
  ) {
    return null;
  }

  for (const field of ["phone", "email", "username", "password", "role"]) {
    if (body[field] != null && typeof body[field] !== "string") {
      return null;
    }
  }

  const active = parseActive(body.is_active);
  const requestedAccountActive = parseActive(body.account_active);

  if (active === null || requestedAccountActive === null) {
    return null;
  }

  const fullName = body.full_name.trim();
  const position = body.position.trim();
  const phone = (body.phone ?? "").trim();
  const email = (body.email ?? "").trim();
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const role = (body.role ?? "").trim();

  const invalid =
    !fullName ||
    fullName.length > 100 ||
    !/\p{L}/u.test(fullName) ||
    !position ||
    position.length > 50 ||
    !/\p{L}/u.test(position) ||
    (phone && (phone.length > 15 || !/^\+?[0-9]{9,15}$/.test(phone))) ||
    (email && (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
    (username && (username.length > 50 || !/^[A-Za-z0-9_.-]+$/.test(username))) ||
    (password && (password.trim().length < 12 || Buffer.byteLength(password, "utf8") > 72)) ||
    (username && !EMPLOYEE_ROLES.has(role)) ||
    (!username && (password || role)) ||
    (creating && username && !password);

  if (invalid) {
    return null;
  }

  return {
    fullName,
    position,
    phone: phone || null,
    email: email || null,
    username,
    password,
    role,
    active,
    accountActive: active && requestedAccountActive
  };
}

module.exports = { validateEmployee };
