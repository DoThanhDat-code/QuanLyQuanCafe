require("dotenv").config();
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { sql, connectDB } = require("../config/db");

const base = `http://127.0.0.1:${process.env.PORT || 3000}/api`;
async function call(path, token, options = {}) {
    const response = await fetch(base + path, {
        ...options,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    });
    return { status: response.status, body: await response.json() };
}

async function main() {
    assert.equal((await call("/employees")).status, 401);
    const login = await call("/auth/login", null, { method: "POST",
        body: JSON.stringify({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD }) });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    const admin = login.body.token;
    const username = "smoke_" + crypto.randomBytes(4).toString("hex");
    const password = "Aa1!" + crypto.randomBytes(12).toString("hex");
    let employeeId;
    const paidOrder = "SMK" + crypto.randomBytes(6).toString("hex");
    const cancelledOrder = "SMK" + crypto.randomBytes(6).toString("hex");
    const pool = await connectDB();
    try {
        const created = await call("/employees", admin, { method: "POST", body: JSON.stringify({
            full_name: "Smoke Test", position: "Phục vụ", username, password,
            role: "phucvu", phone: "0912345678" }) });
        assert.equal(created.status, 201, JSON.stringify(created.body));
        employeeId = created.body.employee_id;
        const list = await call("/employees", admin);
        assert.equal(list.status, 200);
        assert(list.body.some(row => row.employee_id === employeeId && !Object.hasOwn(row, "password_hash")));
        const staffLogin = await call("/auth/login", null, { method: "POST", body: JSON.stringify({ username, password }) });
        assert.equal(staffLogin.status, 200);
        assert.equal((await call("/employees", staffLogin.body.token)).status, 403);
        const updated = await call(`/employees/${employeeId}`, admin, { method: "PUT", body: JSON.stringify({
            full_name: "Smoke Test Updated", position: "Phục vụ", username, role: "phucvu",
            is_active: false, account_active: true }) });
        assert.equal(updated.status, 200, JSON.stringify(updated.body));
        assert.equal((await call("/auth/login", null, { method: "POST",
            body: JSON.stringify({ username, password }) })).status, 401);
        assert.equal((await call("/reports?from=2026-11-11&to=2026-11-10", admin)).status, 400);
        const today = new Date().toISOString().slice(0, 10);
        const report = await call(`/reports?from=${today}&to=${today}&groupBy=day`, admin);
        assert.equal(report.status, 200, JSON.stringify(report.body));
        assert.equal(typeof report.body.revenue, "number");
        assert(Array.isArray(report.body.currentStock));
        const paidAt = new Date("2035-01-02T12:00:00Z");
        for (const [id, status] of [[paidOrder, "paid"], [cancelledOrder, "cancelled"]]) {
            await pool.request().input("id", sql.VarChar(20), id)
                .input("status", sql.VarChar(20), status)
                .input("date", sql.DateTime2, paidAt).query(`
                INSERT dbo.orders(order_id, table_id, order_date, status)
                VALUES(@id, 'B01', @date, @status);
                INSERT dbo.order_details(order_id, product_id, quantity, unit_price)
                VALUES(@id, 'P01', 2, 29000);
                INSERT dbo.invoices(invoice_id, order_id, subtotal, discount, total_amount, payment_method, paid_at)
                VALUES(@id, @id, 58000, 0, 58000, 'cash', @date)`);
        }
        const aggregated = await call("/reports?from=2035-01-02&to=2035-01-02&groupBy=day", admin);
        assert.equal(aggregated.status, 200, JSON.stringify(aggregated.body));
        assert.equal(aggregated.body.revenue, 58000);
        assert.equal(aggregated.body.invoiceCount, 1);
        assert.equal(aggregated.body.topProducts.find(row => row.id === "P01")?.quantity, 2);
        console.log("Employee and report API smoke checks passed");
    } finally {
        await pool.request().input("paid", sql.VarChar(20), paidOrder)
            .input("cancelled", sql.VarChar(20), cancelledOrder).query(`
            DELETE FROM dbo.invoices WHERE order_id IN (@paid, @cancelled);
            DELETE FROM dbo.order_details WHERE order_id IN (@paid, @cancelled);
            DELETE FROM dbo.orders WHERE order_id IN (@paid, @cancelled)`);
        if (employeeId) {
            await pool.request().input("id", sql.VarChar(10), employeeId)
                .query("DELETE FROM dbo.users WHERE employee_id=@id; DELETE FROM dbo.employees WHERE employee_id=@id");
        }
        await sql.close();
    }
}

main().catch(error => { console.error("Smoke check failed:", error.message); process.exitCode = 1; });
