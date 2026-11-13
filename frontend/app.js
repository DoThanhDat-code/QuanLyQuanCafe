
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
  
  
  // ==========================================
  // KHOI TAO GIAO DIEN MOC COFFEE
  // ==========================================

  const app = document.getElementById("app");

  const toastRoot = document.getElementById("toast-root");

  if (!app) {
    console.error("Không tìm thấy #app trong index.html");
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
    ["accounts", "🔐", "Quản lý tài khoản"],
    ["reports", "📈", "Báo cáo"]
  ];

  const permissions = {
        product_manager: ["dashboard", "menu"],
    hr_manager: ["dashboard", "employees"],
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
      product_manager: "product_manager",
    hr_manager: "hr_manager",
  admin: "manager",
  manager: "manager",
  phucvu: "service",
  waiter: "service",      // Thêm
  thungan: "cashier",
  cashier: "cashier",     // Thêm
  kho: "stock",
  inventory: "stock"      // Thêm
}[role] || null);

function isAdmin() {
    return authenticatedUser?.originalRole === "admin";
}


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
    cartOrder: null,
    savingOrder: false,
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
    originalRole: user.role,
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
      await loadSignedInData();

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
    await loadSignedInData();
  }

  async function loadSignedInData() {
    if (hasPermission("menu")) {
      try {
        await loadCategoriesFromSQL();
        await loadProductsFromSQL();
      } catch (error) {
        db.products = [];
        sqlCategories = [];
        render();
        notify(error.message, true);
      }
    }

    await loadTablesFromSQL();
  }

  // =====================================================
 // 6. TAI DU LIEU TU SQL SERVER
  // =====================================================

  // Luu danh sach danh muc lay tu SQL Server
  let sqlCategories = [];
  async function apiRequest(path, method = "GET", data = null) {
  const token = sessionStorage.getItem(TOKEN_KEY);

  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const options = {
    method,
    headers
  };

  if (data !== null) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(
    `${API_URL}${path}`,
    options
  );
if (response.status === 204) return null;
  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error ||
      result.message ||
      "Không thể kết nối API."
    );
  }

  return result;
}

  // 1. LAY DANH SACH DANH MUC
  async function loadCategoriesFromSQL() {
  const result = await apiRequest("/categories");

  const data = Array.isArray(result)
    ? result
    : result.categories || result.data;

  if (!Array.isArray(data)) {
    throw new Error("Dữ liệu danh mục không hợp lệ.");
  }

  sqlCategories = data;

  console.log(
    "Đã tải danh mục:",
    sqlCategories.length
  );

  return sqlCategories;
}

  // 2. LAY DANH SACH SAN PHAM
  async function loadProductsFromSQL() {
  const result = await apiRequest("/products");

  const products = Array.isArray(result)
    ? result
    : result.products || result.data;

  if (!Array.isArray(products)) {
    throw new Error("Dữ liệu sản phẩm không hợp lệ.");
  }

  db.products = products.map(product => ({
    id: product.product_id,
    name: product.product_name,
    categoryId: product.category_id,
    category: product.category_name,
    price: Number(product.price),

    imageUrl: product.image_url || "",
    description: product.description || "",

    emoji: "☕",

    active: Boolean(product.is_active),
    available: Boolean(product.is_available ?? true)
  }));

  render();

  console.log(
    "Đã tải sản phẩm từ SQL Server:",
    db.products.length
  );

  return db.products;
}
  async function loadTablesFromSQL() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const allowedRoles = ["admin", "waiter", "phucvu", "cashier", "thungan"];
    if (!token || !allowedRoles.includes(currentUser()?.originalRole)) return false;

    try {
      const [tables, orders] = await Promise.all([
        apiRequest("/tables"),
        apiRequest("/tables/active-orders")
      ]);

      if (sessionStorage.getItem(TOKEN_KEY) !== token) return false;
      if (!Array.isArray(tables) || !Array.isArray(orders)) {
        throw new Error("Dữ liệu bàn và đơn hàng không hợp lệ.");
      }

      db.tables = tables.filter(table => Boolean(table.is_active)).map(table => ({
        id: table.table_id,
        name: table.table_name,
        seats: Number(table.seats),
        status: table.status,
        active: true
      }));
      db.orders = db.orders.filter(order => order.status !== "open").concat(
        orders.map(order => ({
          id: order.order_id,
          tableId: order.table_id,
          status: "open",
          items: order.items.map(item => ({
            productId: item.productId,
            qty: Number(item.qty),
            price: Number(item.price)
          })),
          linkedTableIds: order.linkedTableIds || [],
          createdAt: order.order_date
        }))
      );

      if (!db.tables.some(table => table.id === state.tableId)) {
        state.tableId = db.tables[0]?.id ?? null;
        state.cart = [];
        state.cartOrder = null;
      }

      render();
      return true;
    } catch (error) {
      console.error("Lỗi đồng bộ bàn và đơn:", error);
      notify(error.message || "Không thể tải bàn và đơn hàng.", true);
      return false;
    }
  }

  // 3. HAM GUI YEU CAU THEM, SUA, NGUNG BAN
 async function productRequest(
  method,
  path = "",
  data = null
) {
  return apiRequest(
    `/products${path}`,
    method,
    data
  );
}

  // 4. THEM SAN PHAM VAO SQL SERVER
  async function addProductToSQL(product) {
    const result = await productRequest(
      "POST",
      "",
      product
    );

    await loadProductsFromSQL();

    return result;
  }

  // 5. SUA SAN PHAM TRONG SQL SERVER
  async function updateProductToSQL(id, product) {
    const result = await productRequest(
      "PUT",
      `/${encodeURIComponent(id)}`,
      product
    );

    await loadProductsFromSQL();

    return result;
  }

  // 6. NGUNG KINH DOANH SAN PHAM
  async function stopProductInSQL(id) {
  const result = await productRequest(
    "PATCH",
    `/${encodeURIComponent(id)}/stop`
  );

  await loadProductsFromSQL();

  return result;
}

