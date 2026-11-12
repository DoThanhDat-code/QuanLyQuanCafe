const GROUP_EXPRESSIONS = {
  day: "CONVERT(char(10), i.paid_at, 23)",
  week: "CONVERT(char(10), DATEADD(day, -(DATEDIFF(day, '19000101', i.paid_at) % 7), CONVERT(date, i.paid_at)), 23)",
  month: "CONVERT(char(7), i.paid_at, 23)"
};

function parseReportDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  // DateTime2 bắt đầu từ năm 0001; ngày cực đại không thể cộng thêm một ngày.
  const year = Number(value.slice(0, 4));
  if (year < 1 || value === "9999-12-31") return null;

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return date;
}

function getGroupExpression(groupBy) {
  // Chỉ lấy biểu thức từ danh sách cố định, không ghép trực tiếp dữ liệu người dùng vào SQL.
  return GROUP_EXPRESSIONS[groupBy] || null;
}

module.exports = { parseReportDate, getGroupExpression };
