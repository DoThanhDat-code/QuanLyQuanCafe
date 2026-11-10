
/*
  MOC COFFEE POS
  De tai: Xay dung he thong quan ly quan ca phe
  Frontend: HTML, CSS, JavaScript
  Backend: Node.js, Express
  Database: SQL Server
*/

(() => {
  "use strict";

  // =====================================================
  // 1. CAU HINH HE THONG
  // =====================================================

  const API_URL = "http://localhost:3000/api";
  const STORAGE_KEY = "moc_coffee_database_v3";
  const SESSION_KEY = "moc_coffee_session_v3";
  const TOKEN_KEY = "moc_coffee_auth_token_v1";

  const app = document.getElementById("app");
  const toastRoot = document.getElementById("toast-root");

  if (!app) {
    console.error("Khong tim thay #app trong index.html");
    return;
  }

  const money = value =>
    new Intl.NumberFormat("vi-VN").format(value || 0) + " ₫";

  const now = () => new Date().toISOString();

  const dateKey = value => {
    const d = new Date(value);
    return (
      d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0")
    );
  };

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));

  const createId = prefix =>
    prefix +
    Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 6).toUpperCase();

  // =====================================================
  // 2. DANH MUC VA PHAN QUYEN
  // =====================================================

  const categories = [
    "Cà phê",
    "Trà & trái cây",
    "Đá xay",
    "Bánh ngọt"
  ];

  const navigation = [
    ["dashboard", "📊", "Tổng quan"],
    ["tables", "🪑", "Quản lý bàn"],
    ["sale", "🛒", "Bán hàng / Order"],
    ["menu", "☕", "Thực đơn"],
    ["payments", "💳", "Thanh toán"],
    ["inventory", "📦", "Kho nguyên liệu"],
    ["employees", "👥", "Nhân viên"],
    ["reports", "📈", "Báo cáo"]
  ];

  const permissions = {
    manager: navigation.map(item => item[0]),

    service: [
      "dashboard", "tables", "sale", "menu"
    ],

    cashier: [
      "dashboard", "tables", "sale",
      "menu", "payments"
    ],

    stock: [
      "dashboard", "inventory"
    ]
  };

  function roleName(role) {
    const roles = {
      manager: "Chủ quán / Quản lý",
      service: "Nhân viên phục vụ",
      cashier: "Thu ngân",
      stock: "Nhân viên kho"
    };

    return roles[role] || role;
  }

  const normalizeRole = role => ({
    admin: "manager",
    manager: "manager",
    phucvu: "service",
    thungan: "cashier",
    kho: "stock"
  }[role] || null);

  // =====================================================
  // 3. DU LIEU MAU
  // =====================================================

  function createSampleData() {
    const productSource = [
      ["Cà phê sữa đá", "Cà phê", 29000, "☕"],
      ["Bạc xỉu", "Cà phê", 35000, "🥛"],
      ["Cappuccino", "Cà phê", 45000, "☕"],
      ["Latte caramel", "Cà phê", 49000, "🧋"],
      ["Espresso", "Cà phê", 32000, "☕"],
      ["Trà đào cam sả", "Trà & trái cây", 42000, "🍑"],
      ["Trà vải", "Trà & trái cây", 42000, "🍹"],
      ["Trà chanh mật ong", "Trà & trái cây", 35000, "🍋"],
      ["Trà dâu", "Trà & trái cây", 45000, "🍓"],
      ["Matcha đá xay", "Đá xay", 49000, "🍵"],
      ["Chocolate đá xay", "Đá xay", 52000, "🍫"],
      ["Cookies đá xay", "Đá xay", 55000, "🥤"],
      ["Tiramisu", "Bánh ngọt", 45000, "🍰"],
      ["Croissant bơ", "Bánh ngọt", 32000, "🥐"],
      ["Bánh phô mai", "Bánh ngọt", 44000, "🧁"]
    ];

    const products = productSource.map((item, index) => ({
      id: "P" + String(index + 1).padStart(2, "0"),
      name: item[0],
      category: item[1],
      price: item[2],
      emoji: item[3],
      active: true
    }));

    const tables = Array.from(
      { length: 12 },
      (_, index) => ({
        id: "B" + String(index + 1).padStart(2, "0"),
        seats: index % 3 === 0 ? 4 : 2,
        active: true
      })
    );

    // Du lieu nhan vien demo chi phuc vu hien thi.
    // KHONG su dung mat khau o frontend de dang nhap.
    const staff = [
      {
        id: "NV01",
        name: "Nguyễn Minh Anh",
        username: "admin",
        role: "manager",
        active: true
      },
      {
        id: "NV02",
        name: "Trần Thu Hà",
        username: "phucvu",
        role: "service",
        active: true
      },
      {
        id: "NV03",
        name: "Lê Hoàng Nam",
        username: "thungan",
        role: "cashier",
        active: true
      },
      {
        id: "NV04",
        name: "Phạm Ngọc Mai",
        username: "kho",
        role: "stock",
        active: true
      }
    ];

    const materialSource = [
      ["Hạt cà phê", "kg", 14, 5],
      ["Sữa tươi", "lít", 8, 12],
      ["Đường nâu", "kg", 18, 6],
      ["Trà đào", "hộp", 17, 8],
      ["Bột matcha", "kg", 2, 4],
      ["Ly giấy", "cái", 160, 50]
    ];

    const materials = materialSource.map((item, index) => ({
      id: "NL" + String(index + 1).padStart(2, "0"),
      name: item[0],
      unit: item[1],
      stock: item[2],
      minimum: item[3]
    }));

    const invoices = [];

    for (let i = 0; i < 10; i++) {
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(i / 2));

      const total =
        [89000, 122000, 74000, 148000, 65000][i % 5];

      invoices.push({
        id: "HD" + (1001 + i),
        orderId: "SAMPLE" + i,
        tableId: "B" + String(i % 8 + 1).padStart(2, "0"),
        subtotal: total,
        discount: 0,
        total,
        method: i % 2 ? "Chuyển khoản" : "Tiền mặt",
        date: date.toISOString(),
        sample: true
      });
    }

    return {
      tables,
      products,
      staff,
      materials,
      orders: [],
      invoices,
      transactions: []
    };
  }

  // =====================================================
  // 4. LUU VA DOC DU LIEU
  // =====================================================

  function loadDatabase() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY)
      );

      if (
        saved &&
        Array.isArray(saved.tables) &&
        Array.isArray(saved.products) &&
        Array.isArray(saved.orders)
      ) {
        return saved;
      }
    } catch (error) {
      console.error("Loi doc du lieu:", error);
    }

    return createSampleData();
  }

  let db = loadDatabase();
  let employees = [];
  let employeeError = "";
  async function managerRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json",
        Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ""}`,
        ...(options.headers || {}) }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Yêu cầu thất bại.");
    return data;
  }

  async function loadEmployees() {
    employeeError = "";
    try { employees = await managerRequest("/employees"); }
    catch (error) { employeeError = error.message; employees = []; }
    if (state.page === "employees") render();
  }

  function saveDatabase() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(db)
    );
  }

  // =====================================================
  // 5. PHIEN DANG NHAP SQL SERVER
  // =====================================================

  let userId = null;
  let authenticatedUser = null;

  let state = {
    page: "dashboard",
    tableId: "B01",
    cart: [],
    category: "Tất cả",
    period: "week",
    modal: null
  };

  function setAuthenticatedUser(user) {
    const role = normalizeRole(user?.role);

    if (!role || !user?.userId) {
      throw new Error(
        "Thông tin tài khoản hoặc vai trò không hợp lệ."
      );
    }

    userId = user.userId;

    authenticatedUser = {
      id: user.userId,
      name: user.username,
      username: user.username,
      role,
      active: true
    };
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);

    authenticatedUser = null;
    userId = null;
  }

  async function restoreSession() {
    const token = sessionStorage.getItem(TOKEN_KEY);

    if (!token) {
      render();
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error("Phiên đăng nhập không hợp lệ.");
      }

      const result = await response.json();

      // Backend co the tra ve user truc tiep
      // hoac { user: {...} }.
      const user = result.user || result;

      setAuthenticatedUser(user);
      render();

    } catch (error) {
      console.warn(
        "Khong the khoi phuc phien dang nhap:",
        error.message
      );

      clearSession();
      render();
    }
  }

  async function loginWithSQL(username, password) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || "Đăng nhập thất bại."
      );
    }

    if (!result.token || !result.user) {
      throw new Error(
        "Backend không trả về đầy đủ thông tin đăng nhập."
      );
    }

    setAuthenticatedUser(result.user);

    sessionStorage.setItem(
      TOKEN_KEY,
      result.token
    );

    sessionStorage.removeItem(SESSION_KEY);

    state.page = "dashboard";
    state.modal = null;

    render();
    notify("Đăng nhập thành công!");
  }

  // =====================================================
  // 6. TAI DU LIEU TU SQL SERVER
  // =====================================================

  async function loadProductsFromSQL() {
    try {
      const response = await fetch(`${API_URL}/products`);

      if (!response.ok) {
        throw new Error("Không thể tải thực đơn.");
      }

      const products = await response.json();

      if (!Array.isArray(products)) {
        throw new Error("Dữ liệu thực đơn không hợp lệ.");
      }

      db.products = products.map(product => ({
        id: product.product_id,
        name: product.product_name,
        category: product.category_name,
        price: Number(product.price),
        emoji: "☕",
        active: Boolean(product.is_active)
      }));

      render();

      console.log(
        "Đã tải thực đơn từ SQL Server:",
        db.products.length,
        "món"
      );

    } catch (error) {
      console.error("Loi tai san pham:", error);
      console.warn("Tam su dung thuc don demo.");
    }
  }

  async function loadTablesFromSQL() {
    try {
      const response = await fetch(`${API_URL}/tables`);

      if (!response.ok) {
        throw new Error("Không thể tải danh sách bàn.");
      }

      const tables = await response.json();

      if (!Array.isArray(tables)) {
        throw new Error("Dữ liệu bàn không hợp lệ.");
      }

      db.tables = tables
        .filter(table => Boolean(table.is_active))
        .map(table => ({
          id: table.table_id,
          name: table.table_name,
          seats: Number(table.seats),
          status: table.status,
          active: true
        }));

      if (
        db.tables.length > 0 &&
        !db.tables.some(table => table.id === state.tableId)
      ) {
        state.tableId = db.tables[0].id;
        loadCart();
      }

      render();

      console.log(
        "Đã tải",
        db.tables.length,
        "bàn từ SQL Server"
      );

    } catch (error) {
      console.error("Loi tai ban:", error);
      console.warn("Tam su dung danh sach ban demo.");
    }
  }

  // =====================================================
  // 7. HAM DUNG CHUNG
  // =====================================================

  function currentUser() {
    return authenticatedUser;
  }

  function isManager() {
    return currentUser()?.role === "manager";
  }

  function hasPermission(page) {
    const account = currentUser();

    if (!account) return false;

    return (
      permissions[account.role]?.includes(page) || false
    );
  }

  function canManageOrders() {
    return [
      "manager",
      "service",
      "cashier"
    ].includes(currentUser()?.role);
  }

  function canPay() {
    return [
      "manager",
      "cashier"
    ].includes(currentUser()?.role);
  }

  function canManageStock() {
    return [
      "manager",
      "stock"
    ].includes(currentUser()?.role);
  }

  function notify(message, error = false) {
    if (!toastRoot) {
      console.log(message);
      return;
    }

    const element = document.createElement("div");

    element.className =
      "toast" + (error ? " error" : "");

    element.textContent = message;

    toastRoot.appendChild(element);

    setTimeout(() => element.remove(), 3200);
  }

  function getOpenOrder(tableId) {
    return db.orders.find(order =>
      order.tableId === tableId &&
      order.status === "open"
    );
  }

  function calculateTotal(items) {
    return items.reduce(
      (total, item) =>
        total + item.price * item.qty,
      0
    );
  }

  function loadCart() {
    const order = getOpenOrder(state.tableId);

    state.cart = order
      ? order.items.map(item => ({ ...item }))
      : [];
  }

  function changePage(page) {
    if (!hasPermission(page)) {
      notify(
        "Bạn không có quyền truy cập chức năng này.",
        true
      );
      return;
    }

    state.page = page;
    render();
    if (page === "employees") loadEmployees();
  }

  function checkManager() {
    if (!isManager()) {
      notify(
        "Chức năng chỉ dành cho quản lý.",
        true
      );
      return false;
    }

    return true;
  }

  function checkOrderPermission() {
    if (!canManageOrders()) {
      notify(
        "Bạn không có quyền quản lý đơn hàng.",
        true
      );
      return false;
    }

    return true;
  }

  function button(text, action, style = "") {
    return `
      <button
        type="button"
        class="btn ${style}"
        data-action="${action}">
        ${text}
      </button>
    `;
  }

  function heading(title, description, buttons = "") {
    return `
      <div class="heading">
        <div>
          <h1>${title}</h1>
          <p>${description}</p>
        </div>
        <div class="actions">${buttons}</div>
      </div>
    `;
  }

  function pill(text, color = "") {
    return `
      <span class="pill ${color}">
        ${text}
      </span>
    `;
  }

  function statsCard(label, value, description) {
    return `
      <div class="stat">
        <div class="label">${label}</div>
        <div class="value">${value}</div>
        <small>${description}</small>
      </div>
    `;
  }

  // =====================================================
  // 8. GIAO DIEN DANG NHAP
  // =====================================================

  function loginPage() {
    return `
      <section class="login">

        <div class="login-brand">
          <div class="brand-logo">
            MỘC<span>COFFEE</span>
          </div>

          <h1>Quản lý quán cà phê thông minh.</h1>

          <p>
            Từ quản lý bàn, gọi món đến thanh toán,
            kho hàng và báo cáo doanh thu.
          </p>

          <div class="coffee-art">☕</div>
        </div>

        <div class="login-form">

          <form class="login-panel" id="loginForm">

            <h2>Chào mừng trở lại!</h2>

            <p>Đăng nhập để bắt đầu làm việc.</p>

            <div class="field">
              <label for="loginUsername">
                Tên đăng nhập
              </label>

              <input
                id="loginUsername"
                name="username"
                type="text"
                autocomplete="username"
                required
                placeholder="Nhập tài khoản">
            </div>

            <div class="field">
              <label for="loginPassword">
                Mật khẩu
              </label>

              <input
                id="loginPassword"
                name="password"
                type="password"
                autocomplete="current-password"
                required
                placeholder="Nhập mật khẩu">
            </div>

            <p
              id="loginError"
              role="alert"
              aria-live="polite"
              style="color:#c0392b;display:none;">
            </p>

            <button
              class="btn primary wide"
              type="submit">
              Đăng nhập →
            </button>

            <div class="login-help">
              <b>Hệ thống MỘC Coffee</b>

              <p>
                Đăng nhập bằng tài khoản
                được cấp bởi quản lý.
              </p>

              <p>
                Mọi hoạt động được quản lý
                theo quyền của từng nhân viên.
              </p>
            </div>

          </form>

        </div>

      </section>
    `;
  }

  // =====================================================
  // 9. GIAO DIEN CHINH
  // =====================================================

  function mainLayout() {
    const menu = navigation
      .filter(item => hasPermission(item[0]))
      .map(item => `
        <button
          class="nav ${state.page === item[0] ? "active" : ""}"
          data-page="${item[0]}">

          <span class="nav-icon">${item[1]}</span>
          ${item[2]}

        </button>
      `)
      .join("");

    return `
      <div class="layout">

        <aside class="sidebar">

          <div class="brand-logo">
            MỘC<span>COFFEE</span>
          </div>

          ${menu}

          <div class="sidebar-bottom">
            HỆ THỐNG QUẢN LÝ QUÁN CÀ PHÊ
            <br>
            Phiên bản 1.0
          </div>

        </aside>

        <main class="main">

          <header class="topbar">

            <strong>☕ MỘC Coffee POS</strong>

            <div class="user">
              Xin chào,
              <b>${escapeHTML(currentUser().name)}</b>

              ${button("Đăng xuất", "logout", "small")}
            </div>

          </header>

          <section class="content">
            ${pageContent()}
          </section>

        </main>

      </div>

      ${modalHTML()}
    `;
  }

  function pageContent() {
    const pages = {
      dashboard: dashboardPage,
      tables: tablesPage,
      sale: salePage,
      menu: menuPage,
      payments: paymentsPage,
      inventory: inventoryPage,
      employees: employeesPage,
      reports: reportsPage
    };

    return (pages[state.page] || dashboardPage)();
  }

  // =====================================================
  // 10. TRANG TONG QUAN
  // =====================================================

  function dashboardPage() {
    const today = dateKey(new Date());

    const todayInvoices = db.invoices.filter(
      invoice => dateKey(invoice.date) === today
    );

    const revenue = todayInvoices.reduce(
      (total, invoice) => total + invoice.total,
      0
    );

    const busyTables = db.tables.filter(
      table => getOpenOrder(table.id)
    ).length;

    const lowStock = db.materials.filter(
      material => material.stock < material.minimum
    ).length;

    const recentInvoices = [...db.invoices]
      .sort(
        (a, b) =>
          new Date(b.date) - new Date(a.date)
      )
      .slice(0, 5);

    return heading(
      "Tổng quan hệ thống",
      "Theo dõi hoạt động kinh doanh của quán cà phê",
      canManageOrders()
        ? button("➕ Tạo đơn mới", "new-order", "primary")
        : ""
    ) + `

      <div class="grid stats">

        ${statsCard(
          "Doanh thu hôm nay",
          money(revenue),
          "Từ hóa đơn đã thanh toán"
        )}

        ${statsCard(
          "Hóa đơn hôm nay",
          todayInvoices.length,
          "Hóa đơn đã hoàn tất"
        )}

        ${statsCard(
          "Bàn đang phục vụ",
          busyTables + "/" + db.tables.length,
          "Trạng thái bàn hiện tại"
        )}

        ${statsCard(
          "Nguyên liệu sắp hết",
          lowStock,
          "Cần kiểm tra tồn kho"
        )}

      </div>

      <div class="grid two">

        <div class="card">
          <h2>📈 Doanh thu 7 ngày gần nhất</h2>
          ${revenueChart(7)}
        </div>

        <div class="card">
          <h2>🧾 Hóa đơn gần đây</h2>
          ${invoiceTable(recentInvoices, true)}
        </div>

      </div>
    `;
  }

  function revenueChart(days) {
    const dates = Array.from(
      { length: days },
      (_, index) => {
        const date = new Date();

        date.setDate(
          date.getDate() - (days - index - 1)
        );

        return date;
      }
    );

    const values = dates.map(date =>
      db.invoices
        .filter(invoice =>
          dateKey(invoice.date) === dateKey(date)
        )
        .reduce(
          (total, invoice) => total + invoice.total,
          0
        )
    );

    const max = Math.max(...values, 1);

    return `
      <div class="chart">

        ${dates.map((date, index) => `
          <div
            class="bar-area"
            title="${money(values[index])}">

            <div
              class="bar"
              style="height:${Math.max(
                4,
                values[index] / max * 165
              )}px">
            </div>

            <small>
              ${date.getDate()}/${date.getMonth() + 1}
            </small>

          </div>
        `).join("")}

      </div>
    `;
  }

  // =====================================================
  // 11. QUAN LY BAN
  // =====================================================

  function tablesPage() {
    const busy = db.tables.filter(
      table => getOpenOrder(table.id)
    ).length;

    const content = db.tables.map(table => {
      const order = getOpenOrder(table.id);

      return `
        <button
          class="table-box ${order ? "busy" : ""}"
          data-table="${escapeHTML(table.id)}">

          <div class="split">
            <b>${escapeHTML(table.id)}</b>
            <span>🪑 ${table.seats} chỗ</span>
          </div>

          <div class="bottom">

            ${pill(
              order ? "Đang phục vụ" : "Bàn trống",
              order ? "orange" : "green"
            )}

            <span>→</span>
          </div>

          ${order
            ? `<small>${money(calculateTotal(order.items))}</small>`
            : ""}

        </button>
      `;
    }).join("");

    return heading(
      "Quản lý bàn",
      `${db.tables.length - busy} bàn trống · ${busy} bàn đang phục vụ`,
      canManageOrders()
        ? button("🛒 Tạo đơn mới", "new-order", "primary")
        : ""
    ) + `

      <div class="table-grid">
        ${content}
      </div>

      ${tableOperations()}
    `;
  }

  function tableOperations() {
    const openTables = db.tables.filter(
      table => getOpenOrder(table.id)
    );

    const sources = openTables.map(table => {
      const order = getOpenOrder(table.id);

      return `
        <option value="${escapeHTML(table.id)}">
          ${escapeHTML(table.id)}
          - ${money(calculateTotal(order.items))}
        </option>
      `;
    }).join("");

    const destinations = db.tables.map(table => {
      const order = getOpenOrder(table.id);

      return `
        <option value="${escapeHTML(table.id)}">
          ${escapeHTML(table.id)}
          - ${order ? "Đang phục vụ" : "Trống"}
        </option>
      `;
    }).join("");

    return `
      <div class="card" style="margin-top:22px">

        <h2>🔄 Chuyển bàn và gộp bàn</h2>

        <p class="muted">
          Chuyển khách sang bàn khác hoặc gộp hai đơn hàng.
        </p>

        <div class="grid two">

          <div class="field">
            <label>Bàn nguồn</label>

            <select id="sourceTable">
              <option value="">
                -- Chọn bàn nguồn --
              </option>
              ${sources}
            </select>
          </div>

          <div class="field">
            <label>Bàn đích</label>

            <select id="destinationTable">
              <option value="">
                -- Chọn bàn đích --
              </option>
              ${destinations}
            </select>
          </div>

        </div>

        <div class="actions">
          ${button(
            "🔄 Chuyển bàn",
            "transfer-table",
            "primary"
          )}

          ${button(
            "🔗 Gộp bàn",
            "merge-table"
          )}
        </div>

        <p class="muted" style="margin-top:15px">
          Chuyển bàn yêu cầu bàn đích còn trống.
          Gộp bàn yêu cầu cả hai bàn có đơn hàng.
        </p>

      </div>
    `;
  }

  function performTableAction(mode) {
    if (!checkOrderPermission()) return;

    const sourceId =
      document.getElementById("sourceTable")?.value;

    const destinationId =
      document.getElementById("destinationTable")?.value;

    if (!sourceId || !destinationId) {
      notify("Vui lòng chọn cả hai bàn.", true);
      return;
    }

    if (sourceId === destinationId) {
      notify("Không thể chọn cùng một bàn.", true);
      return;
    }

    const source = getOpenOrder(sourceId);
    const destination = getOpenOrder(destinationId);

    if (!source) {
      notify("Bàn nguồn chưa có đơn hàng.", true);
      return;
    }

    if (mode === "transfer") {
      if (destination) {
        notify(
          "Bàn đích đang phục vụ. Hãy dùng chức năng gộp bàn.",
          true
        );
        return;
      }

      source.tableId = destinationId;
      source.updatedAt = now();

      if (state.tableId === sourceId) {
        state.tableId = destinationId;
        loadCart();
      }

      saveDatabase();
      render();

      notify(
        `Đã chuyển đơn từ ${sourceId} sang ${destinationId}.`
      );

      return;
    }

    if (mode === "merge") {
      if (!destination) {
        notify(
          "Bàn đích chưa có đơn hàng để gộp.",
          true
        );
        return;
      }

      for (const item of source.items) {
        const existingItem = destination.items.find(
          x =>
            x.productId === item.productId &&
            x.price === item.price
        );

        if (existingItem) {
          existingItem.qty += item.qty;
        } else {
          destination.items.push({ ...item });
        }
      }

      source.status = "merged";
      source.mergedInto = destination.id;
      source.mergedAt = now();

      destination.updatedAt = now();

      if (
        state.tableId === sourceId ||
        state.tableId === destinationId
      ) {
        state.tableId = destinationId;
        loadCart();
      }

      saveDatabase();
      render();

      notify(
        `Đã gộp bàn ${sourceId} vào bàn ${destinationId}.`
      );
    }
  }

  // =====================================================
  // 12. BAN HANG / ORDER
  // =====================================================

  function salePage() {
    const table = db.tables.find(
      t => t.id === state.tableId
    ) || db.tables[0];

    if (!table) {
      return heading(
        "Bán hàng / Gọi món",
        "Chưa có bàn nào trong hệ thống."
      );
    }

    const existingOrder = getOpenOrder(table.id);

    const products = db.products.filter(product =>
      product.active &&
      (
        state.category === "Tất cả" ||
        product.category === state.category
      )
    );

    const tableOptions = db.tables.map(item => `
      <option
        value="${escapeHTML(item.id)}"
        ${item.id === table.id ? "selected" : ""}>

        ${escapeHTML(item.id)}
        ${getOpenOrder(item.id) ? "(Đang dùng)" : ""}

      </option>
    `).join("");

    const filters = ["Tất cả", ...categories].map(
      category => `
        <button
          class="filter ${
            state.category === category ? "active" : ""
          }"
          data-cat="${escapeHTML(category)}">

          ${escapeHTML(category)}

        </button>
      `
    ).join("");

    const productCards = products.map(product => `
      <button
        class="product"
        data-prod="${escapeHTML(product.id)}">

        <span class="emoji">${product.emoji}</span>

        <b>${escapeHTML(product.name)}</b>

        <span class="price">
          ${money(product.price)} +
        </span>

      </button>
    `).join("");

    return heading(
      "Bán hàng / Gọi món",
      "Chọn bàn, thêm món và lưu đơn hàng"
    ) + `

      <div class="pos">

        <div class="card">

          <div class="data-toolbar">

            <h2>☕ Danh sách món</h2>

            <div>
              <label for="tableSelect">
                <b>Chọn bàn:</b>
              </label>

              <select
                class="input"
                id="tableSelect"
                style="width:auto">

                ${tableOptions}

              </select>
            </div>

          </div>

          <div class="filters">
            ${filters}
          </div>

          <div class="product-grid">
            ${productCards}
          </div>

        </div>

        <div class="card receipt">

          <div class="receipt-head">

            <h2>🧾 Đơn hàng ${escapeHTML(table.id)}</h2>

            <div class="muted">
              ${existingOrder
                ? "Đã lưu · " + escapeHTML(existingOrder.id)
                : "Đơn hàng mới"}
            </div>
          </div>

          ${cartItemsHTML()}

          <div class="receipt-bottom">

            <div class="split">
              <b>Tổng cộng</b>

              <span class="total">
                ${money(calculateTotal(state.cart))}
              </span>
            </div>

            <div class="actions">

              ${button("💾 Lưu đơn", "save-order")}

              ${button(
                "💳 Thanh toán",
                "open-pay",
                "primary"
              )}

            </div>

          </div>

        </div>

      </div>
    `;
  }

  function cartItemsHTML() {
    if (!state.cart.length) {
      return `
        <div class="empty">
          🛒 Chưa có món nào
          <br>
          Hãy chọn món ở danh sách.
        </div>
      `;
    }

    return state.cart.map((item, index) => {
      const product = db.products.find(
        p => p.id === item.productId
      );

      return `
        <div class="order-line">

          <div>
            <b>
              ${escapeHTML(product?.name || "Món đã xóa")}
            </b>

            <small>
              ${money(item.price)} × ${item.qty}
            </small>
          </div>

          <div class="qty">

            <button
              type="button"
              data-qty="${index}"
              data-change="-1">
              −
            </button>

            <b>${item.qty}</b>

            <button
              type="button"
              data-qty="${index}"
              data-change="1">
              +
            </button>

          </div>

        </div>
      `;
    }).join("");
  }

  function saveOrder() {
    if (!checkOrderPermission()) return false;

    if (state.cart.length === 0) {
      notify(
        "Vui lòng thêm món trước khi lưu đơn.",
        true
      );
      return false;
    }

    const existing = getOpenOrder(state.tableId);

    const items = state.cart.map(item => ({ ...item }));

    if (existing) {
      existing.items = items;
      existing.updatedAt = now();
    } else {
      db.orders.push({
        id: createId("DH"),
        tableId: state.tableId,
        items,
        status: "open",
        createdAt: now()
      });
    }

    saveDatabase();
    return true;
  }

  // =====================================================
  // 13. THANH TOAN
  // =====================================================

  function checkout(method, discount) {
    if (!canPay()) {
      notify("Bạn không có quyền thanh toán.", true);
      return;
    }

    const subtotal = calculateTotal(state.cart);

    if (
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > subtotal
    ) {
      notify(
        "Giá trị giảm giá không hợp lệ.",
        true
      );
      return;
    }

    if (!saveOrder()) return;

    const order = getOpenOrder(state.tableId);

    if (!order) {
      notify("Không tìm thấy đơn hàng.", true);
      return;
    }

    const duplicate = db.invoices.some(
      invoice => invoice.orderId === order.id
    );

    if (duplicate) {
      notify(
        "Đơn hàng đã được thanh toán.",
        true
      );
      return;
    }

    const total = subtotal - discount;

    db.invoices.push({
      id: createId("HD"),
      orderId: order.id,
      tableId: state.tableId,
      items: order.items.map(item => ({ ...item })),
      subtotal,
      discount,
      total,
      method,
      date: now()
    });

    order.status = "paid";
    order.paidAt = now();

    saveDatabase();

    state.cart = [];
    state.modal = null;
    state.page = "payments";

    render();

    notify(
      "Thanh toán thành công! Bàn đã được giải phóng."
    );
  }

  // =====================================================
  // 14. QUAN LY THUC DON
  // =====================================================

  function menuPage() {
    const rows = db.products.map(product => `
      <tr>

        <td>${escapeHTML(product.id)}</td>

        <td>
          ${product.emoji}
          <b>${escapeHTML(product.name)}</b>
        </td>

        <td>${escapeHTML(product.category)}</td>

        <td>${money(product.price)}</td>

        <td>
          ${pill(
            product.active ? "Đang bán" : "Ngừng bán",
            product.active ? "green" : "red"
          )}
        </td>

        <td>
          ${isManager()
            ? `<button
                 type="button"
                 class="btn small"
                 data-edit-product="${escapeHTML(product.id)}">
                 Chỉnh sửa
               </button>`
            : "Chỉ xem"}
        </td>

      </tr>
    `).join("");

    return heading(
      "Quản lý thực đơn",
      `${db.products.length} sản phẩm trong hệ thống`,
      isManager()
        ? button(
            "➕ Thêm món",
            "add-product",
            "primary"
          )
        : ""
    ) + `

      <div class="card">

        <div class="table-wrap">

          <table>
            <thead>
              <tr>
                <th>Mã món</th>
                <th>Tên món</th>
                <th>Danh mục</th>
                <th>Giá bán</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>

            <tbody>${rows}</tbody>
          </table>

        </div>

      </div>
    `;
  }

  // =====================================================
  // 15. QUAN LY HOA DON
  // =====================================================

  function invoiceTable(invoices, compact = false) {
    if (!invoices.length) {
      return `
        <div class="empty">
          Chưa có hóa đơn.
        </div>
      `;
    }

    const rows = invoices.map(invoice => `
      <tr>

        <td>
          <b>${escapeHTML(invoice.id)}</b>
        </td>

        ${compact
          ? ""
          : `<td>${escapeHTML(invoice.tableId)}</td>`}

        <td>
          ${new Date(invoice.date).toLocaleString("vi-VN")}
        </td>

        <td>
          <b>${money(invoice.total)}</b>
        </td>

      </tr>
    `).join("");

    return `
      <div class="table-wrap">

        <table>

          <thead>
            <tr>
              <th>Mã hóa đơn</th>
              ${compact ? "" : "<th>Bàn</th>"}
              <th>Thời gian</th>
              <th>Thành tiền</th>
            </tr>
          </thead>

          <tbody>
            ${rows}
          </tbody>

        </table>

      </div>
    `;
  }

  function paymentsPage() {
    const invoices = [...db.invoices].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    const revenue = invoices.reduce(
      (total, invoice) => total + invoice.total,
      0
    );

    const cashCount = invoices.filter(
      invoice => invoice.method === "Tiền mặt"
    ).length;

    const bankCount = invoices.filter(
      invoice => invoice.method === "Chuyển khoản"
    ).length;

    return heading(
      "Thanh toán & Hóa đơn",
      "Danh sách các giao dịch đã hoàn tất",
      canManageOrders()
        ? button(
            "🛒 Tạo đơn thanh toán",
            "new-order",
            "primary"
          )
        : ""
    ) + `

      <div class="grid stats">

        ${statsCard(
          "Tổng hóa đơn",
          invoices.length,
          "Giao dịch hoàn tất"
        )}

        ${statsCard(
          "Tổng doanh thu",
          money(revenue),
          "Bao gồm dữ liệu mẫu"
        )}

        ${statsCard(
          "Tiền mặt",
          cashCount,
          "Số hóa đơn"
        )}

        ${statsCard(
          "Chuyển khoản",
          bankCount,
          "Số hóa đơn"
        )}

      </div>

      <div class="card">
        <h2>🧾 Lịch sử hóa đơn</h2>
        ${invoiceTable(invoices)}
      </div>
    `;
  }

  // =====================================================
  // 16. QUAN LY KHO NGUYEN LIEU
  // =====================================================

  function inventoryPage() {
    const low = db.materials.filter(
      material => material.stock < material.minimum
    );

    const rows = db.materials.map(material => `
      <tr>

        <td>
          <b>${escapeHTML(material.name)}</b>
          <div class="muted">
            ${escapeHTML(material.id)}
          </div>
        </td>

        <td>
          ${material.stock}
          ${escapeHTML(material.unit)}
        </td>

        <td>
          ${material.minimum}
          ${escapeHTML(material.unit)}
        </td>

        <td>
          ${pill(
            material.stock < material.minimum
              ? "Sắp hết"
              : "Đủ hàng",

            material.stock < material.minimum
              ? "red"
              : "green"
          )}
        </td>

        <td>
          ${canManageStock()
            ? `<button
                 type="button"
                 class="btn small"
                 data-stock="${escapeHTML(material.id)}">
                 Nhập / xuất
               </button>`
            : "Chỉ xem"}
        </td>

      </tr>
    `).join("");

    return heading(
      "Quản lý kho",
      "Theo dõi số lượng nguyên liệu nhập, xuất và tồn",
      isManager()
        ? button(
            "➕ Thêm nguyên liệu",
            "add-material",
            "primary"
          )
        : ""
    ) + `

      ${low.length
        ? `<div class="notice">
             ⚠ Có ${low.length} nguyên liệu sắp hết:
             ${low.map(item =>
               escapeHTML(item.name)
             ).join(", ")}
           </div>`
        : ""}

      <div class="card">

        <div class="table-wrap">
          <table>

            <thead>
              <tr>
                <th>Nguyên liệu</th>
                <th>Tồn hiện tại</th>
                <th>Tồn tối thiểu</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>

            <tbody>${rows}</tbody>

          </table>
        </div>

      </div>
    `;
  }

  // =====================================================
  // 17. QUAN LY NHAN VIEN
  // =====================================================

  function employeesPage() {
    const rows = employees.map(staff => `
      <tr>
        <td>${escapeHTML(staff.employee_id)}</td>
        <td><b>${escapeHTML(staff.full_name)}</b></td>
        <td>${escapeHTML(staff.phone || "—")}</td>
        <td>${escapeHTML(staff.position)}</td>
        <td>${escapeHTML(staff.username || "Chưa cấp")}</td>
        <td>${escapeHTML(staff.role ? roleName(normalizeRole(staff.role)) : "—")}</td>
        <td>${pill(staff.is_active && staff.account_active !== false ? "Hoạt động" : "Đã khóa",
          staff.is_active && staff.account_active !== false ? "green" : "red")}</td>
        <td><button type="button" class="btn small"
          data-edit-employee="${escapeHTML(staff.employee_id)}">Chỉnh sửa</button></td>
      </tr>
    `).join("");
    return heading(
      "Quản lý nhân viên",
      `${employees.length} nhân viên trong hệ thống`,
      button("➕ Thêm nhân viên", "add-employee", "primary")
    ) + `
      ${employeeError ? `<div class="notice">${escapeHTML(employeeError)}</div>` : ""}
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã</th><th>Nhân viên</th><th>Số điện thoại</th><th>Chức vụ</th>
                <th>Tài khoản</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="8">Chưa có nhân viên.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // =====================================================
  // 18. BAO CAO DOANH THU
  // =====================================================

  function reportsPage() {
    const today = dateKey(new Date());

    const invoices = db.invoices.filter(invoice => {
      if (state.period === "all") return true;

      if (state.period === "today") {
        return dateKey(invoice.date) === today;
      }

      if (state.period === "week") {
        return new Date(invoice.date).getTime() >=
          Date.now() - 7 * 86400000;
      }

      return true;
    });

    const revenue = invoices.reduce(
      (total, invoice) => total + invoice.total,
      0
    );

    const average = invoices.length
      ? Math.round(revenue / invoices.length)
      : 0;

    const periodButtons = [
      ["today", "Hôm nay"],
      ["week", "7 ngày"],
      ["all", "Tất cả"]
    ].map(item => `
      <button
        class="filter ${
          state.period === item[0] ? "active" : ""
        }"
        data-period="${item[0]}">

        ${item[1]}

      </button>
    `).join("");

    return heading(
      "Báo cáo thống kê",
      "Phân tích hoạt động kinh doanh của quán"
    ) + `

      <div class="filters">
        ${periodButtons}
      </div>

      <div class="grid stats">

        ${statsCard(
          "Doanh thu",
          money(revenue),
          "Doanh thu trong kỳ"
        )}

        ${statsCard(
          "Số hóa đơn",
          invoices.length,
          "Giao dịch thành công"
        )}

        ${statsCard(
          "Trung bình / hóa đơn",
          money(average),
          "Giá trị trung bình"
        )}

        ${statsCard(
          "Số bàn",
          db.tables.length,
          "Tổng số bàn"
        )}

      </div>

      <div class="card">
        <h2>📈 Biểu đồ doanh thu 7 ngày</h2>
        ${revenueChart(7)}
      </div>

      <div class="card" style="margin-top:20px">
        <h2>📋 Chi tiết hóa đơn</h2>

        ${invoiceTable(
          [...invoices].sort(
            (a, b) => new Date(b.date) - new Date(a.date)
          )
        )}

      </div>
    `;
  }

  // =====================================================
  // 19. POPUP / MODAL
  // =====================================================

  function formButtons(label) {
    return `
      <div class="modal-actions">

        <button
          type="button"
          class="btn"
          data-action="close-modal">
          Hủy
        </button>

        <button
          type="submit"
          class="btn primary">
          ${label}
        </button>

      </div>
    `;
  }

  function openModal(type, id = null) {
    state.modal = { type, id };
    render();
  }

  function modalHTML() {
    if (!state.modal) return "";

    const modal = state.modal;

    let title = "";
    let content = "";

    // THEM / SUA MON
    if (modal.type === "product") {
      const product = db.products.find(
        item => item.id === modal.id
      ) || {
        name: "",
        category: categories[0],
        price: "",
        emoji: "☕",
        active: true
      };

      title = modal.id
        ? "Chỉnh sửa món"
        : "Thêm món mới";

      content = `
        <form id="productForm">

          <div class="field">
            <label>Tên món</label>

            <input
              name="name"
              required
              maxlength="90"
              value="${escapeHTML(product.name)}">
          </div>

          <div class="field">
            <label>Danh mục</label>

            <select name="category">

              ${categories.map(category => `
                <option
                  value="${escapeHTML(category)}"
                  ${
                    product.category === category
                      ? "selected"
                      : ""
                  }>

                  ${escapeHTML(category)}

                </option>
              `).join("")}

            </select>
          </div>

          <div class="field">
            <label>Giá bán (VNĐ)</label>

            <input
              name="price"
              type="number"
              min="0"
              step="1000"
              required
              value="${product.price}">
          </div>

          <div class="field">
            <label>Biểu tượng</label>

            <input
              name="emoji"
              maxlength="4"
              value="${escapeHTML(product.emoji)}">
          </div>

          <div class="field">
            <label>Trạng thái</label>

            <select name="active">

              <option
                value="1"
                ${product.active ? "selected" : ""}>
                Đang bán
              </option>

              <option
                value="0"
                ${!product.active ? "selected" : ""}>
                Ngừng bán
              </option>

            </select>
          </div>

          ${formButtons("Lưu món")}

        </form>
      `;
    }

    // THANH TOAN
    else if (modal.type === "pay") {
      const subtotal = calculateTotal(state.cart);

      title = "Xác nhận thanh toán";

      content = `
        <form id="payForm">

          <p>
            Bàn <b>${escapeHTML(state.tableId)}</b>
            · ${state.cart.reduce(
              (total, item) => total + item.qty,
              0
            )} món
          </p>

          <div class="split">
            <b>Tạm tính</b>
            <b>${money(subtotal)}</b>
          </div>

          <div class="field">
            <label>Giảm giá (VNĐ)</label>

            <input
              name="discount"
              type="number"
              min="0"
              max="${subtotal}"
              value="0">
          </div>

          <div class="field">
            <label>Phương thức thanh toán</label>

            <select name="method">
              <option>Tiền mặt</option>
              <option>Chuyển khoản</option>
            </select>
          </div>

          ${formButtons("Hoàn tất thanh toán")}

        </form>
      `;
    }

    // NHAP / XUAT KHO
    else if (modal.type === "stock") {
      const material = db.materials.find(
        item => item.id === modal.id
      );

      if (!material) return "";

      title = "Nhập / xuất kho";

      content = `
        <form id="stockForm">

          <p>
            <b>${escapeHTML(material.name)}</b>
            <br>

            Tồn hiện tại:
            ${material.stock}
            ${escapeHTML(material.unit)}
          </p>

          <div class="field">
            <label>Loại giao dịch</label>

            <select name="operation">
              <option value="in">Nhập kho</option>
              <option value="out">Xuất kho</option>
            </select>
          </div>

          <div class="field">
            <label>Số lượng</label>

            <input
              name="quantity"
              type="number"
              min="0.01"
              step="0.01"
              required>
          </div>

          ${formButtons("Ghi nhận giao dịch")}

        </form>
      `;
    }

    // THEM NGUYEN LIEU
    else if (modal.type === "material") {
      title = "Thêm nguyên liệu";

      content = `
        <form id="materialForm">

          <div class="field">
            <label>Tên nguyên liệu</label>
            <input name="name" required>
          </div>

          <div class="field">
            <label>Đơn vị tính</label>

            <input
              name="unit"
              required
              placeholder="kg, lít, cái...">
          </div>

          <div class="field">
            <label>Số lượng tồn đầu kỳ</label>

            <input
              name="stock"
              type="number"
              min="0"
              step="0.01"
              value="0"
              required>
          </div>

          <div class="field">
            <label>Tồn tối thiểu</label>

            <input
              name="minimum"
              type="number"
              min="0"
              step="0.01"
              value="1"
              required>
          </div>

          ${formButtons("Thêm nguyên liệu")}

        </form>
      `;
    }

    // THEM / SUA NHAN VIEN
    else if (modal.type === "employee") {
      const staff = employees.find(item => item.employee_id === modal.id) || {};

      title = modal.id
        ? "Chỉnh sửa nhân viên"
        : "Thêm nhân viên";

      content = `
        <form id="employeeForm">
          <div class="field"><label>Họ tên</label><input name="full_name" required maxlength="100" value="${escapeHTML(staff.full_name || "")}"></div>
          <div class="field"><label>Số điện thoại</label><input name="phone" maxlength="15" value="${escapeHTML(staff.phone || "")}"></div>
          <div class="field"><label>Email</label><input name="email" type="email" maxlength="100" value="${escapeHTML(staff.email || "")}"></div>
          <div class="field"><label>Chức vụ</label><input name="position" required maxlength="50" value="${escapeHTML(staff.position || "")}"></div>
          <div class="field"><label>Tên đăng nhập (để trống nếu chưa cấp)</label><input name="username" maxlength="50" value="${escapeHTML(staff.username || "")}"></div>
          <div class="field"><label>Mật khẩu ${staff.user_id ? "(để trống nếu giữ nguyên)" : "(ít nhất 12 ký tự nếu cấp tài khoản)"}</label>
            <input name="password" type="password" autocomplete="new-password" minlength="12"></div>
          <div class="field"><label>Vai trò</label><select name="role"><option value="">Chưa cấp</option>
            ${[["manager","Quản lý"],["phucvu","Phục vụ"],["thungan","Thu ngân"],["kho","Nhân viên kho"]]
              .map(([value,label]) => `<option value="${value}" ${staff.role === value ? "selected" : ""}>${label}</option>`).join("")}
          </select></div>
          <div class="field"><label>Trạng thái nhân viên</label><select name="is_active">
            <option value="1" ${staff.is_active !== false ? "selected" : ""}>Hoạt động</option>
            <option value="0" ${staff.is_active === false ? "selected" : ""}>Ngừng hoạt động</option>
          </select></div>
          <div class="field"><label>Trạng thái tài khoản</label><select name="account_active">
            <option value="1" ${staff.account_active !== false ? "selected" : ""}>Hoạt động</option>
            <option value="0" ${staff.account_active === false ? "selected" : ""}>Khóa</option>
          </select></div>
          ${formButtons("Lưu nhân viên")}
        </form>
      `;
    }

    return `
      <div
        class="modal-cover"
        data-action="close-modal">

        <div class="modal">

          <div class="split">
            <h2>${title}</h2>

            <button
              type="button"
              class="btn small"
              data-action="close-modal">
              ✕
            </button>
          </div>

          ${content}

        </div>

      </div>
    `;
  }

  // =====================================================
  // 20. HIEN THI UNG DUNG
  // =====================================================

  function render() {
    if (!currentUser()) {
      app.innerHTML = loginPage();
      return;
    }

    if (!hasPermission(state.page)) {
      state.page = "dashboard";
    }

    app.innerHTML = mainLayout();
  }

  // =====================================================
  // 21. XU LY SU KIEN CLICK
  // =====================================================

  app.addEventListener("click", event => {
    const target = event.target.closest(
      "[data-action], [data-page], [data-table], " +
      "[data-cat], [data-prod], [data-qty], " +
      "[data-edit-product], [data-stock], " +
      "[data-edit-employee], [data-period]"
    );

    if (!target) return;

    // CHUYEN TRANG
    if (target.dataset.page) {
      changePage(target.dataset.page);
      return;
    }

    // CHON BAN
    if (target.dataset.table) {
      if (!checkOrderPermission()) return;

      state.tableId = target.dataset.table;
      loadCart();

      state.page = "sale";
      render();

      return;
    }

    // LOC DANH MUC
    if (target.dataset.cat) {
      state.category = target.dataset.cat;
      render();
      return;
    }

    // LOC BAO CAO
    if (target.dataset.period) {
      state.period = target.dataset.period;
      render();
      return;
    }

    // THEM MON VAO GIO
    if (target.dataset.prod) {
      if (!checkOrderPermission()) return;

      const product = db.products.find(
        item =>
          item.id === target.dataset.prod &&
          item.active
      );

      if (!product) return;

      let cartItem = state.cart.find(
        item => item.productId === product.id
      );

      if (cartItem) {
        cartItem.qty++;
      } else {
        state.cart.push({
          productId: product.id,
          qty: 1,
          price: product.price
        });
      }

      render();
      return;
    }

    // TANG GIAM SO LUONG
    if (target.dataset.qty !== undefined) {
      if (!checkOrderPermission()) return;

      const index = Number(target.dataset.qty);
      const item = state.cart[index];

      if (!item) return;

      item.qty += Number(target.dataset.change);

      if (item.qty <= 0) {
        state.cart.splice(index, 1);
      }

      render();
      return;
    }

    // SUA MON
    if (target.dataset.editProduct) {
      if (checkManager()) {
        openModal(
          "product",
          target.dataset.editProduct
        );
      }

      return;
    }

    // NHAP XUAT KHO
    if (target.dataset.stock) {
      if (!canManageStock()) {
        notify(
          "Không có quyền quản lý kho.",
          true
        );
        return;
      }

      openModal(
        "stock",
        target.dataset.stock
      );

      return;
    }

    // SUA NHAN VIEN
    if (target.dataset.editEmployee) {
      if (checkManager()) {
        openModal(
          "employee",
          target.dataset.editEmployee
        );
      }

      return;
    }

    // CAC NUT DIEU KHIEN
    switch (target.dataset.action) {

      case "logout":
        clearSession();

        state.page = "dashboard";
        state.modal = null;
        state.cart = [];

        render();
        notify("Đã đăng xuất thành công!");
        break;

      case "new-order":
        if (!checkOrderPermission()) return;

        if (!db.tables.length) {
          notify(
            "Hệ thống chưa có bàn nào.",
            true
          );
          return;
        }

        state.tableId =
          db.tables.find(
            table => !getOpenOrder(table.id)
          )?.id || db.tables[0].id;

        loadCart();

        state.page = "sale";
        render();
        break;

      case "save-order":
        if (saveOrder()) {
          render();
          notify("Đã lưu đơn hàng thành công.");
        }
        break;

      case "open-pay":
        if (!canPay()) {
          notify(
            "Chỉ thu ngân hoặc quản lý được thanh toán.",
            true
          );
          return;
        }

        if (!state.cart.length) {
          notify(
            "Đơn hàng chưa có món.",
            true
          );
          return;
        }

        openModal("pay");
        break;

      case "transfer-table":
        performTableAction("transfer");
        break;

      case "merge-table":
        performTableAction("merge");
        break;

      case "add-product":
        if (checkManager()) {
          openModal("product");
        }
        break;

      case "add-material":
        if (checkManager()) {
          openModal("material");
        }
        break;

      case "add-employee":
        if (checkManager()) {
          openModal("employee");
        }
        break;

      case "close-modal":
        if (
          target.classList.contains("modal-cover") &&
          event.target.closest(".modal")
        ) {
          return;
        }

        state.modal = null;
        render();
        break;
    }
  });

  // =====================================================
  // 22. XU LY THAY DOI SELECT
  // =====================================================

  app.addEventListener("change", event => {
    if (event.target.id === "tableSelect") {
      const id = event.target.value;

      if (!id) return;

      state.tableId = id;

      loadCart();
      render();
    }
  });

  // =====================================================
  // 23. XU LY FORM
  // =====================================================

  app.addEventListener("submit", async event => {
    const form = event.target;

    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    event.preventDefault();

    const values = Object.fromEntries(
      new FormData(form).entries()
    );

    // -----------------------------------------
    // DANG NHAP SQL SERVER
    // -----------------------------------------

    if (form.id === "loginForm") {
      const username = String(
        values.username || ""
      ).trim();

      const password = String(
        values.password || ""
      );

      const errorElement =
        form.querySelector("#loginError");

      const submitButton =
        form.querySelector('button[type="submit"]');

      if (errorElement) {
        errorElement.textContent = "";
        errorElement.style.display = "none";
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Đang đăng nhập...";
      }

      try {
        await loginWithSQL(username, password);

      } catch (error) {
        const message = error instanceof TypeError
          ? "Không kết nối được backend. Hãy kiểm tra node server.js."
          : error.message;

        if (errorElement) {
          errorElement.textContent = message;
          errorElement.style.display = "block";
        }

        notify(message, true);

      } finally {
        if (
          submitButton &&
          submitButton.isConnected
        ) {
          submitButton.disabled = false;
          submitButton.textContent = "Đăng nhập →";
        }
      }

      return;
    }

    // Khong cho gui cac form quan ly khi chua dang nhap.
    if (!currentUser()) {
      notify(
        "Vui lòng đăng nhập trước.",
        true
      );
      return;
    }

    // -----------------------------------------
    // THEM / SUA MON
    // -----------------------------------------

    if (form.id === "productForm") {
      if (!checkManager()) return;

      const price = Number(values.price);

      if (
        !String(values.name || "").trim() ||
        !Number.isFinite(price) ||
        price < 0
      ) {
        notify(
          "Thông tin món không hợp lệ.",
          true
        );
        return;
      }

      const product = db.products.find(
        item => item.id === state.modal?.id
      );

      const newValues = {
        name: values.name.trim(),
        category: values.category,
        price,
        emoji: values.emoji || "☕",
        active: values.active === "1"
      };

      if (product) {
        Object.assign(product, newValues);
      } else {
        db.products.push({
          id: createId("P"),
          ...newValues
        });
      }

      saveDatabase();

      state.modal = null;
      render();

      notify("Đã lưu thông tin món.");
      return;
    }

    // -----------------------------------------
    // THANH TOAN
    // -----------------------------------------

    if (form.id === "payForm") {
      checkout(
        values.method,
        Number(values.discount)
      );
      return;
    }

    // -----------------------------------------
    // NHAP / XUAT KHO
    // -----------------------------------------

    if (form.id === "stockForm") {
      if (!canManageStock()) {
        notify(
          "Không có quyền quản lý kho.",
          true
        );
        return;
      }

      const material = db.materials.find(
        item => item.id === state.modal?.id
      );

      const quantity = Number(values.quantity);

      if (
        !material ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        notify(
          "Số lượng không hợp lệ.",
          true
        );
        return;
      }

      if (
        values.operation === "out" &&
        quantity > material.stock
      ) {
        notify(
          "Không thể xuất quá số lượng tồn kho.",
          true
        );
        return;
      }

      if (values.operation === "in") {
        material.stock += quantity;
      } else {
        material.stock -= quantity;
      }

      material.stock =
        Math.round(material.stock * 100) / 100;

      db.transactions.push({
        id: createId("KHO"),
        materialId: material.id,
        operation: values.operation,
        quantity,
        date: now(),
        userId
      });

      saveDatabase();

      state.modal = null;
      render();

      notify("Cập nhật kho thành công.");
      return;
    }

    // -----------------------------------------
    // THEM NGUYEN LIEU
    // -----------------------------------------

    if (form.id === "materialForm") {
      if (!checkManager()) return;

      const stock = Number(values.stock);
      const minimum = Number(values.minimum);

      if (
        !String(values.name || "").trim() ||
        !String(values.unit || "").trim() ||
        !Number.isFinite(stock) ||
        !Number.isFinite(minimum) ||
        stock < 0 ||
        minimum < 0
      ) {
        notify(
          "Thông tin nguyên liệu không hợp lệ.",
          true
        );
        return;
      }

      db.materials.push({
        id: createId("NL"),
        name: values.name.trim(),
        unit: values.unit.trim(),
        stock,
        minimum
      });

      saveDatabase();

      state.modal = null;
      render();

      notify("Đã thêm nguyên liệu.");
      return;
    }

    // -----------------------------------------
    // THEM / SUA NHAN VIEN SQL SERVER
    // -----------------------------------------

    if (form.id === "employeeForm") {
      if (!checkManager()) return;

      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const id = state.modal?.id;
        await managerRequest(id ? `/employees/${encodeURIComponent(id)}` : "/employees", {
          method: id ? "PUT" : "POST",
          body: JSON.stringify({
            full_name: values.full_name.trim(), phone: values.phone.trim(),
            email: values.email.trim(), position: values.position.trim(),
            username: values.username.trim(), password: values.password,
            role: values.role, is_active: values.is_active === "1",
            account_active: values.account_active === "1"
          })
        });
        state.modal = null;
        await loadEmployees();
        notify("Đã lưu nhân viên.");
      } catch (error) { notify(error.message, true); }
      finally { if (button.isConnected) button.disabled = false; }
      return;
    }
  });

  // =====================================================
  // 24. KHOI DONG UNG DUNG
  // =====================================================

  if (
    db.tables.length &&
    !db.tables.some(
      table => table.id === state.tableId
    )
  ) {
    state.tableId = db.tables[0].id;
  }

  // Hien thi man hinh dang nhap truoc.
  render();

  // Xac minh token voi backend.
  restoreSession();

  // Lay thuc don va ban tu SQL Server.
  loadProductsFromSQL();
  loadTablesFromSQL();

  console.log(
    "MOC Coffee POS - Frontend initialized."
  );

})();
