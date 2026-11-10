const express = require("express");
const { sql, connectDB } = require("../config/db");
const requireManager = require("../middleware/requireManager");
const router = express.Router();
router.use(requireManager);

function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

router.get("/", async (req, res) => {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const groupBy = req.query.groupBy || "day";
    if (!from || !to || from > to || !["day", "week", "month"].includes(groupBy)) {
        return res.status(400).json({ error: "Khoang ngay hoac cach nhom khong hop le" });
    }
    const nextDay = new Date(to.getTime() + 86400000);
    const bucket = {
        day: "CONVERT(char(10), i.paid_at, 23)",
        week: "CONVERT(char(10), DATEADD(day, -(DATEDIFF(day, '19000101', i.paid_at) % 7), CONVERT(date, i.paid_at)), 23)",
        month: "CONVERT(char(7), i.paid_at, 23)"
    }[groupBy];
    try {
        const pool = await connectDB();
        const request = () => pool.request()
            .input("from", sql.DateTime2, from)
            .input("until", sql.DateTime2, nextDay);
        const [summary, timeline, products, stock] = await Promise.all([
            request().query(`SELECT COUNT(*) AS invoice_count, COALESCE(SUM(i.total_amount),0) AS revenue
                FROM dbo.invoices i JOIN dbo.orders o ON o.order_id=i.order_id
                WHERE o.status='paid' AND i.paid_at>=@from AND i.paid_at<@until`),
            request().query(`SELECT ${bucket} AS period, COUNT(*) AS invoice_count,
                SUM(i.total_amount) AS revenue FROM dbo.invoices i
                JOIN dbo.orders o ON o.order_id=i.order_id
                WHERE o.status='paid' AND i.paid_at>=@from AND i.paid_at<@until
                GROUP BY ${bucket} ORDER BY period`),
            request().query(`SELECT TOP (10) d.product_id, p.product_name,
                SUM(d.quantity) AS quantity FROM dbo.order_details d
                JOIN dbo.products p ON p.product_id=d.product_id
                JOIN dbo.orders o ON o.order_id=d.order_id
                JOIN dbo.invoices i ON i.order_id=o.order_id
                WHERE o.status='paid' AND i.paid_at>=@from AND i.paid_at<@until
                GROUP BY d.product_id, p.product_name ORDER BY quantity DESC, d.product_id`),
            pool.request().query(`SELECT material_id, material_name, unit, quantity, min_quantity
                FROM dbo.materials WHERE is_active=1 ORDER BY material_name`)
        ]);
        const count = Number(summary.recordset[0].invoice_count);
        const revenue = Number(summary.recordset[0].revenue);
        res.json({ from: req.query.from, to: req.query.to, groupBy, revenue,
            invoiceCount: count, average: count ? Math.round(revenue / count) : 0,
            timeline: timeline.recordset.map(row => ({ period: row.period,
                invoiceCount: Number(row.invoice_count), revenue: Number(row.revenue) })),
            topProducts: products.recordset.map(row => ({ id: row.product_id,
                name: row.product_name, quantity: Number(row.quantity) })),
            currentStock: stock.recordset.map(row => ({ id: row.material_id,
                name: row.material_name, unit: row.unit, quantity: Number(row.quantity),
                minimum: Number(row.min_quantity) })) });
    } catch (error) {
        console.error("Loi bao cao:", error);
        res.status(500).json({ error: "Khong the tao bao cao" });
    }
});

module.exports = router;
