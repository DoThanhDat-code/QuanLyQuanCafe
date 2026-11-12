# Thiết kế chức năng nhân viên và báo cáo

## Mục tiêu

Hoàn thiện hai chức năng thuộc nhánh `feature-employees-reports` bằng công nghệ hiện có của dự án: HTML, CSS, JavaScript, Node.js, Express và SQL Server. Code cần đơn giản, bám theo cách viết hiện tại và có comment tiếng Việt tại các đoạn xử lý quan trọng.

## Phạm vi

### Quản lý nhân viên

- Hiển thị danh sách nhân viên từ bảng `employees`.
- Thêm và cập nhật thông tin nhân viên.
- Khóa hoặc mở hoạt động của nhân viên bằng trường `is_active`, không xóa dữ liệu vật lý.
- Giữ phần liên kết tài khoản đã có để giao diện hiển thị tài khoản của nhân viên, nhưng không sửa `authRoutes.js` hoặc `accountRoutes.js`.
- Tái sử dụng middleware `requireAdmin` hiện có; không tạo thêm cơ chế phân quyền mới.

### Báo cáo

- Chọn khoảng ngày và cách nhóm theo ngày, tuần hoặc tháng.
- Hiển thị tổng doanh thu, số hóa đơn và giá trị trung bình mỗi hóa đơn.
- Hiển thị doanh thu theo từng kỳ và danh sách món bán chạy.
- Dữ liệu được đọc từ `invoices`, `orders`, `order_details` và `products`.
- Chỉ đọc dữ liệu của các chức năng khác, không thay đổi nghiệp vụ đơn hàng, thanh toán, sản phẩm hoặc kho.

## Kiến trúc và luồng dữ liệu

- Backend giữ cấu trúc route Express hiện tại.
- `employeeRoutes.js` phụ trách API nhân viên; các thao tác cần cập nhật nhiều bảng sử dụng transaction để tránh lưu dở dang.
- `reportRoutes.js` phụ trách API báo cáo và chỉ chạy các truy vấn `SELECT`.
- `server.js` chỉ đăng ký thêm route báo cáo; các route khác được giữ nguyên.
- `frontend/app.js` dùng hàm gọi API hiện có, tải dữ liệu khi người dùng mở trang tương ứng và hiển thị lỗi ngay trong trang.

## Kiểm tra dữ liệu và lỗi

- Backend kiểm tra trường bắt buộc, độ dài và định dạng trước khi truy vấn SQL.
- Tham số SQL luôn được truyền bằng `.input()`; chỉ biểu thức nhóm thời gian được chọn từ danh sách cố định trong code.
- Khoảng ngày không hợp lệ trả về HTTP 400.
- Không tìm thấy nhân viên trả về HTTP 404.
- Trùng mã hoặc tên đăng nhập trả về HTTP 409 khi có liên quan.
- Lỗi cơ sở dữ liệu trả về HTTP 500 với thông báo ngắn; chi tiết được ghi ở console backend.

## Kiểm thử

- Dùng test đơn giản với `node:test`, ưu tiên kiểm thử các hàm validation và xử lý tham số không cần SQL Server.
- Thực hiện theo vòng lặp test thất bại trước, sau đó viết lượng code tối thiểu để test chạy.
- Chạy kiểm tra cú pháp cho các file JavaScript và smoke test hiện có nếu môi trường database cho phép.

## Ngoài phạm vi

- Không sửa đăng nhập, phát hành JWT hoặc quy tắc phân quyền.
- Không sửa quản lý tài khoản, bàn, đơn hàng, thanh toán, thực đơn hoặc kho.
- Không sửa database schema và không thêm Docker.
- Không thiết kế lại toàn bộ giao diện.
- Không commit hoặc push nếu chưa có yêu cầu riêng của người dùng.
