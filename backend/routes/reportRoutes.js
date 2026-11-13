const express = require("express");
const { sql, connectDB } = require("../config/db");
const requireAdmin = require("../middleware/requireAdmin");
const {
  parseReportDate,
  getGroupExpression
} = require("../utils/reportValidation");

const router = express.Router();
router.use(requireAdmin);

router.get("/", async (req, res) => {
  const from = parseReportDate(req.query.from);
  const to = parseReportDate(req.query.to);
  const groupBy = req.query.groupBy || "day";
  const groupExpression = getGroupExpression(groupBy);

  if (!from || !to || from > to || !groupExpression) {
    return res.status(400).json({
      error: "Khoang ngay hoac cach nhom khong hop le"
    });
  }

  // Dùng mốc đầu ngày kế tiếp để lấy trọn dữ liệu của ngày kết thúc.
  const until = new Date(to.getTime() + 24 * 60 * 60 * 1000);

  try {
    const pool = await connectDB();
    const createRequest = () => pool.request()
      .input("from", sql.DateTime2, from)
      .input("until", sql.DateTime2, until);

    // Ba truy vấn chỉ đọc được chạy song song để trang báo cáo tải nhanh hơn.
    const [summaryResult, timelineResult, productResult] = await Promise.all([
      createRequest().query(`
        SELECT COUNT(*) AS invoice_count,
               COALESCE(SUM(i.total_amount), 0) AS revenue
        FROM dbo.invoices i
        INNER JOIN dbo.orders o ON o.order_id = i.order_id
        WHERE o.status = 'paid'
          AND i.paid_at >= @from
          AND i.paid_at < @until
      `),
      createRequest().query(`
        SELECT ${groupExpression} AS period,
               COUNT(*) AS invoice_count,
               SUM(i.total_amount) AS revenue
        FROM dbo.invoices i
        INNER JOIN dbo.orders o ON o.order_id = i.order_id
        WHERE o.status = 'paid'
          AND i.paid_at >= @from
          AND i.paid_at < @until
        GROUP BY ${groupExpression}
        ORDER BY period
      `),
      createRequest().query(`
        SELECT TOP (10) p.product_id, p.product_name,
               SUM(od.quantity) AS quantity
        FROM dbo.order_details od
        INNER JOIN dbo.products p ON p.product_id = od.product_id
        INNER JOIN dbo.orders o ON o.order_id = od.order_id
        INNER JOIN dbo.invoices i ON i.order_id = o.order_id
        WHERE o.status = 'paid'
          AND i.paid_at >= @from
          AND i.paid_at < @until
        GROUP BY p.product_id, p.product_name
        ORDER BY quantity DESC, p.product_id
      `)
    ]);

    const invoiceCount = Number(summaryResult.recordset[0].invoice_count);
    const revenue = Number(summaryResult.recordset[0].revenue);

    return res.json({
      from: req.query.from,
      to: req.query.to,
      groupBy,
      revenue,
      invoiceCount,
      average: invoiceCount ? Math.round(revenue / invoiceCount) : 0,
      timeline: timelineResult.recordset.map(row => ({
        period: row.period,
        invoiceCount: Number(row.invoice_count),
        revenue: Number(row.revenue)
      })),
      topProducts: productResult.recordset.map(row => ({
        id: row.product_id,
        name: row.product_name,
        quantity: Number(row.quantity)
      }))
    });
  } catch (error) {
    console.error("Loi tao bao cao:", error);
    return res.status(500).json({ error: "Khong the tao bao cao" });
  }
});

module.exports = router;
