
# ☕ MỘC COFFEE – HỆ THỐNG QUẢN LÝ QUÁN CÀ PHÊ

## 1. Giới thiệu

Dự án thuộc môn Nhập môn Công nghệ phần mềm.

MỘC Coffee là hệ thống quản lý quán cà phê với các chức năng:

- Đăng nhập và phân quyền nhân viên
- Quản lý bàn
- Bán hàng và gọi món
- Quản lý thực đơn
- Thanh toán và hóa đơn
- Quản lý kho nguyên liệu
- Quản lý nhân viên
- Báo cáo và thống kê doanh thu

Dự án được phát triển bởi nhóm 7 thành viên.

## 2. Công nghệ sử dụng

Frontend:
- HTML5
- CSS3
- JavaScript

Backend:
- Node.js
- Express.js
- JWT
- bcryptjs

Database:
- Microsoft SQL Server

Công cụ:
- Visual Studio Code
- SQL Server Management Studio
- Git và GitHub

## 3. Cấu trúc dự án

QuanLyQuanCafe/
- frontend/: Giao diện người dùng
- backend/: API và xử lý nghiệp vụ
- database/: Cấu trúc và dữ liệu SQL Server
- README.md: Hướng dẫn dự án

## 4. Hướng dẫn cài đặt

### Bước 1: Cài phần mềm

Các thành viên cần cài:

1. Visual Studio Code
2. Node.js
3. Git
4. SQL Server
5. SQL Server Management Studio (SSMS)

### Bước 2: Clone dự án

Mở Terminal:

```bash
git clone https://github.com/DoThanhDat-code/QuanLyQuanCafe.git
cd QuanLyQuanCafe
```

Lưu ý: Repository đang ở chế độ Private.
Phải được mời và chấp nhận lời mời GitHub trước.

### Bước 3: Chọn nhánh làm việc

Ví dụ thành viên làm quản lý bàn:

```bash
git fetch origin
git switch --track origin/feature-tables
```

Mỗi thành viên phải sử dụng đúng nhánh được phân công.

### Bước 4: Tạo cơ sở dữ liệu

Mở SQL Server Management Studio.

Tạo database:

```sql
CREATE DATABASE QuanLyQuanCafe;
GO
```

Chạy file:

1. database/schema.sql
2. database/seed.sql

Lưu ý:
- Kiểm tra nội dung script trước khi thực thi.
- Không chạy lại file tạo bảng trên database đã có bảng.
- Nếu schema.sql đã chứa CREATE DATABASE hoặc USE,
  điều chỉnh bước tạo database cho phù hợp.

### Bước 5: Cài đặt backend

Trong Terminal:

```bash
cd backend
npm install
```

### Bước 6: Cấu hình môi trường

Sao chép file .env.example thành .env trong backend.

Chỉnh các thông số:

```dotenv
PORT=3000
DB_SERVER=localhost
DB_NAME=QuanLyQuanCafe
JWT_SECRET=YOUR_RANDOM_SECRET
```

Tạo JWT_SECRET ngẫu nhiên, không sử dụng khóa mẫu.

Phải kiểm tra SQL Server và driver ODBC trên máy
tương thích với cấu hình backend/config/db.js.

Không đẩy file .env lên GitHub.

### Bước 7: Chạy Backend

Trong thư mục backend:

```bash
node server.js
```

Mở trình duyệt:

http://localhost:3000

### Bước 8: Chạy Frontend

Mở frontend/index.html bằng Live Server trong VS Code.

Frontend hiện sử dụng API:

http://localhost:3000/api

Lưu ý: Tài khoản Admin cần được tạo trong database
bằng quy trình khởi tạo tài khoản của backend.
Không có mật khẩu Admin mặc định trong repository.

## 5. Phân công nhóm

| Thành viên | Nhánh | Nhiệm vụ |
|---|---|---|
| Nhóm trưởng | leader-integration | Tích hợp, đăng nhập, phân quyền |
| Thành viên 2 | feature-tables | Quản lý bàn |
| Thành viên 3 | feature-orders | Bán hàng, gọi món |
| Thành viên 4 | feature-products | Quản lý thực đơn |
| Thành viên 5 | feature-payments | Thanh toán |
| Thành viên 6 | feature-inventory | Kho nguyên liệu |
| Thành viên 7 | feature-employees-reports | Nhân viên và báo cáo |

## 6. Quy định làm việc nhóm

- Không push trực tiếp vào main.
- Mỗi người làm việc trên nhánh riêng.
- Không tự ý chỉnh sửa file của thành viên khác.
- Không đăng tải .env hoặc mật khẩu lên GitHub.
- Khi hoàn thành phải kiểm thử chức năng.
- Tạo Pull Request để nhóm trưởng kiểm tra.
- Chỉ gộp code sau khi đã được kiểm tra.

## 7. Quy trình cập nhật code

Trước khi làm việc:

```bash
git status
git fetch origin
```

Khi hoàn thành:

```bash
git add .
git commit -m "Mo ta chuc nang da hoan thanh"
git push
```

Sau đó tạo Pull Request trên GitHub.

## 8. Trạng thái dự án

Đã có:
- Cấu trúc frontend và backend
- Kết nối SQL Server
- API đăng nhập bằng JWT
- API danh sách sản phẩm
- API danh sách bàn

Đang phát triển:
- API quản lý bàn đầy đủ
- API đơn hàng
- API thanh toán
- API quản lý sản phẩm
- API kho nguyên liệu
- API nhân viên
- API báo cáo

Một số nghiệp vụ frontend hiện vẫn sử dụng localStorage.

## 9. Repository

https://github.com/DoThanhDat-code/QuanLyQuanCafe

Dự án phục vụ mục đích học tập.