async function resumeProductInSQL(id) {
  const result = await productRequest(
    "PATCH",
    `/${encodeURIComponent(id)}/resume`
  );

  await loadProductsFromSQL();

  return result;
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

    // Chi Admin duoc truy cap quan ly tai khoan
    if (page === "accounts") {
        return isAdmin();
    }

    return permissions[account.role]?.includes(page) || false;
  }


    function canManageOrders() {
    return isAdmin() || currentUser()?.role === "service";
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
      (order.tableId === tableId || order.linkedTableIds?.includes(tableId)) &&
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

  async function loadCartFromSQL() {
    const tableId = state.tableId;
    const token = sessionStorage.getItem(TOKEN_KEY);
    const order = getOpenOrder(tableId);
    if (!order) {
      state.cart = [];
      state.cartOrder = null;
      return;
    }

    const result = await apiRequest(`/orders/${encodeURIComponent(order.id)}`);
    if (state.tableId !== tableId || sessionStorage.getItem(TOKEN_KEY) !== token) return;
    if (!result.order || !Array.isArray(result.items)) {
      throw new Error("Chi tiết đơn hàng không hợp lệ.");
    }

    state.cart = result.items.map(item => ({
      detailId: item.order_detail_id,
      productId: item.product_id,
      qty: Number(item.quantity),
      price: Number(item.unit_price)
    }));
    state.cartOrder = {
      id: order.id,
      items: new Map(state.cart.map(item => [item.detailId, item.qty]))
    };
  }

  async function selectOrderTable(tableId) {
    if (state.savingOrder || !checkOrderPermission()) return;
    const table = db.tables.find(item => item.id === tableId);
    if (!table || ["reserved", "maintenance"].includes(table.status)) {
      notify("Bàn đã đặt trước, đang bảo trì hoặc không còn hoạt động.", true);
      render();
      return;
    }

    const previousTable = state.tableId;
    state.tableId = tableId;
    try {
      await loadCartFromSQL();
      if (state.tableId !== tableId) return;
      state.page = "sale";
      render();
    } catch (error) {
      if (state.tableId !== tableId) return;
      state.tableId = previousTable;
      notify(error.message, true);
      render();
    }
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

// Tu dong tai danh sach khi Admin mo trang
if (page === "accounts" && isAdmin()) {
    loadAccountsFromSQL();
}

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

  function checkTableAdmin() {
    if (isAdmin()) return true;
    notify("Chức năng quản lý bàn chỉ dành cho Admin.", true);
    return false;
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

              ${button("Đổi mật khẩu", "change-password", "small")}
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
let accountList = [];
let accountLoading = false;


async function loadAccountsFromSQL() {
    if (!isAdmin()) return;

    const token = sessionStorage.getItem(TOKEN_KEY);

    if (!token) {
        notify("Vui lòng đăng nhập lại.", true);
        return;
    }

    accountLoading = true;

    try {
        const response = await fetch(`${API_URL}/accounts`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Không thể tải danh sách tài khoản."
            );
        }

        accountList = result;

    } catch (error) {
        console.error("Lỗi tải danh sách tài khoản:", error);
        notify(error.message, true);

    } finally {
        accountLoading = false;

        if (state.page === "accounts" && isAdmin()) {
            render();
        }
    }
}
function accountsPage() {
    if (!isAdmin()) {
        return heading(
            "Không có quyền truy cập",
            "Chỉ Admin được quản lý tài khoản."
        );
    }

    // Chống chèn mã HTML từ dữ liệu tài khoản
    const escapeAccountHTML = value =>
        String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);

    const roleNames = {
        admin: "Admin",
        manager: "Quản lý",
        phucvu: "Phục vụ",
        waiter: "Phục vụ",
        thungan: "Thu ngân",
        cashier: "Thu ngân",
        kho: "Kho",
        inventory: "Kho",
        product_manager: "Quản lý sản phẩm",
        hr_manager: "Quản lý nhân sự"
    };

    const rows = accountList.map((account, index) => {
        const role = roleNames[account.role] || account.role;

        const status = account.is_active
            ? "🟢 Hoạt động"
            : "🔴 Đã khóa";

        const createdAt = account.created_at
            ? new Date(account.created_at).toLocaleDateString("vi-VN")
            : "—";

        
return `
    <tr>
        <td>${index + 1}</td>
        <td>${escapeAccountHTML(account.username)}</td>
        <td>${escapeAccountHTML(account.full_name || "Chưa liên kết")}</td>
        <td>${escapeAccountHTML(role)}</td>
        <td>${status}</td>
        <td>${escapeAccountHTML(createdAt)}</td>
        <td>
            
${account.role === "admin" ? "—" : `
    <button
        type="button"
        class="btn small"
        data-action="change-account-role"
        data-account-id="${escapeAccountHTML(account.user_id)}">
        ✏️ Đổi quyền
    </button>

    <button
        type="button"
        class="btn small"
        data-action="reset-account-password"
        data-account-id="${escapeAccountHTML(account.user_id)}">
        Đặt lại mật khẩu
    </button>

    <button
        type="button"
        class="btn small"
        data-action="toggle-account-status"
        data-account-id="${escapeAccountHTML(account.user_id)}">
        ${account.is_active
            ? "🔒 Khóa"
            : "🔓 Mở khóa"}
    </button>
`}

        </td>
    </tr>
`;

    }).join("");

    return heading(
        "Quản lý tài khoản",
        "Danh sách tài khoản được lưu trong SQL Server"
    ) + `
        <div class="card">
            <div class="split">
                <h2>🔐 Danh sách tài khoản</h2>

                <button
                    type="button"
                    class="btn primary"
                    data-action="add-account">
                    ➕ Tạo tài khoản mới
                </button>
            </div>

            <div style="overflow-x:auto; margin-top:20px;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr>
                            <th>STT</th>
                            <th>Tên đăng nhập</th>
                            <th>Họ tên nhân viên</th>
                            <th>Quyền</th>
                            <th>Trạng thái</th>
                            <th>Ngày tạo</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${accountLoading
                            ? '<tr><td colspan="7">Đang tải...</td></tr>'
                            : rows || '<tr><td colspan="7">Chưa có dữ liệu. Bấm Làm mới để tải danh sách.</td></tr>'
                        }
                    </tbody>
                </table>
            </div>

            <button
                type="button"
                class="btn"
                data-action="refresh-accounts"
                style="margin-top:20px;">
                🔄 Làm mới danh sách
            </button>
        </div>
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
      accounts: accountsPage,
      reports: reportsPage
    };

    return (pages[state.page] || dashboardPage)();
  }

  // =====================================================
  // 10. TRANG TONG QUAN
  // =====================================================

  function dashboardPage() {
        const role = currentUser()?.role;

    if (role === "product_manager") {
      return heading("Tổng quan sản phẩm", "Mở Thực đơn để xem danh sách món.");
    }

    if (role === "hr_manager") {
      return heading("Tổng quan nhân sự", "Mở Nhân viên để xem hồ sơ nhân viên.");
    }
        if (currentUser()?.role === "service") {
      const busyTables = db.tables.filter(
        table => table.status === "occupied"
      ).length;

      return heading(
        "Tổng quan phục vụ",
        "Theo dõi trạng thái bàn và tạo đơn cho khách",
        button("➕ Tạo đơn mới", "new-order", "primary")
      ) + `
        <div class="grid stats">
          ${statsCard(
            "Bàn đang phục vụ",
            busyTables + "/" + db.tables.length,
            "Trạng thái bàn hiện tại"
          )}
        </div>
      `;
    }
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
  table => table.status === "occupied"
).length;

const available = db.tables.filter(
  table => table.status === "available"
).length;


   
    const content = db.tables.map(table => {
      const order = getOpenOrder(table.id);

      const statusInfo = {
        available: ["Bàn trống", "green"],
        occupied: ["Đang phục vụ", "orange"],
        reserved: ["Đã đặt trước", "orange"],
        maintenance: ["Đang bảo trì", "red"]
      };

      const [statusText, statusColor] =
        statusInfo[table.status] || ["Không xác định", ""];

      return `
        <div class="table-box ${table.status === "occupied" ? "busy" : ""}">

          <div class="split">
            <b>${escapeHTML(table.id)}</b>
          </div>

          <div class="muted">
            ${escapeHTML(table.name || table.id)}
          </div>

          <div class="bottom">
            ${pill(statusText, statusColor)}
             ${order?.linkedTableIds?.includes(table.id) ? `<small>Ghép với ${escapeHTML(order.tableId)}</small>` : ""}
             ${order?.tableId === table.id && order?.linkedTableIds?.length ? `<small>Bàn chính · Ghép với ${escapeHTML(order.linkedTableIds.join(", "))}</small>` : ""}
          </div>

          ${order
            ? `<small>${money(calculateTotal(order.items))}</small>`
            : ""}

          <div class="actions">
                        ${isAdmin() ? `
              <button type="button" class="btn"
                      data-edit-table="${escapeHTML(table.id)}">
                ✏️ Sửa bàn
              </button>
              <button type="button" class="btn"
                      data-status-table="${escapeHTML(table.id)}">
                🔄 Đổi trạng thái
              </button>
              <button type="button" class="btn"
                      data-delete-table="${escapeHTML(table.id)}">
                🗑️ Xóa bàn
              </button>
            ` : ""}

            

            <button
              type="button"
              class="btn"
              data-table="${escapeHTML(table.id)}">
              Chọn bàn →
            </button>
          </div>

        </div>
      `;
    }).join("");



    return heading(
      "Quản lý bàn",
`${available} bàn trống · ${busy} bàn đang phục vụ`,
      `
                ${isAdmin() ? `
          <button type="button" class="btn primary" data-action="add-table">
            + Thêm bàn
          </button>
        ` : ""}

        ${canManageOrders()
          ? button("🛒 Tạo đơn mới", "new-order", "primary")
          : ""}
      `
    ) + `


      <div class="table-grid">
        ${content}
      </div>

      ${isAdmin() ? tableOperations() : ""}
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
          Chuyển khách sang bàn trống hoặc gộp hóa đơn hai bàn đang phục vụ.
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
          Chuyển bàn giải phóng bàn nguồn. Nếu bàn đích đã có đơn, các món được chuyển vào đơn đích.
          Gộp bàn: hai bàn đang phục vụ; toàn bộ món chuyển vào hóa đơn bàn đích, bàn nguồn vẫn phục vụ và gọi thêm món vào hóa đơn chung.
        </p>

      </div>
    `;
  }

async function updateTableStatus(tableId, status) {
  const response = await fetch(
    `${API_URL}/tables/${encodeURIComponent(tableId)}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ""}`
      },
      body: JSON.stringify({ status })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error || `Không thể cập nhật bàn ${tableId}`
    );
  }

  return result;
}

async function performTableAction(mode) {
    if (!checkTableAdmin()) return;

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

    // Dong bo truoc khi kiem tra, tranh dung don hang cu trong localStorage.
    if (!(await loadTablesFromSQL())) return;
    const source = getOpenOrder(sourceId);
    const destination = getOpenOrder(destinationId);

    if (!source) {
      notify("Bàn nguồn chưa có đơn hàng.", true);
      return;
    }



if (mode === "transfer") {
  if (source.tableId !== sourceId) {
    notify("Ban nguon dang ghep voi ban khac, khong the chuyen.", true);
    return;
  }
  const targetTable = db.tables.find(table => table.id === destinationId);
  if (!targetTable || ["reserved", "maintenance"].includes(targetTable.status)) {
    notify("Ban dich khong san sang de chuyen.", true);
    return;
  }
  if (destination && destination.tableId !== destinationId) {
    notify("Ban dich dang la ban phu cua nhom khac.", true);
    return;
  }
  const message = destination
    ? `Chuyen ${sourceId} sang ${destinationId}? Toan bo mon se gop vao hoa don ${destinationId}; ${sourceId} se thanh ban trong.`
    : `Chuyen don tu ${sourceId} sang ${destinationId}? ${sourceId} se thanh ban trong.`;
  if (!confirm(message)) return;
  try {
    const response = await fetch(`${API_URL}/tables/transfer-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ""}`
      },
      body: JSON.stringify({ orderId: source.id, sourceId, destinationId })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Khong the chuyen ban.");
    if (state.tableId === sourceId) state.tableId = destinationId;
    await loadTablesFromSQL();
    notify(`Da chuyen ${sourceId} sang ${destinationId}. ${sourceId} da trong.`);
  } catch (error) {
    console.error("Loi chuyen ban:", error);
    notify(error.message || "Khong the chuyen ban.", true);
    await loadTablesFromSQL();
  }
  return;
}

if (mode === "merge") {
  const target = db.tables.find(t => t.id === destinationId);
  if (!destination || !target || target.status !== "occupied") {
    notify("Bàn đích phải đang phục vụ và có đơn mở.", true);
    return;
  }
  if (source.tableId !== sourceId || destination.tableId !== destinationId) {
    notify("Hãy chọn hai bàn chính chưa được ghép vào bàn khác.", true);
    return;
  }
  if (!confirm(`Gộp ${sourceId} vào ${destinationId}? Tất cả món sẽ tính chung tại ${destinationId}, nhưng cả hai bàn vẫn đang phục vụ.`)) return;
  try {
    const response = await fetch(`${API_URL}/tables/join-table`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ""}`
      },
      body: JSON.stringify({ sourceId, destinationId, orderId: source.id, destinationOrderId: destination.id })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Không thể gộp bàn.");
    await loadTablesFromSQL();
    notify(`Đã gộp ${sourceId} vào ${destinationId}. Hai bàn vẫn phục vụ; thanh toán chung tại ${destinationId}.`);
  } catch (error) {
    notify(error.message || "Không thể gộp bàn.", true);
    await loadTablesFromSQL();
  }
  return;
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
  product.available === true &&
  sqlCategories.some(category =>
    category.category_id === product.categoryId &&
    category.is_active
  ) &&
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

   const filters = [
  "Tất cả",
  ...sqlCategories
    .filter(c => c.is_active)
    .map(c => c.category_name)
].map(
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
    "🧾 Tạm tính",
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

  
  async function saveOrder() {
    if (state.savingOrder || !checkOrderPermission()) return false;
    if (!state.cart.length) {
      notify("Đơn cần ít nhất một món. Để bỏ toàn bộ món, hãy hủy đơn.", true);
      return false;
    }

    const tableId = state.tableId;
    const cart = state.cart.map(item => ({ ...item }));
    const loadedOrder = state.cartOrder;
    let wroteToServer = false;
    state.savingOrder = true;

    try {
      if (!(await loadTablesFromSQL())) return false;
      if (state.tableId !== tableId) return false;

      const order = getOpenOrder(tableId);
      if ((order?.id ?? null) !== (loadedOrder?.id ?? null)) {
        await loadCartFromSQL();
        notify("Đơn của bàn đã thay đổi. Kiểm tra lại giỏ trước khi lưu.", true);
        return false;
      }

      const newItems = cart.filter(item => item.detailId == null).map(item => ({
        product_id: item.productId,
        quantity: item.qty
      }));

      if (!order) {
        await apiRequest("/orders", "POST", { table_id: tableId, items: newItems });
        wroteToServer = true;
      } else {
        const orderPath = `/orders/${encodeURIComponent(order.id)}`;
        const savedOrder = await apiRequest(orderPath);
        if (savedOrder.order.status !== "pending") {
          notify("Chỉ được sửa món khi đơn đang chờ phục vụ.", true);
          return false;
        }

        const savedItems = new Map(savedOrder.items.map(item => [
          item.order_detail_id, Number(item.quantity)
        ]));
        if (savedItems.size !== loadedOrder.items.size ||
            [...savedItems].some(([id, qty]) => loadedOrder.items.get(id) !== qty)) {
          await loadCartFromSQL();
          notify("Chi tiết đơn đã thay đổi. Kiểm tra lại giỏ trước khi lưu.", true);
          return false;
        }

        const retainedIds = new Set(cart.map(item => item.detailId));
        for (const item of cart) {
          if (item.detailId == null || savedItems.get(item.detailId) === item.qty) continue;
          await apiRequest(`${orderPath}/items/${encodeURIComponent(item.detailId)}`, "PATCH", {
            quantity: item.qty
          });
          wroteToServer = true;
        }

        if (newItems.length) {
          await apiRequest(`${orderPath}/items`, "POST", { items: newItems });
          wroteToServer = true;
        }

        for (const id of savedItems.keys()) {
          if (retainedIds.has(id)) continue;
          await apiRequest(`${orderPath}/items/${encodeURIComponent(id)}`, "DELETE");
          wroteToServer = true;
        }
      }

      if (!(await loadTablesFromSQL())) {
        notify("Đã lưu lên SQL Server. Mở lại bàn để kiểm tra đơn.", true);
        return false;
      }

      await loadCartFromSQL();
      return true;
    } catch (error) {
      if (wroteToServer) {
        try {
          if (await loadTablesFromSQL()) await loadCartFromSQL();
        } catch (reloadError) {
          console.error("Lỗi tải lại đơn:", reloadError);
        }
      }
      notify(
        wroteToServer ? `Một phần đơn đã được lưu. ${error.message}` : error.message,
        true
      );
      return false;
    } finally {
      state.savingOrder = false;
      render();
    }
  }

  // =====================================================
  // 13. THANH TOAN
  // =====================================================

  // =====================================================
  // 14. QUAN LY THUC DON
  // =====================================================

  function menuPage() {
  const rows = db.products.map(product => `
    <tr>
      <td>${escapeHTML(product.id)}</td>

      <td>
        ${product.imageUrl ? `
          <img
            src="${escapeHTML(product.imageUrl)}"
            alt="${escapeHTML(product.name)}"
            style="width:55px;height:55px;
                   object-fit:cover;border-radius:8px;"
          >
        ` : "☕"}

        <b>${escapeHTML(product.name)}</b>

        <div class="muted">
          ${escapeHTML(product.description || "")}
        </div>
      </td>

      <td>${escapeHTML(product.category)}</td>

      <td>${money(product.price)}</td>

      <td>
        ${pill(
          product.active && product.available
            ? "Đang bán"
            : "Ngừng bán",

          product.active && product.available
            ? "green"
            : "red"
        )}
      </td>

      <td>
  ${isManager() ? `
    <button
      type="button"
      class="btn small"
      data-edit-product="${escapeHTML(product.id)}">
      📝 Chỉnh sửa
    </button>

    ${product.active && product.available === true
      ? `
        <button
          type="button"
          class="btn small"
          data-stop-product="${escapeHTML(product.id)}">
          ⛔ Ngừng bán
        </button>
      `
      : `
        <button
          type="button"
          class="btn small btn-resume"
          data-resume-product="${escapeHTML(product.id)}">
          ▶ Mở bán
        </button>
      `
    }

  ` : "Chỉ xem"}
</td>
    </tr>
  `).join("");

  return heading(
    "Quản lý thực đơn",
    `${db.products.length} sản phẩm trong hệ thống`,
    isManager()
      ? button("➕ Thêm món", "add-product", "primary")
      : ""
  ) + `

    <div class="card">

      <div class="data-toolbar">

        <input
          type="search"
          id="menuSearch"
          class="input"
          placeholder="🔍 Tìm kiếm sản phẩm..."
          style="max-width:300px">

        <select id="menuCategory" class="input">
          <option value="">Tất cả danh mục</option>

          ${sqlCategories.map(category => `
            <option
              value="${escapeHTML(category.category_id)}">
              ${escapeHTML(category.category_name)}
            </option>
          `).join("")}
        </select>

      </div>

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

          <tbody id="menuProductRows">
            ${rows}
          </tbody>

        </table>
      </div>

    </div>
  `;
}

// TIM KIEM VA LOC SAN PHAM
function filterMenuProducts() {
  const search = (
    document.getElementById("menuSearch")?.value || ""
  ).trim().toLowerCase();

  const category =
    document.getElementById("menuCategory")?.value || "";

  const rows = document.querySelectorAll(
    "#menuProductRows tr"
  );

  rows.forEach((row, index) => {
    const product = db.products[index];

    if (!product) return;

    const matchSearch =
      String(product.name).toLowerCase().includes(search) ||
      String(product.id).toLowerCase().includes(search);

    const matchCategory =
      !category || product.categoryId === category;

    row.hidden = !(matchSearch && matchCategory);
  });
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
let sqlInvoices = [];
let paymentsLoading = false;
let paymentsLoaded = false;
let paymentsError = "";

async function loadPaymentsFromSQL() {
  if (paymentsLoading) return;
  paymentsLoading = true;
  paymentsError = "";
  const token = sessionStorage.getItem(TOKEN_KEY);

  try {
    const data = await paymentAPI("");
    if (sessionStorage.getItem(TOKEN_KEY) !== token) return;
    sqlInvoices = Array.isArray(data) ? data : [];
    paymentsLoaded = true;
  } catch (error) {
    if (sessionStorage.getItem(TOKEN_KEY) === token) {
      paymentsError = error.message;
    }
  } finally {
    paymentsLoading = false;
  }
}

let paymentOrders = [];
let paymentOrdersLoading = false;
let paymentOrdersError = "";
let paymentFormOpen = false;
let paymentPreview = null;
let paymentBusy = false;

async function loadPaymentOrders() {
  if (paymentOrdersLoading) return;
  paymentOrdersLoading = true;
  paymentOrdersError = "";
  const token = sessionStorage.getItem(TOKEN_KEY);

  try {
    const data = await paymentAPI("/orders");
    if (sessionStorage.getItem(TOKEN_KEY) === token) {
      paymentOrders = Array.isArray(data) ? data : [];
    }
  } catch (error) {
    if (sessionStorage.getItem(TOKEN_KEY) === token) {
      paymentOrdersError = error.message;
      paymentOrders = [];
    }
  } finally {
    paymentOrdersLoading = false;
    render();
  }
}

function paymentAPI(path, body) {
  return apiRequest(`/payments${path}`, body ? "POST" : "GET", body ?? null);
}

function paymentItems(data) {
  return `<p>Đơn: ${escapeHTML(data.order_id)} · Bàn: ${escapeHTML(data.table_name)}</p><table><thead><tr><th>Món</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>${data.items.map(x=>`<tr><td>${escapeHTML(x.product_name)}</td><td>${Number(x.quantity)}</td><td>${money(Number(x.unit_price))}</td><td>${money(Number(x.amount))}</td></tr>`).join("")}</tbody></table><h3>Tổng: ${money(Number(data.subtotal))}</h3>`;
}
async function openPaymentPreview(id) {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const preview = await paymentAPI(`/preview/${encodeURIComponent(id)}`);
    if (sessionStorage.getItem(TOKEN_KEY) !== token) return;
    const dialog=document.createElement("dialog"); dialog.style.cssText="width:min(650px,90vw);border:0;border-radius:16px;padding:24px";
    dialog.innerHTML=`<h2>Tạm tính đơn hàng</h2>${paymentItems(preview)}<button class="btn" data-back>Quay lại</button> <button class="btn primary" data-next>Xác nhận</button>`;
    document.body.append(dialog); dialog.addEventListener("close",()=>dialog.remove());
    dialog.querySelector("[data-back]").onclick=()=>dialog.close();
    dialog.querySelector("[data-next]").onclick = () => {
      dialog.close();
      if (!canPay()) {
        paymentPreview = null;
        notify("Đã tạm tính. Thu ngân cần mở đơn ở trang Thanh toán.");
        return;
      }
      paymentPreview = preview;
      paymentFormOpen = true;
      state.page = "payments";
      render();
      void loadPaymentOrders();
    };
    dialog.showModal();
  }catch(e){notify(e.message,true);}
}
// Orders integration contract: call after SQL order has been saved.
window.openPaymentPreview = openPaymentPreview;
function createPaymentQR(amount, orderId) {
    const bank = "MB";
    const account = "012345679";
    const accountName = "MOC CAFE";
    const content = "THANH TOAN " + orderId;

    return `https://img.vietqr.io/image/${bank}-${account}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(accountName)}`;
}
function paymentOrderFormHTML() {
  if (!paymentFormOpen) return "";
  const d=paymentPreview;
  return `<div class="card" style="margin-bottom:24px"><h2>Thanh toán đơn hàng</h2>
  ${paymentOrdersError?`<p>${escapeHTML(paymentOrdersError)}</p>`:""}
  <div class="actions">${paymentOrders.map(o=>`<button class="btn" data-payment-preview="${escapeHTML(o.order_id)}">${escapeHTML(o.table_name)} · ${money(Number(o.subtotal))}</button>`).join("")}</div>
  ${paymentOrdersLoading?"Đang tải...":(!paymentOrders.length&&!d?"Chưa có bàn chờ thanh toán.":"")}
  ${d?`${paymentItems(d)}<form id="sql-payment-form"><input type="hidden" name="order_id" value="${escapeHTML(d.order_id)}"><label>Phương thức <select name="payment_method"><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option></select></label><div id="payment-cash"><label>Tiền khách đưa <input name="cash_received" type="number" min="${Number(d.subtotal)}" max="999999999999" step="1" required></label><p>Tiền trả lại: <strong id="payment-change">0 đ</strong></p></div><div id="payment-transfer" hidden><div style="text-align:center;padding:20px;">
    <h3>Quét mã QR thanh toán</h3>

    <img
        src="${createPaymentQR(Number(d.subtotal), d.order_id)}"
        alt="Mã QR thanh toán"
        style="width:250px;max-width:100%;border-radius:12px;"
    >

  
</div><label><input type="checkbox" name="transfer_confirmed"> Đã nhận đủ tiền chuyển khoản</label><label>Mã giao dịch (nếu có) <input name="transaction_reference" maxlength="100"></label></div><button class="btn primary" type="submit" ${paymentBusy?"disabled":""}>Xác nhận thanh toán</button></form>`:""}
  <button class="btn" id="close-payment-form">Quay lại</button></div>`;
}
app.addEventListener("input",e=>{
  const f=e.target.closest("#sql-payment-form"); if(!f||!paymentPreview)return;
  const cash=f.elements.payment_method.value==="cash"; f.querySelector("#payment-cash").hidden=!cash; f.querySelector("#payment-transfer").hidden=cash; f.elements.cash_received.required=cash; f.elements.cash_received.disabled=!cash; f.elements.transfer_confirmed.required=!cash;
  f.querySelector("#payment-change").textContent=money(Math.max(0,Number(f.elements.cash_received.value)-Number(paymentPreview.subtotal)));
});
async function showSQLInvoice(id) {
  try {const d=await paymentAPI("/"+encodeURIComponent(id)+"/invoice"); const dialog=document.createElement("dialog"); dialog.style.cssText="width:min(650px,90vw);border:0;border-radius:16px;padding:24px"; dialog.innerHTML=`<section><h2>MỘC Coffee – Hóa đơn ${escapeHTML(d.invoice_id)}</h2><p>${escapeHTML(new Date(d.paid_at).toLocaleString("vi-VN"))} · Thu ngân: ${escapeHTML(d.employee_name||d.username||d.employee_id||"Không rõ")}</p>${paymentItems(d)}<h3>Đã thanh toán: ${money(Number(d.total_amount))}</h3>${d.payment_method === "transfer" ? `
<div style="text-align:center;margin:20px 0;">
  <h3>Mã QR chuyển khoản</h3>

  <img
    src="${createPaymentQR(Number(d.total_amount), d.order_id)}"
    style="width:200px;max-width:100%;"
    alt="QR thanh toán"
  >

 
</div>
` : ""}<p><b>Phương thức:</b> ${
  d.payment_method === "cash" ? "Tiền mặt" :
  d.payment_method === "transfer" ? "Chuyển khoản" :
  d.payment_method === "card" ? "Thẻ ngân hàng" :
  "Không xác định"
}</p>${d.cash_received!=null?`<p>Khách đưa: ${money(Number(d.cash_received))} · Trả lại: ${money(Number(d.cash_received)-Number(d.total_amount))}</p>`:""}</section><button class="btn" data-print>In hóa đơn</button> <button class="btn" data-close>Đóng</button>`; document.body.append(dialog); dialog.addEventListener("close",()=>dialog.remove()); dialog.querySelector("[data-close]").onclick=()=>dialog.close(); dialog.querySelector("[data-print]").onclick=()=>{const w=window.open("","_blank");if(!w){notify("Hãy cho phép cửa sổ in",true);return;}w.document.write('<html><head><title>Hóa đơn</title><style>body{font:16px Arial;padding:24px}td,th{padding:8px;text-align:left}</style></head><body>'+dialog.querySelector("section").innerHTML+'</body></html>');w.document.close();w.focus();w.print();};dialog.showModal();}catch(e){notify(e.message,true);}
}
async function submitSQLPayment(form) {
  if (paymentBusy || !canPay() || !paymentPreview) return;

  const v = Object.fromEntries(new FormData(form));

  const orderId = String(paymentPreview.order_id || "").trim();

  if (!orderId) {
    notify("Không lấy được mã đơn hàng.", true);
    return;
  }

  const token = sessionStorage.getItem(TOKEN_KEY);
  paymentBusy = true;

  const button = form.querySelector('[type="submit"]');
  button.disabled = true;

  try {
    const data = await paymentAPI("", {
      order_id: orderId,
      payment_method: v.payment_method,
      discount: 0,
      expected_total: Number(paymentPreview.subtotal),
      cash_received: v.payment_method === "cash" ? Number(v.cash_received) : null,
      transfer_confirmed: v.transfer_confirmed === "on",
      transaction_reference: v.transaction_reference
    });

    if (sessionStorage.getItem(TOKEN_KEY) !== token) return;
    if (state.cartOrder?.id === orderId) {
      state.cart = [];
      state.cartOrder = null;
    }
    paymentPreview = null;
    paymentFormOpen = false;
    paymentsLoaded = false;

    await loadPaymentsFromSQL();
    await loadTablesFromSQL();
    await loadPaymentOrders();

    if (sessionStorage.getItem(TOKEN_KEY) === token) {
      notify("Thanh toán thành công");
      await showSQLInvoice(data.invoice_id);
    }

  } catch (e) {
    notify(e.message, true);
  } finally {
    paymentBusy = false;
    button.disabled = false;
  }
}
function paymentsPage() {
  const invoices = [...sqlInvoices].sort(
    (a, b) => new Date(b.paid_at) - new Date(a.paid_at)
  );

  const revenue = invoices.reduce(
    (total, invoice) => total + Number(invoice.total_amount || 0),
    0
  );

  const cashCount = invoices.filter(
    invoice => invoice.payment_method === "cash"
  ).length;

  const bankCount = invoices.filter(
    invoice => invoice.payment_method === "transfer"
  ).length;

  const rows = invoices.map(invoice => `
    <tr>
      <td><button class="btn small" data-payment-invoice="${escapeHTML(invoice.invoice_id)}">${escapeHTML(invoice.invoice_id)}</button></td>
      <td>${escapeHTML(invoice.order_id)}</td>
      <td>${escapeHTML(
  invoice.payment_method === "cash" ? "Tiền mặt" :
  invoice.payment_method === "transfer" ? "Chuyển khoản" :
  invoice.payment_method === "card" ? "Thẻ ngân hàng" :
  invoice.payment_method
)}</td>
      <td>${money(Number(invoice.total_amount))}</td>
      <td>${escapeHTML(
        new Date(invoice.paid_at).toLocaleString("vi-VN")
      )}</td>
    </tr>
  `).join("");

 return heading(
  "Thanh toán & Hóa đơn",
  "Danh sách giao dịch lấy từ SQL Server",
  `
    <button
      type="button"
      class="btn primary"
      id="open-payment-form"
    >
      💳 Thanh toán đơn hàng
    </button>
  `
) + `
${paymentOrderFormHTML()}
    <div class="grid stats">
      ${statsCard(
        "Tổng hóa đơn",
        invoices.length,
        "Giao dịch hoàn tất"
      )}

      ${statsCard(
        "Tổng doanh thu",
        money(revenue),
        "Dữ liệu SQL Server"
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

      ${paymentsError
        ? `<p style="color:red">${escapeHTML(paymentsError)}</p>`
        : ""
      }

      <button
        type="button"
        id="reload-sql-payments"
        class="btn small"
      >
        🔄 Tải lại hóa đơn
      </button>

      <table>
        <thead>
          <tr>
            <th>Mã hóa đơn</th>
            <th>Mã đơn hàng</th>
            <th>Phương thức</th>
            <th>Thành tiền</th>
            <th>Thời gian</th>
          </tr>
        </thead>

        <tbody>
          ${rows || `
            <tr>
              <td colspan="5">
                ${paymentsLoading
                  ? "Đang tải dữ liệu..."
                  : "Chưa có hóa đơn"}
              </td>
            </tr>
          `}
        </tbody>
      </table>
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
    const rows = db.staff.map(staff => `
      <tr>

        <td>
          <b>${escapeHTML(staff.name)}</b>
        </td>

        <td>${escapeHTML(staff.username)}</td>

        <td>${roleName(staff.role)}</td>

        <td>
          ${pill(
            staff.active ? "Hoạt động" : "Đã khóa",
            staff.active ? "green" : "red"
          )}
        </td>

        <td>
          <button
            type="button"
            class="btn small"
            data-edit-employee="${escapeHTML(staff.id)}">
            Chỉnh sửa
          </button>
        </td>

      </tr>
    `).join("");

    return heading(
      "Quản lý nhân viên",
      `${db.staff.length} nhân viên trong hệ thống`,
      button(
        "➕ Thêm nhân viên",
        "add-employee",
        "primary"
      )
    ) + `

      <div class="card">

        <div class="table-wrap">

          <table>

            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Tài khoản</th>
                <th>Vai trò</th>
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

async function openProductModal(id = null) {
  try {
    await loadCategoriesFromSQL();
    openModal("product", id);
  } catch (error) {
    notify(error.message, true);
  }
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

    if (modal.type === "change-password") {
        if (!currentUser()) return "";

        title = "Đổi mật khẩu";
        content = `
            <form id="changePasswordForm">
                <div class="field">
                    <label for="currentPassword">Mật khẩu hiện tại</label>
                    <input id="currentPassword" name="currentPassword" type="password"
                           autocomplete="current-password" required>
                </div>
                <div class="field">
                    <label for="newPassword">Mật khẩu mới</label>
                    <input id="newPassword" name="newPassword" type="password"
                           autocomplete="new-password" minlength="12" maxlength="72" required>
                </div>
                <div class="field">
                    <label for="confirmNewPassword">Nhập lại mật khẩu mới</label>
                    <input id="confirmNewPassword" name="confirmPassword" type="password"
                           autocomplete="new-password" required>
                </div>
                ${formButtons("Lưu mật khẩu")}
            </form>
        `;
    }

    // POPUP TAO TAI KHOAN - CHI ADMIN
    if (modal.type === "account") {
        if (!isAdmin()) return "";

        title = "Tạo tài khoản mới";

        content = `
            <form id="accountForm">

                <div class="field">
                    <label>Tên đăng nhập</label>
                    <input
                        name="username"
                        type="text"
                        minlength="3"
                        maxlength="50"
                        pattern="[A-Za-z0-9_]+"
                        autocomplete="off"
                        placeholder="Ví dụ: nhanvien05"
                        required>
                </div>

                <div class="field">
                    <label>Mật khẩu</label>
                    <input
                        name="password"
                        type="password"
                        minlength="12"
                        maxlength="72"
                        autocomplete="new-password"
                        placeholder="Ít nhất 12 ký tự"
                        required>
                </div>

                <div class="field">
                    <label>Phân quyền</label>
                    <select name="role" required>
                        <option value="">-- Chọn quyền --</option>
                        <option value="waiter">Nhân viên phục vụ</option>
                        <option value="cashier">Thu ngân</option>
                        <option value="inventory">Nhân viên kho</option>
                        <option value="product_manager">Quản lý sản phẩm</option>
<option value="hr_manager">Quản lý nhân sự</option>
                    </select>
                </div>

                <div class="field">
                    <label>Mã nhân viên (không bắt buộc)</label>
                    <input
                        name="employee_id"
                        type="text"
                        maxlength="10"
                        placeholder="Ví dụ: NV02">
                </div>

                ${formButtons("Tạo tài khoản")}

            </form>
        `;
    }

    if (modal.type === "account-reset-password") {
        if (!isAdmin()) return "";

        const account = accountList.find(item => item.user_id === modal.id);
        if (!account || account.role === "admin") return "";

        title = "Đặt lại mật khẩu";
        content = `
            <form id="accountResetPasswordForm">
                <div class="field">
                    <label for="resetAccountUsername">Tên đăng nhập</label>
                    <input id="resetAccountUsername" value="${escapeHTML(account.username)}" readonly>
                </div>
                <div class="field">
                    <label for="resetAccountPassword">Mật khẩu mới</label>
                    <input id="resetAccountPassword" name="password" type="password"
                           minlength="12" maxlength="72" autocomplete="new-password" required>
                </div>
                <div class="field">
                    <label for="resetAccountConfirmation">Nhập lại mật khẩu mới</label>
                    <input id="resetAccountConfirmation" name="confirmPassword" type="password"
                           autocomplete="new-password" required>
                </div>
                ${formButtons("Lưu mật khẩu")}
            </form>
        `;
    }

    // POPUP DOI QUYEN TAI KHOAN
    if (modal.type === "account-role") {
        if (!isAdmin()) return "";

        const account = accountList.find(
            item => item.user_id === modal.id
        );

        if (!account || account.role === "admin") {
            return "";
        }

        const roleNames = {
    waiter: "Nhân viên phục vụ",
    cashier: "Thu ngân",
    inventory: "Nhân viên kho",
    product_manager: "Quản lý sản phẩm",
    hr_manager: "Quản lý nhân sự"
};

        const currentRole = ({
            phucvu: "waiter",
            thungan: "cashier",
            kho: "inventory"
        })[account.role] || account.role;

        title = "Thay đổi quyền tài khoản";

        const roleOptions = Object.entries(roleNames)
            .map(([value, label]) => `
                <option
                    value="${value}"
                    ${currentRole === value ? "selected" : ""}>
                    ${label}
                </option>
            `).join("");

        content = `
            <form id="accountRoleForm">
                <div class="field">
                    <label>Tên đăng nhập</label>
                    <input
                        type="text"
                        value="${String(account.username).replace(/[&<>"']/g, c => ({
                            "&": "&amp;",
                            "<": "&lt;",
                            ">": "&gt;",
                            '"': "&quot;",
                            "'": "&#39;"
                        })[c])}"
                        disabled>
                </div>

                <div class="field">
                    <label>Quyền mới</label>
                    <select name="role" required>
                        ${roleOptions}
                    </select>
                </div>

                ${formButtons("Lưu quyền")}
            </form>
        `;
    }

    if (modal.type === "table") {
      title = "Thêm bàn mới";

      content = `
        <form id="tableForm">
          <div class="field">
            <label>Mã bàn</label>
            <input
              name="table_id"
              maxlength="10"
              placeholder="Ví dụ: B14"
              required>
          </div>

          <div class="field">
            <label>Tên bàn</label>
            <input
              name="table_name"
              maxlength="100"
              placeholder="Ví dụ: Bàn VIP 14"
              required>
          </div>




          ${formButtons("Lưu bàn")}
        </form>
      `;
    }

    // POPUP SUA BAN
    if (modal.type === "edit-table") {
      const table = db.tables.find(
        item => item.id === modal.tableId
      );

      if (!table) return "";

      title = "Sửa thông tin bàn";

      content = `
        <form id="editTableForm">
          <div class="field">
            <label>Mã bàn</label>
            <input
              name="table_id"
              maxlength="10"
              value="${escapeHTML(table.id)}"
              required>
          </div>

          <div class="field">
            <label>Tên bàn</label>
            <input
              name="table_name"
              maxlength="100"
              value="${escapeHTML(table.name)}"
              required>
          </div>




          ${formButtons("Lưu thay đổi")}
        </form>
      `;
    }

    // POPUP DOI TRANG THAI BAN
    if (modal.type === "status-table") {
      const table = db.tables.find(
        item => item.id === modal.tableId
      );

      if (!table) return "";

      title = "Đổi trạng thái bàn " + table.id;

      content = `
        <form id="statusTableForm">
          <div class="field">
            <label>Trạng thái bàn</label>

            <select name="status" required>
              <option value="available" ${table.status === "available" ? "selected" : ""}>
                Bàn trống
              </option>


              <option value="reserved" ${table.status === "reserved" ? "selected" : ""}>
                Đã đặt trước
              </option>

              <option value="maintenance" ${table.status === "maintenance" ? "selected" : ""}>
                Đang bảo trì
              </option>
            </select>
          </div>

          ${formButtons("Lưu trạng thái")}
        </form>
      `;
    }




   // THEM / SUA MON
if (modal.type === "product") {
  const product = db.products.find(
    item => item.id === modal.id
  ) || {
    id: "",
    name: "",
    categoryId: "",
    category: "",
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
        <label>Mã sản phẩm</label>
        <input
          name="product_id"
          maxlength="10"
          required
          value="${escapeHTML(product.id || "")}"
          ${modal.id ? "readonly" : ""}
        >
      </div>

      <div class="field">
        <label>Tên sản phẩm</label>
        <input
          type="text"
          name="name"
          placeholder="Ví dụ: Nước dừa tươi"
          required
          value="${escapeHTML(product.name || "")}"
        >
      </div>
          <div class="field">
            <label>Danh mục</label>

            
<select name="category" required>
  ${sqlCategories
    .filter(c => c.is_active || c.category_id === product.categoryId)
    .map(c => `
      <option
        value="${escapeHTML(c.category_id)}"
        ${product.categoryId === c.category_id ? "selected" : ""}>
        ${escapeHTML(c.category_name)}
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
  <label>Đường dẫn hình ảnh</label>
  <input
    type="url"
    name="image_url"
    maxlength="1000"
    placeholder="Nhập đường dẫn hình ảnh"
    value="${escapeHTML(product.imageUrl || "")}">
</div>

<div class="field">
  <label>Mô tả sản phẩm</label>
  <textarea
    name="description"
    maxlength="500"
    rows="3"
    placeholder="Nhập mô tả sản phẩm..."
  >${escapeHTML(product.description || "")}</textarea>
</div>

<div class="field">
  <label for="product-status">Trạng thái</label>
  <select id="product-status" name="is_available">
    <option value="1" ${product.available !== false ? "selected" : ""}>
      Đang bán
    </option>
    <option value="0" ${product.available === false ? "selected" : ""}>
      Ngừng bán
    </option>
  </select>
</div>

          <div class="modal-actions">
  ${modal.id && isAdmin() ? `
    <button type="button" class="btn product-delete-button"
      data-product-delete-open>
      Xóa món
    </button>
  ` : ""}

  <button type="button" class="btn" data-action="close-modal">
    Hủy
  </button>
  <button type="submit" class="btn primary">
    Lưu món
  </button>
</div>

${modal.id && isAdmin() ? `
  <dialog class="product-delete-dialog" aria-labelledby="product-delete-title">
    <h2 id="product-delete-title">Xác nhận xóa món</h2>
    <p>Bạn có chắc muốn xóa món <strong>${escapeHTML(product.name)}</strong>?</p>

    <div class="modal-actions">
      <button type="button" class="btn" data-product-delete-cancel autofocus>
        Hủy
      </button>
      <button type="button" class="btn product-delete-confirm"
        data-product-delete-confirm>
        Xác nhận xóa
      </button>
    </div>
  </dialog>
` : ""}

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
      const staff = db.staff.find(
        item => item.id === modal.id
      ) || {
        name: "",
        username: "",
        role: "service",
        active: true
      };

      title = modal.id
        ? "Chỉnh sửa nhân viên"
        : "Thêm nhân viên";

      content = `
        <form id="employeeForm">

          <div class="field">
            <label>Họ tên</label>

            <input
              name="name"
              required
              value="${escapeHTML(staff.name)}">
          </div>

          <div class="field">
            <label>Tên đăng nhập</label>

            <input
              name="username"
              required
              value="${escapeHTML(staff.username)}">
          </div>

          <div class="field">

            <label>
              Mật khẩu
              ${modal.id
                ? "(để trống nếu không thay đổi)"
                : ""}
            </label>

            <input
              name="password"
              type="password"
              autocomplete="new-password"
              ${modal.id ? "" : "required"}>
          </div>

          <div class="field">
            <label>Vai trò</label>

            <select name="role">

              ${Object.keys(permissions).map(role => `
                <option
                  value="${role}"
                  ${staff.role === role ? "selected" : ""}>

                  ${roleName(role)}

                </option>
              `).join("")}

            </select>
          </div>

          <div class="field">
            <label>Trạng thái</label>

            <select name="active">

              <option
                value="1"
                ${staff.active ? "selected" : ""}>
                Hoạt động
              </option>

              <option
                value="0"
                ${!staff.active ? "selected" : ""}>
                Khóa
              </option>

            </select>
          </div>

          <p class="muted">
            Chức năng này hiện quản lý dữ liệu demo.
            Tài khoản SQL Server cần được tạo qua backend.
          </p>

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

  // Tự động lấy hóa đơn từ SQL Server khi mở trang Thanh toán
  if (state.page === "payments" && !paymentsLoaded && !paymentsLoading && !paymentsError) {
    loadPaymentsFromSQL().then(() => {
      if (state.page === "payments") {
        render();
      }
    });
  }
}

  // =====================================================
  // 21. XU LY SU KIEN CLICK
  // =====================================================

  app.addEventListener("click", async event => {
 const previewButton=event.target.closest("[data-payment-preview]"); if(previewButton){openPaymentPreview(previewButton.dataset.paymentPreview);return;}
 const invoiceButton=event.target.closest("[data-payment-invoice]"); if(invoiceButton){showSQLInvoice(invoiceButton.dataset.paymentInvoice);return;}
 if(event.target.closest("#reload-sql-payments")){paymentsLoaded=false;loadPaymentsFromSQL().then(render);return;}
 if (event.target.closest("#open-payment-form")) {
  paymentFormOpen = true;
  render();
  loadPaymentOrders();
  return;
}

if (event.target.closest("#close-payment-form")) {
  paymentFormOpen = false;
  paymentPreview = null;
  render();
  return;
}
  const deleteControl = event.target.closest(
  "[data-product-delete-open], [data-product-delete-cancel], [data-product-delete-confirm]"
);

if (deleteControl) {
  const dialog = deleteControl.closest("#productForm")
    ?.querySelector(".product-delete-dialog");

  if (!dialog || !isAdmin()) return;

  if (deleteControl.hasAttribute("data-product-delete-open")) {
    dialog.showModal();
  } else if (deleteControl.hasAttribute("data-product-delete-cancel")) {
    dialog.close();
  } else {
  const productId = state.modal?.id;
  if (!productId || deleteControl.disabled) return;

  deleteControl.disabled = true;

  try {
    await productRequest("DELETE", `/${encodeURIComponent(productId)}`);
  } catch (error) {
    dialog.close();
    deleteControl.disabled = false;
    notify(error.message || "Không thể xóa món.", true);
    return;
  }

  dialog.close();
  state.modal = null;
  db.products = db.products.filter(product => product.id !== productId);
  render();
  notify("Đã xóa món.");
}

  return;
}

    // MO POPUP THEM BAN
    const addTableButton = event.target.closest(
      '[data-action="add-table"]'
    );

    if (addTableButton) {
      if (!checkTableAdmin()) return;

      openModal("table");
      return;
    }


    const target = event.target.closest(
      "[data-action], [data-page], [data-table], " +
      "[data-edit-table], [data-status-table], [data-delete-table], " +
      "[data-cat], [data-prod], [data-qty], " +
      "[data-edit-product], [data-stop-product], [data-resume-product], [data-stock], " +
      "[data-edit-employee], [data-period]"
    );


    if (!target) return;

    // XOA VINH VIEN BAN TRONG SQL SERVER
    if (target.dataset.deleteTable) {
      if (!checkTableAdmin()) return;

      const tableId = target.dataset.deleteTable;

      const table = db.tables.find(
        item => item.id === tableId
      );

      if (!table) {
        notify("Không tìm thấy bàn!", true);
        return;
      }

      // Khong cho xoa ban dang phuc vu
      if (
        table.status === "occupied" ||
        getOpenOrder(tableId)
      ) {
        notify("Không thể xóa bàn đang phục vụ!", true);
        return;
      }

      const confirmed = confirm(
        `Bạn có chắc muốn xóa ${table.name || table.id} không?`
      );

      if (!confirmed) return;

      try {
        const response = await fetch(
          `${API_URL}/tables/${encodeURIComponent(tableId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ""}` }
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Không thể xóa bàn."
          );
        }

        await loadTablesFromSQL();

        notify("Xóa bàn thành công!");

      } catch (error) {
        console.error("Lỗi xóa bàn:", error);
        notify(error.message, true);
      }

      return;
    }


    // MO POPUP DOI TRANG THAI BAN
    if (target.dataset.statusTable) {
      if (!checkTableAdmin()) return;

      const table = db.tables.find(
        item => item.id === target.dataset.statusTable
      );

      if (!table) {
        notify("Không tìm thấy bàn!", true);
        return;
      }

      state.modal = {
        type: "status-table",
        tableId: table.id
      };

      render();
      return;
    }


    // MO POPUP SUA BAN
    if (target.dataset.editTable) {
      if (!checkTableAdmin()) return;

      const table = db.tables.find(
        item => item.id === target.dataset.editTable
      );

      if (!table) {
        alert("Không tìm thấy bàn cần sửa!");
        return;
      }

      state.modal = {
        type: "edit-table",
        tableId: table.id
      };

      render();
      return;
    }


    // CHUYEN TRANG
    if (target.dataset.page) {
      changePage(target.dataset.page);
      return;
    }

    // CHON BAN
    if (target.dataset.table) {
      await selectOrderTable(target.dataset.table);
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
      if (state.savingOrder) return;
      if (!checkOrderPermission()) return;

      
const product = db.products.find(
  item =>
    item.id === target.dataset.prod &&
    item.active &&
    item.available === true &&
    sqlCategories.some(category =>
      category.category_id === item.categoryId &&
      category.is_active
    )
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
      if (state.savingOrder) return;
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
    // ==========================================
    // CHINH SUA SAN PHAM
    // ==========================================
    if (target.dataset.editProduct) {
      if (!checkManager()) return;

      await openProductModal(
        target.dataset.editProduct
      );

      return;
    }

    // ==========================================
    // NGUNG BAN SAN PHAM
    // ==========================================
  if (target.dataset.stopProduct !== undefined) {
       if (!checkManager()) return;

  const id = target.dataset.stopProduct;

  if (!confirm("Bạn có chắc muốn ngừng bán món này?")) {
    return;
  }

  try {
    target.disabled = true;

    await stopProductInSQL(id);

    notify("Đã ngừng bán sản phẩm!");

  } catch (error) {
    console.error(error);
    notify(error.message, true);

  } finally {
    target.disabled = false;
  }

  return;
}

// MO BAN TRO LAI
if (target.dataset.resumeProduct !== undefined) {
  if (!checkManager()) return;

  const id = target.dataset.resumeProduct;

  if (!confirm("Bạn muốn mở bán lại món này?")) {
    return;
  }

  try {
    target.disabled = true;

    await resumeProductInSQL(id);

    notify("Đã mở bán lại sản phẩm!");

  } catch (error) {
    console.error(error);
    notify(error.message, true);

  } finally {
    target.disabled = false;
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

      case "change-password":
        if (currentUser()) openModal("change-password");
        break;

            case "logout": {
        const token = sessionStorage.getItem(TOKEN_KEY);

        if (target.disabled) break;
        target.disabled = true;

        try {
          if (token) {
            const response = await fetch(`${API_URL}/auth/logout`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`
              }
            });

            // 401 nghĩa là phiên hiện tại đã không còn hợp lệ.
            if (!response.ok && response.status !== 401) {
              throw new Error("Không thể kết thúc phiên đăng nhập.");
            }
          }

          clearSession();
          sqlInvoices = [];
          paymentsLoaded = false;
          paymentsError = "";
          paymentPreview = null;
          paymentOrders = [];
          paymentOrdersError = "";
          paymentFormOpen = false;
          state.page = "dashboard";
          state.modal = null;
          state.cart = [];
          state.cartOrder = null;

          render();
          notify("Đã đăng xuất thành công!");
        } catch {
          notify("Không thể đăng xuất. Vui lòng thử lại.", true);
        } finally {
          target.disabled = false;
        }

        break;
      }

      case "new-order": {
        if (!checkOrderPermission() || !(await loadTablesFromSQL())) return;
        const table = db.tables.find(item => item.status === "available" && !getOpenOrder(item.id));
        if (!table) {
          notify("Không có bàn trống để tạo đơn mới.", true);
          return;
        }

        await selectOrderTable(table.id);
        break;
      }

case "save-order":
    if (await saveOrder()) {
        render();
        notify("Đã lưu đơn hàng thành công");
    }
    break;


      case "open-pay": {
        const order = getOpenOrder(state.tableId);
        if (!order || state.cartOrder?.id !== order.id) {
          notify("Hãy lưu đơn trước khi tạm tính.", true);
          break;
        }
        const savedItems = state.cartOrder.items;
        if (state.cart.length !== savedItems.size ||
            state.cart.some(item => savedItems.get(item.detailId) !== item.qty)) {
          notify("Hãy lưu thay đổi của đơn trước khi tạm tính.", true);
          break;
        }
        await openPaymentPreview(order.id);
        break;
      }

      case "transfer-table":
        await performTableAction("transfer");
        break;

      case "merge-table":
        await performTableAction("merge");
        break;

     case "add-product":
  if (checkManager()) {
     await openProductModal();
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


case "add-account": {
    if (!isAdmin()) {
        notify("Chi Admin moi duoc tao tai khoan.", true);
        break;
    }

    openModal("account");
    break;
}


case "change-account-role": {
    if (!isAdmin()) {
        notify("Chi Admin moi duoc doi quyen.", true);
        break;
    }

    const accountId = target.dataset.accountId;

    const account = accountList.find(
        item => item.user_id === accountId
    );

    if (!account || account.role === "admin") {
        notify("Khong the thay doi quyen tai khoan nay.", true);
        break;
    }

    openModal("account-role", accountId);
    break;
}

case "reset-account-password": {
    if (!isAdmin()) break;

    const account = accountList.find(item => item.user_id === target.dataset.accountId);
    if (!account || account.role === "admin") break;

    openModal("account-reset-password", account.user_id);
    break;
}

case "toggle-account-status": {
    if (!isAdmin()) {
        notify("Chi Admin moi duoc khoa tai khoan.", true);
        break;
    }

    const accountId = target.dataset.accountId;

    const account = accountList.find(
        item => item.user_id === accountId
    );

    if (!account || account.role === "admin") {
        notify("Khong the thay doi tai khoan nay.", true);
        break;
    }

    const newStatus = !Boolean(account.is_active);

    const actionName = newStatus ? "mo khoa" : "khoa";

    if (!confirm(
        `Ban co chac muon ${actionName} tai khoan ${account.username}?`
    )) {
        break;
    }

    const token = sessionStorage.getItem(TOKEN_KEY);

    if (!token) {
        notify("Phien dang nhap da het han.", true);
        break;
    }

    // Chan bam nhieu lan trong khi dang xu ly
    const actionButton = target;
    actionButton.disabled = true;

    try {
        const response = await fetch(
            `${API_URL}/accounts/${encodeURIComponent(accountId)}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    is_active: newStatus
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Khong the cap nhat trang thai."
            );
        }

        await loadAccountsFromSQL();

        notify(
            newStatus
                ? "Mo khoa tai khoan thanh cong!"
                : "Khoa tai khoan thanh cong!"
        );

    } catch (error) {
        console.error("Loi khoa/mo khoa tai khoan:", error);
        notify(error.message, true);

    } finally {
        if (actionButton.isConnected) {
            actionButton.disabled = false;
        }
    }

    break;
}

case "refresh-accounts":
    if (!isAdmin()) {
        notify("Chi Admin duoc xem danh sach tai khoan.", true);
        break;
    }

    loadAccountsFromSQL();
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

 app.addEventListener("input", event => {
  if (event.target.id === "menuSearch") {
    filterMenuProducts();
  }
});

app.addEventListener("change", async event => {
  if (event.target.id === "tableSelect") {
    await selectOrderTable(event.target.value);
    return;
  }

  if (event.target.id === "menuCategory") {
    filterMenuProducts();
  }
});

  // =====================================================
  // 23. XU LY FORM
  // =====================================================

  app.addEventListener("submit", async event => {
    if (event.target.id === "sql-payment-form") {
      event.preventDefault();
      await submitSQLPayment(event.target);
      return;
    }

    // LUU TRANG THAI BAN VAO SQL SERVER
    if (event.target.id === "statusTableForm") {
      event.preventDefault();

      if (!checkTableAdmin()) return;

      const tableId = state.modal?.tableId;

      if (!tableId) {
        notify("Không tìm thấy mã bàn!", true);
        return;
      }

      const formData = new FormData(event.target);
      const status = String(formData.get("status") || "");

      const validStatuses = [
        "available", "reserved", "maintenance"
      ];

      if (!validStatuses.includes(status)) {
        notify("Trạng thái bàn không hợp lệ!", true);
        return;
      }

      try {
        const response = await fetch(
          `${API_URL}/tables/${encodeURIComponent(tableId)}/status`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ""}`
            },
            body: JSON.stringify({ status })
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Không thể đổi trạng thái bàn."
          );
        }

        state.modal = null;

        await loadTablesFromSQL();

        notify("Đổi trạng thái bàn thành công!");

      } catch (error) {
        console.error("Lỗi đổi trạng thái bàn:", error);
        notify(error.message, true);
      }

      return;
    }


    // SUA THONG TIN BAN TRONG SQL SERVER
    if (event.target.id === "editTableForm") {
      event.preventDefault();

      if (!checkTableAdmin()) return;

      const tableId = state.modal?.tableId;

      if (!tableId) {
        alert("Không tìm thấy mã bàn cần sửa!");
        return;
      }

      const formData = new FormData(event.target);

      const table_id = String(formData.get("table_id") || "").trim().toUpperCase();

      const table_name = String(
        formData.get("table_name") || ""
      ).trim();

      const currentTable = db.tables.find(item => item.id === tableId);
      const seats = Number(currentTable?.seats) > 0 ? Number(currentTable.seats) : 4;

      if (
        !table_id ||
        table_id.length > 10 ||
        !table_name ||
        table_name.length > 100 ||
        !Number.isInteger(seats) ||
        seats <= 0
      ) {
        alert("Tên bàn hoặc số ghế không hợp lệ!");
        return;
      }

      try {
        const response = await fetch(
          `${API_URL}/tables/${encodeURIComponent(tableId)}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ""}`
            },
            body: JSON.stringify({
              table_id,
              table_name,
              seats
            })
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Không thể sửa bàn."
          );
        }

        state.modal = null;

        await loadTablesFromSQL();

        alert("Cập nhật bàn thành công!");

      } catch (error) {
        console.error("Lỗi sửa bàn:", error);
        alert(error.message);
      }

      return;
    }


    // THEM BAN VAO SQL SERVER
    if (event.target.id === "tableForm") {
      event.preventDefault();

      if (!checkTableAdmin()) return;

      const form = event.target;
      const formData = new FormData(form);

      const table_id = String(
        formData.get("table_id") || ""
      ).trim().toUpperCase();

      const table_name = String(
        formData.get("table_name") || ""
      ).trim();

      const seats = 4; // Mặc định 4 ghế, không hiển thị trên giao diện.

      if (
        !table_id ||
        table_id.length > 10 ||
        !table_name ||
        table_name.length > 100 ||
        !Number.isInteger(seats) ||
        seats <= 0
      ) {
        notify("Thông tin bàn không hợp lệ.", true);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/tables`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ""}`
          },
          body: JSON.stringify({
            table_id,
            table_name,
            seats
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Không thể thêm bàn."
          );
        }

        state.modal = null;

        await loadTablesFromSQL();

        notify("Thêm bàn thành công!");

      } catch (error) {
        console.error("Lỗi thêm bàn:", error);
        notify(error.message, true);
      }

      return;
    }

    const form = event.target;

    if (!(form instanceof HTMLFormElement)) return;

    event.preventDefault();

    const values = Object.fromEntries(
      new FormData(form).entries()
    );

    // DANG NHAP
    if (form.id === "loginForm") {
      const username = String(values.username || "").trim();
      const password = String(values.password || "");
      const errorElement = form.querySelector("#loginError");
      const submitButton = form.querySelector(
        'button[type="submit"]'
      );

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
          ? "Không kết nối được backend."
          : error.message;

        if (errorElement) {
          errorElement.textContent = message;
          errorElement.style.display = "block";
        }

        notify(message, true);
      } finally {
        if (submitButton && submitButton.isConnected) {
          submitButton.disabled = false;
          submitButton.textContent = "Đăng nhập →";
        }
      }

      return;
    }

    if (!currentUser()) {
      notify("Vui lòng đăng nhập trước.", true);
      return;
    }

    
    // ADMIN TAO TAI KHOAN MOI
    if (form.id === "accountForm") {
      if (!isAdmin()) {
        notify("Chi Admin duoc tao tai khoan.", true);
        return;
      }

      const token = sessionStorage.getItem(TOKEN_KEY);

      if (!token) {
        notify("Phien dang nhap da het. Hay dang nhap lai.", true);
        return;
      }

      const username = String(values.username || "").trim();
      const password = String(values.password || "");
      const role = String(values.role || "");
      const employee_id = String(values.employee_id || "").trim();

      if (!/^[A-Za-z0-9_]{3,50}$/.test(username)) {
        notify("Ten dang nhap phai co 3-50 ky tu.", true);
        return;
      }

      if (password.length < 12 || password.length > 72) {
        notify("Mat khau phai co 12-72 ky tu.", true);
        return;
      }

      if (!["waiter", "cashier", "inventory", "product_manager", "hr_manager"].includes(role)) {
        notify("Vui long chon quyen hop le.", true);
        return;
      }

      const submitButton = form.querySelector(
        'button[type="submit"]'
      );

      if (submitButton) submitButton.disabled = true;

      try {
        const response = await fetch(`${API_URL}/accounts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            username,
            password,
            role,
            employee_id: employee_id || null
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Khong the tao tai khoan."
          );
        }

        state.modal = null;
        render();

        notify("Tao tai khoan thanh cong: " + username);

      } catch (error) {
        console.error("Loi tao tai khoan:", error);
        notify(error.message, true);

      } finally {
        if (submitButton && submitButton.isConnected) {
          submitButton.disabled = false;
        }
      }

      return;
    }

    if (form.id === "changePasswordForm") {
        const token = sessionStorage.getItem(TOKEN_KEY);
        if (!token) {
            notify("Phiên đăng nhập đã hết hạn.", true);
            return;
        }

        const { currentPassword, newPassword, confirmPassword } = values;

        if (newPassword !== confirmPassword) {
            notify("Hai mật khẩu mới không khớp.", true);
            return;
        }

        if (newPassword.length < 12 || new TextEncoder().encode(newPassword).length > 72) {
            notify("Mật khẩu mới cần ít nhất 12 ký tự và tối đa 72 byte.", true);
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton.disabled) return;
        submitButton.disabled = true;

        try {
            const response = await fetch(`${API_URL}/auth/change-password`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || "Không thể đổi mật khẩu.");
            }

            if (sessionStorage.getItem(TOKEN_KEY) === token) {
                clearSession();
                state.page = "dashboard";
                state.modal = null;
                state.cart = [];
                render();
                notify("Đổi mật khẩu thành công. Hãy đăng nhập lại.");
            }
        } catch (error) {
            notify(error.message || "Không thể đổi mật khẩu.", true);
        } finally {
            submitButton.disabled = false;
        }

        return;
    }

    if (form.id === "accountResetPasswordForm") {
        const accountId = state.modal?.id;
        const token = sessionStorage.getItem(TOKEN_KEY);

        if (!isAdmin() || !accountId || !token) {
            notify("Bạn cần đăng nhập bằng tài khoản Admin.", true);
            return;
        }

        const password = String(values.password || "");
        if (password !== values.confirmPassword) {
            notify("Hai mật khẩu không khớp.", true);
            return;
        }

        if (password.length < 12 || new TextEncoder().encode(password).length > 72) {
            notify("Mật khẩu cần ít nhất 12 ký tự và tối đa 72 byte.", true);
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton.disabled) return;
        submitButton.disabled = true;

        try {
            const response = await fetch(
                `${API_URL}/accounts/${encodeURIComponent(accountId)}/reset-password`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({ password })
                }
            );

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || "Không thể đặt lại mật khẩu.");
            }

            if (form.isConnected) {
                state.modal = null;
                render();
            }

            notify("Đặt lại mật khẩu thành công.");
        } catch (error) {
            notify(error.message || "Không thể đặt lại mật khẩu.", true);
        } finally {
            submitButton.disabled = false;
        }

        return;
    }

    // ADMIN THAY DOI QUYEN TAI KHOAN
    if (form.id === "accountRoleForm") {
        if (!isAdmin()) {
            notify("Chi Admin moi duoc doi quyen.", true);
            return;
        }

        const accountId = state.modal?.id;
        const newRole = String(values.role || "");

        const allowedRoles = ["waiter", "cashier", "inventory", "product_manager", "hr_manager"];

        if (!accountId || !allowedRoles.includes(newRole)) {
            notify("Thong tin phan quyen khong hop le.", true);
            return;
        }

        const token = sessionStorage.getItem(TOKEN_KEY);

        if (!token) {
            notify("Phien dang nhap da het han.", true);
            return;
        }

        const submitButton = form.querySelector(
            'button[type="submit"]'
        );

        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            const response = await fetch(
                `${API_URL}/accounts/${encodeURIComponent(accountId)}/role`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        role: newRole
                    })
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error || "Khong the thay doi quyen."
                );
            }

            state.modal = null;

            await loadAccountsFromSQL();

            render();

            notify("Cap nhat quyen tai khoan thanh cong!");

        } catch (error) {
            console.error("Loi thay doi quyen:", error);
            notify(error.message, true);

        } finally {
            if (submitButton && submitButton.isConnected) {
                submitButton.disabled = false;
            }
        }

        return;
    }


    // -----------------------------------------
    // THEM / SUA MON
    // -----------------------------------------

    if (form.id === "productForm") {
      if (!checkManager()) return;

      const id = state.modal?.id || null;
      const productId = String(
        values.product_id || ""
      ).trim();
      const productName = String(
        values.name || ""
      ).trim();
      const categoryId = String(
        values.category || ""
      ).trim();
      const price = Number(values.price);

      if (
        !productId ||
        !productName ||
        !categoryId ||
        !Number.isSafeInteger(price) ||
        price < 0
      ) {
        notify("Thông tin sản phẩm không hợp lệ.", true);
        return;
      }

      
const payload = {
  product_id: productId,
  product_name: productName,
  category_id: categoryId,

  price: price,

  image_url: String(
    values.image_url || ""
  ).trim() || null,

  description: String(
    values.description || ""
  ).trim() || null,

  
  is_available: values.is_available === "1"
};

      const submit = form.querySelector(
        '[type="submit"]'
      );

      try {
        if (submit) submit.disabled = true;

        if (id) {
          await updateProductToSQL(id, payload);
        } else {
          await addProductToSQL(payload);
        }

        state.modal = null;
        render();
        notify("Đã lưu sản phẩm vào SQL Server!");
      } catch (error) {
        notify(error.message, true);
        if (submit) submit.disabled = false;
      }

      return;
    }

    // NHAP / XUAT KHO
    if (form.id === "stockForm") {
      if (!canManageStock()) {
        notify("Không có quyền quản lý kho.", true);
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
        notify("Số lượng không hợp lệ.", true);
        return;
      }

      if (
        values.operation !== "in" &&
        values.operation !== "out"
      ) {
        notify("Thao tác kho không hợp lệ.", true);
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

    // THEM NGUYEN LIEU
    if (form.id === "materialForm") {
      if (!checkManager()) return;

      const name = String(values.name || "").trim();
      const unit = String(values.unit || "").trim();
      const stock = Number(values.stock);
      const minimum = Number(values.minimum);

      if (
        !name ||
        !unit ||
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
        name,
        unit,
        stock,
        minimum
      });

      saveDatabase();
      state.modal = null;
      render();

      notify("Đã thêm nguyên liệu.");
      return;
    }

    // THEM / SUA NHAN VIEN DEMO
    if (form.id === "employeeForm") {
      if (!checkManager()) return;

      const staff = db.staff.find(
        item => item.id === state.modal?.id
      );

      const username = String(
        values.username || ""
      ).trim();

      const name = String(
        values.name || ""
      ).trim();

      if (
        !name ||
        !username ||
        (!staff && !values.password)
      ) {
        notify(
          "Vui lòng nhập đầy đủ thông tin nhân viên.",
          true
        );
        return;
      }

      const usernameExists = db.staff.some(
        item =>
          item.username === username &&
          item.id !== staff?.id
      );

      if (usernameExists) {
        notify("Tên đăng nhập đã tồn tại.", true);
        return;
      }

      const data = {
        name,
        username,
        role: values.role,
        active: values.active === "1"
      };

      if (staff) {
        Object.assign(staff, data);
      } else {
        db.staff.push({
          id: createId("NV"),
          ...data
        });
      }

      saveDatabase();
      state.modal = null;
      render();

      notify(
        "Đã lưu nhân viên demo. " +
        "Tài khoản SQL Server chưa thay đổi."
      );

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

  render();
  db.products = [];
  restoreSession();
  console.log(
    "MOC Coffee POS - Frontend initialized."
  );

})();
