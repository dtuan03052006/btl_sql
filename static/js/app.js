// =====================================================================
// RestaurantOS - Core Frontend Application Logic
// =====================================================================

const API_BASE = '/api';

// State
let currentBranch = 'ALL';
let activeView = 'dashboard';
let activeCrudEntity = 'chinhanh';
let crudDataCache = [];
let branchesList = [];
let categoriesList = [];
let dishesList = [];
let ingredientsList = [];
let tablesList = [];
let menuList = [];
let orderModalSelectedItems = {};
let currentCheckoutOrder = null;
let currentDeleteCallback = null;
let currentEditingIndex = null;
let currentEditingRow = null;
let branchRevenueChart = null;
let tableStatusChart = null;

// =====================================================================
// 1. INITIALIZATION & ROUTING
// =====================================================================

document.addEventListener('DOMContentLoaded', async () => {
  initClock();
  lucide.createIcons();
  await loadBranchesDropdown();
  preloadLookupData();
  await switchView('dashboard');

  // Auto-refresh kitchen & dashboard every 15 seconds
  setInterval(() => {
    if (activeView === 'dashboard') loadDashboardData();
    if (activeView === 'kitchen') loadKitchenData();
    if (activeView === 'floorplan') loadFloorplanData();
  }, 15000);
});

function initClock() {
  const clockEl = document.getElementById('live-clock');
  function update() {
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString('vi-VN') + ' ' + now.toLocaleDateString('vi-VN');
  }
  update();
  setInterval(update, 1000);
}

async function switchView(viewName) {
  activeView = viewName;

  // Hide all views
  ['dashboard', 'floorplan', 'kitchen', 'hoadon', 'crud'].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add('hidden');
  });

  // Reset active classes on nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('bg-blue-600/90', 'text-white', 'shadow-sm');
    el.classList.add('text-slate-400');
  });

  // Show active view
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.remove('hidden');

  const navBtn = document.getElementById(`nav-${viewName}`);
  if (navBtn) {
    navBtn.classList.remove('text-slate-400');
    navBtn.classList.add('bg-blue-600/90', 'text-white', 'shadow-sm');
  }

  // Load view data
  if (viewName === 'dashboard') await loadDashboardData();
  if (viewName === 'floorplan') await loadFloorplanData();
  if (viewName === 'kitchen') await loadKitchenData();
  if (viewName === 'hoadon') await loadHoadonData();

  lucide.createIcons();
}

async function preloadLookupData() {
  try {
    const [catRes, dishRes, ingRes, tblRes] = await Promise.all([
      fetch(`${API_BASE}/crud/nhomthucdon`),
      fetch(`${API_BASE}/crud/monan`),
      fetch(`${API_BASE}/crud/nguyenlieu`),
      fetch(`${API_BASE}/ban-an`)
    ]);
    if (catRes.ok) categoriesList = await catRes.json();
    if (dishRes.ok) dishesList = await dishRes.json();
    if (ingRes.ok) ingredientsList = await ingRes.json();
    if (tblRes.ok) tablesList = await tblRes.json();
  } catch (err) {
    console.warn('Preload lookup data failed:', err);
  }
}

async function loadBranchesDropdown() {
  try {
    const res = await fetch(`${API_BASE}/crud/chinhanh`);
    if (!res.ok) throw new Error('Không thể tải chi nhánh');
    branchesList = await res.json();
    const select = document.getElementById('global-branch-select');
    select.innerHTML = '<option value="ALL">Toàn hệ thống (Tất cả chi nhánh)</option>';
    branchesList.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.MaChiNhanh;
      opt.innerText = `${b.MaChiNhanh} - ${b.TenChiNhanh}`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
  }
}

function onGlobalBranchChange() {
  currentBranch = document.getElementById('global-branch-select').value;
  // Tải lại toàn bộ dữ liệu Dashboard theo chi nhánh được chọn
  loadDashboardData();
  if (activeView === 'floorplan') loadFloorplanData();
  if (activeView === 'kitchen') loadKitchenData();
  if (activeView === 'hoadon') loadHoadonData();
  if (activeView === 'crud' && ['banan', 'khonguyenlieu', 'hoadon'].includes(activeCrudEntity)) {
    loadCrudData(activeCrudEntity);
  }
  showToast(`Đã chuyển bộ lọc: ${currentBranch === 'ALL' ? 'Toàn hệ thống' : currentBranch}`, 'info');
}

// =====================================================================
// 2. DASHBOARD LOGIC & CHARTS
// =====================================================================

async function loadDashboardData() {
  try {
    const url = (currentBranch && currentBranch !== 'ALL')
      ? `${API_BASE}/dashboard/stats?ma_chi_nhanh=${encodeURIComponent(currentBranch)}`
      : `${API_BASE}/dashboard/stats`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Lỗi khi tải dữ liệu thống kê');
    const data = await res.json();

    // Stats
    const b = data.ban || {};
    document.getElementById('stat-ban-active').innerText = b.ban_dang_phuc_vu || 0;
    document.getElementById('stat-ban-total').innerText = b.tong_ban || 0;
    document.getElementById('stat-ban-empty').innerText = b.ban_trong || 0;
    document.getElementById('stat-ban-reserved').innerText = b.ban_da_dat || 0;

    const c = data.counts || {};
    document.getElementById('stat-kitchen-pending').innerText = c.don_cho_bep || 0;
    document.getElementById('badge-kitchen-count').innerText = c.don_cho_bep || 0;

    const d = data.doanh_thu || {};
    const rev = parseFloat(d.tong_doanh_thu !== undefined ? d.tong_doanh_thu : (d.doanh_thu_thang_10 || 0));
    document.getElementById('stat-doanh-thu').innerText = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(rev);
    document.getElementById('stat-tong-hoadon').innerText = d.tong_hoa_don || 0;

    const revLabel = document.getElementById('stat-doanh-thu-label');
    if (revLabel) {
      revLabel.innerText = data.is_branch ? 'Doanh Thu Chi Nhánh' : 'Tổng Doanh Thu Toàn Hệ Thống';
    }

    // Cập nhật tiêu đề biểu đồ và bảng bán chạy theo ngữ cảnh (Chi nhánh / Toàn hệ thống)
    const chartTitleEl = document.getElementById('chart-revenue-title');
    if (chartTitleEl) {
      chartTitleEl.innerHTML = `
        <i data-lucide="bar-chart-3" class="w-4 h-4 text-blue-600"></i>
        ${data.is_branch ? 'Doanh thu theo Nhóm thực đơn (Chi nhánh)' : 'Top 5 Chi nhánh có Doanh thu cao nhất'}
      `;
    }

    const bestSellerTitleEl = document.getElementById('best-seller-title');
    if (bestSellerTitleEl) {
      bestSellerTitleEl.innerHTML = `
        <i data-lucide="flame" class="w-4 h-4 text-orange-500"></i>
        ${data.is_branch ? 'Món ăn bán chạy tại Chi nhánh' : 'Món ăn bán chạy nhất toàn hệ thống'}
      `;
    }

    // Charts
    renderBranchRevenueChart(data.top_branches || [], data.is_branch);
    renderTableStatusChart(b);

    // Recent orders table
    const recentBody = document.getElementById('dashboard-recent-orders');
    recentBody.innerHTML = '';
    (data.recent_orders || []).forEach(o => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition-base';
      tr.innerHTML = `
        <td class="px-4 py-3 font-mono font-semibold text-blue-600">${o.MaOrder}</td>
        <td class="px-4 py-3 font-semibold">Bàn ${o.SoBan}</td>
        <td class="px-4 py-3 text-xs text-slate-500">${o.TenChiNhanh}</td>
        <td class="px-4 py-3">${o.SoLuongKhach} khách</td>
        <td class="px-4 py-3 text-xs text-slate-500">${o.ThoiGianOrder ? o.ThoiGianOrder.replace('T', ' ') : ''}</td>
        <td class="px-4 py-3">
          <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${o.TrangThaiOrder === 'DangXuLy' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">
            ${o.TrangThaiOrder === 'DangXuLy' ? 'Đang phục vụ' : 'Đã thanh toán'}
          </span>
        </td>
      `;
      recentBody.appendChild(tr);
    });

    // Top dishes table
    const topBody = document.getElementById('dashboard-top-dishes');
    topBody.innerHTML = '';
    (data.top_dishes || []).forEach((m, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition-base';
      tr.innerHTML = `
        <td class="px-4 py-3 font-bold text-slate-400">#${idx + 1}</td>
        <td class="px-4 py-3 font-semibold text-slate-900">${m.TenMon}</td>
        <td class="px-4 py-3 text-right font-mono font-bold text-blue-600">${m.SoLuongBan} phần</td>
      `;
      topBody.appendChild(tr);
    });

    lucide.createIcons();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderBranchRevenueChart(branches, isBranch = false) {
  const ctx = document.getElementById('chart-branch-revenue');
  if (!ctx) return;
  if (branchRevenueChart) branchRevenueChart.destroy();

  const labels = branches.map(b => (b.Label || b.TenChiNhanh || '').replace('Nhà hàng Biển Đông - ', ''));
  const values = branches.map(b => parseFloat(b.DoanhThu || 0));

  branchRevenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: isBranch ? 'Doanh thu nhóm món (VND)' : 'Doanh thu chi nhánh (VND)',
        data: values,
        backgroundColor: '#3B82F6',
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          ticks: {
            callback: v => (v / 1000000) + 'M'
          }
        }
      }
    }
  });
}

function renderTableStatusChart(b) {
  const ctx = document.getElementById('chart-table-status');
  if (!ctx) return;
  if (tableStatusChart) tableStatusChart.destroy();

  tableStatusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Đang phục vụ', 'Bàn trống', 'Đã đặt trước'],
      datasets: [{
        data: [b.ban_dang_phuc_vu || 0, b.ban_trong || 0, b.ban_da_dat || 0],
        backgroundColor: ['#DC2626', '#059669', '#D97706'],
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 } }
        }
      }
    }
  });
}

// =====================================================================
// 3. SƠ ĐỒ BÀN ĂN (FLOOR PLAN) & GỌI MÓN
// =====================================================================

async function loadFloorplanData() {
  try {
    const url = currentBranch === 'ALL' ? `${API_BASE}/ban-an` : `${API_BASE}/ban-an?ma_chi_nhanh=${currentBranch}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Không thể tải sơ đồ bàn ăn');
    const tables = await res.json();

    const container = document.getElementById('floorplan-grid');
    container.innerHTML = '';

    tables.forEach(t => {
      const isServing = t.TrangThai === 'DangPhucVu';
      const isReserved = t.TrangThai === 'DaDat';
      const isEmpty = t.TrangThai === 'Trong';

      let statusColor = 'border-emerald-200 bg-white text-emerald-700';
      let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      if (isServing) {
        statusColor = 'border-red-300 bg-red-50/40 text-red-700';
        badgeColor = 'bg-red-100 text-red-700 border-red-200';
      } else if (isReserved) {
        statusColor = 'border-amber-300 bg-amber-50/40 text-amber-700';
        badgeColor = 'bg-amber-100 text-amber-700 border-amber-200';
      }

      const card = document.createElement('div');
      card.className = `p-4 rounded-xl border-2 shadow-sm flex flex-col justify-between transition-base hover:shadow-md ${statusColor}`;
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full border ${badgeColor}">
              ${t.TrangThai}
            </span>
            <span class="text-xs text-slate-400 font-medium">${t.SucChua} chỗ</span>
          </div>
          <h4 class="text-xl font-bold text-slate-900 tracking-tight">Bàn ${t.SoBan}</h4>
          <p class="text-[11px] text-slate-500 mt-0.5 truncate">${t.TenChiNhanh}</p>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-100 space-y-2">
          ${isEmpty ? `
            <button onclick="openTableOrder('${t.MaBan}')" class="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-base flex items-center justify-center gap-1.5">
              <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
              <span>Mở bàn & Gọi món</span>
            </button>
          ` : isServing ? `
            <div class="grid grid-cols-2 gap-1.5">
              <button onclick="openTableOrder('${t.MaBan}')" class="py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition-base flex items-center justify-center gap-1">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                <span>Thêm món</span>
              </button>
              <button onclick="openCheckoutModal('${t.MaOrderHienTai}')" class="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-base flex items-center justify-center gap-1">
                <i data-lucide="receipt" class="w-3.5 h-3.5"></i>
                <span>Tính tiền</span>
              </button>
            </div>
          ` : `
            <button onclick="setTableStatus('${t.MaBan}', 'Trong')" class="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-base">
              Hủy đặt bàn
            </button>
          `}
        </div>
      `;
      container.appendChild(card);
    });

    lucide.createIcons();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function setTableStatus(maBan, status) {
  try {
    const res = await fetch(`${API_BASE}/ban-an/${maBan}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trang_thai: status })
    });
    if (!res.ok) throw new Error('Không thể đổi trạng thái bàn');
    showToast(`Đã chuyển bàn ${maBan} sang '${status}'`, 'success');
    loadFloorplanData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =====================================================================
// 4. MÀN HÌNH BẾP/BAR (KDS) & TRIGGER TRỪ KHO
// =====================================================================

async function loadKitchenData() {
  try {
    const url = currentBranch === 'ALL' ? `${API_BASE}/kitchen` : `${API_BASE}/kitchen?ma_chi_nhanh=${currentBranch}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Không thể tải danh sách bếp');
    const items = await res.json();

    document.getElementById('badge-kitchen-count').innerText = items.length;
    const grid = document.getElementById('kitchen-cards-grid');
    grid.innerHTML = '';

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full p-12 text-center bg-white rounded-xl border border-slate-200">
          <i data-lucide="check-circle" class="w-12 h-12 text-emerald-500 mx-auto mb-3"></i>
          <h4 class="text-base font-bold text-slate-800">Bếp đã hoàn thành tất cả các món!</h4>
          <p class="text-xs text-slate-400 mt-1">Không có món ăn nào đang chờ chế biến.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    items.forEach(it => {
      const isCooking = it.TrangThaiBep === 'DangCheBien';
      const card = document.createElement('div');
      card.className = `p-5 rounded-xl border-2 shadow-sm bg-white flex flex-col justify-between transition-base ${isCooking ? 'border-amber-300' : 'border-slate-200'}`;
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-bold px-2 py-0.5 rounded-full ${isCooking ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}">
              ${isCooking ? 'Đang chế biến' : 'Chờ xử lý'}
            </span>
            <span class="text-xs font-mono font-semibold text-slate-400">${it.MaOrder}</span>
          </div>

          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="text-lg font-bold text-slate-900">${it.TenMon}</h3>
              <p class="text-xs text-slate-500 font-semibold mt-0.5">Bàn ${it.SoBan} • ${it.TenChiNhanh}</p>
            </div>
            <span class="text-2xl font-black text-blue-600 font-mono-num">x${it.SoLuong}</span>
          </div>

          <p class="text-[11px] text-slate-400 mt-3 flex items-center gap-1">
            <i data-lucide="clock" class="w-3.5 h-3.5"></i>
            <span>Gọi lúc: ${it.ThoiGianGoiMon ? it.ThoiGianGoiMon.replace('T', ' ') : ''}</span>
          </p>
        </div>

        <div class="mt-5 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
          ${!isCooking ? `
            <button onclick="updateKitchenStatus(${it.MaChiTietOrder}, 'DangCheBien')" class="py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold shadow-sm transition-base">
              Bắt đầu nấu
            </button>
          ` : `
            <div class="py-2 px-3 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold text-center">
              Đang trên bếp...
            </div>
          `}
          <button onclick="updateKitchenStatus(${it.MaChiTietOrder}, 'HoanThanhMon')" class="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-base flex items-center justify-center gap-1">
            <i data-lucide="check" class="w-3.5 h-3.5"></i>
            <span>Hoàn thành (Trừ kho)</span>
          </button>
        </div>
      `;
      grid.appendChild(card);
    });

    lucide.createIcons();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateKitchenStatus(id, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/kitchen/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trang_thai: newStatus })
    });
    if (!res.ok) throw new Error('Không thể cập nhật trạng thái món');
    const data = await res.json();
    showToast(data.message, 'success');
    await loadKitchenData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =====================================================================
// 5. MODAL GỌI MÓN (ORDER MODAL) & TRIGGER 1
// =====================================================================

async function openTableOrder(maBan) {
  await openQuickOrderModal(maBan);
}

async function openQuickOrderModal(preselectedTable = null) {
  orderModalSelectedItems = {};
  updateOrderPreview();

  // Load tables into select - Lọc theo chi nhánh đang được chọn trên Topbar
  try {
    const url = (currentBranch && currentBranch !== 'ALL')
      ? `${API_BASE}/ban-an?ma_chi_nhanh=${encodeURIComponent(currentBranch)}`
      : `${API_BASE}/ban-an`;

    const resTables = await fetch(url);
    const tables = await resTables.json();
    const tableSelect = document.getElementById('order-table-select');
    tableSelect.innerHTML = '';

    // Cập nhật huy hiệu chi nhánh trên tiêu đề Modal
    const branchBadge = document.getElementById('order-modal-branch-badge');
    if (branchBadge) {
      if (currentBranch && currentBranch !== 'ALL') {
        const branchObj = branchesList.find(b => b.MaChiNhanh === currentBranch);
        branchBadge.innerText = branchObj ? branchObj.TenChiNhanh : currentBranch;
        branchBadge.classList.remove('hidden');
      } else {
        branchBadge.innerText = 'Toàn hệ thống';
        branchBadge.classList.remove('hidden');
      }
    }

    if (!tables || tables.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.innerText = 'Chi nhánh này hiện chưa có bàn ăn nào';
      tableSelect.appendChild(opt);
    } else {
      tables.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.MaBan;
        // Nếu đã chọn chi nhánh cụ thể: hiển thị ngắn gọn 'Bàn X (4 khách) - [Trạng thái]'
        if (currentBranch && currentBranch !== 'ALL') {
          opt.innerText = `Bàn ${t.SoBan} (${t.SucChua} chỗ) - [${t.TrangThai}]`;
        } else {
          opt.innerText = `Bàn ${t.SoBan} (${t.TenChiNhanh}) - [${t.TrangThai}]`;
        }
        if (preselectedTable && t.MaBan === preselectedTable) opt.selected = true;
        tableSelect.appendChild(opt);
      });
    }

    // Load active menu
    const resMenu = await fetch(`${API_BASE}/thuc-don`);
    menuList = await resMenu.json();
    renderOrderMenu();

    openModal('modal-order');
  } catch (err) {
    showToast('Lỗi khi chuẩn bị dữ liệu gọi món: ' + err.message, 'error');
  }
}

function renderOrderMenu() {
  const container = document.getElementById('order-menu-items');
  container.innerHTML = '';
  menuList.forEach(m => {
    const qty = orderModalSelectedItems[m.MaMonAn] || 0;
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100';
    div.innerHTML = `
      <div>
        <p class="text-sm font-semibold text-slate-800">${m.TenMon}</p>
        <p class="text-xs text-blue-600 font-mono font-medium">${new Intl.NumberFormat('vi-VN').format(m.DonGiaMon)} đ • <span class="text-slate-400">${m.TenNhom}</span></p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="changeOrderItemQty('${m.MaMonAn}', -1)" class="w-7 h-7 rounded-md bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 flex items-center justify-center">-</button>
        <span id="qty-${m.MaMonAn}" class="w-6 text-center text-sm font-bold font-mono">${qty}</span>
        <button onclick="changeOrderItemQty('${m.MaMonAn}', 1)" class="w-7 h-7 rounded-md bg-blue-600 text-white font-bold hover:bg-blue-700 flex items-center justify-center">+</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function changeOrderItemQty(maMon, delta) {
  const current = orderModalSelectedItems[maMon] || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) {
    delete orderModalSelectedItems[maMon];
  } else {
    orderModalSelectedItems[maMon] = next;
  }
  const span = document.getElementById(`qty-${maMon}`);
  if (span) span.innerText = next;
  updateOrderPreview();
}

function updateOrderPreview() {
  let total = 0;
  for (const [maMon, qty] of Object.entries(orderModalSelectedItems)) {
    const item = menuList.find(m => m.MaMonAn === maMon);
    if (item) total += item.DonGiaMon * qty;
  }
  document.getElementById('order-total-preview').innerText = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(total);
}

async function submitOrder() {
  const maBan = document.getElementById('order-table-select').value;
  if (!maBan) {
    showToast('Vui lòng chọn một bàn ăn hợp lệ!', 'warning');
    return;
  }
  const guests = parseInt(document.getElementById('order-guests-input').value) || 1;

  const items = Object.entries(orderModalSelectedItems).map(([maMon, qty]) => ({
    ma_mon_an: maMon,
    so_luong: qty
  }));

  if (items.length === 0) {
    showToast('Vui lòng chọn ít nhất 1 món ăn!', 'warning');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ma_ban: maBan,
        so_luong_khach: guests,
        danh_sach_mon: items
      })
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.detail || 'Lỗi khi tạo order');
    }
    const data = await res.json();
    closeModal('modal-order');
    showToast(`Order thành công! ${data.message}`, 'success');

    if (activeView === 'floorplan') loadFloorplanData();
    if (activeView === 'kitchen') loadKitchenData();
    if (activeView === 'dashboard') loadDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =====================================================================
// 6. THANH TOÁN HÓA ĐƠN (CHECKOUT)
// =====================================================================

async function openCheckoutModal(maOrder) {
  if (!maOrder) {
    showToast('Bàn này chưa có mã đơn gọi món!', 'warning');
    return;
  }
  currentCheckoutOrder = maOrder;
  try {
    const res = await fetch(`${API_BASE}/orders/${maOrder}/bill-preview`);
    if (!res.ok) throw new Error('Không thể tải thông tin bill');
    const data = await res.json();

    const o = data.order || {};
    document.getElementById('checkout-receipt-info').innerHTML = `
      <p><strong>Mã Order:</strong> ${o.MaOrder} • <strong>Bàn:</strong> ${o.SoBan}</p>
      <p><strong>Cơ sở:</strong> ${o.TenChiNhanh}</p>
      <p><strong>Thời gian mở bàn:</strong> ${o.ThoiGianOrder ? o.ThoiGianOrder.replace('T', ' ') : ''}</p>
      <p><strong>Khách hàng / Số chỗ:</strong> ${o.SoLuongKhach || 1} khách</p>
    `;

    const tbody = document.getElementById('checkout-items-body');
    tbody.innerHTML = '';
    (data.items || []).forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-1 font-medium">${it.TenMon}</td>
        <td class="py-1 text-center font-bold font-mono">x${it.SoLuong}</td>
        <td class="py-1 text-right font-mono">${new Intl.NumberFormat('vi-VN').format(it.DonGiaMon)} đ</td>
        <td class="py-1 text-right font-mono font-bold text-blue-600">${new Intl.NumberFormat('vi-VN').format(it.ThanhTien)} đ</td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('checkout-total-amount').innerText = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(data.tong_tien);

    // Cấu hình giao diện Modal cho thanh toán mới
    const titleEl = document.getElementById('checkout-modal-title');
    if (titleEl) titleEl.innerText = 'Thanh toán Hóa đơn tại bàn';
    const paySec = document.getElementById('checkout-payment-section');
    if (paySec) paySec.classList.remove('hidden');
    const btnConfirm = document.getElementById('btn-confirm-checkout');
    if (btnConfirm) btnConfirm.classList.remove('hidden');
    const paidBadge = document.getElementById('checkout-paid-badge');
    if (paidBadge) paidBadge.classList.add('hidden');

    openModal('modal-checkout');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmCheckout() {
  if (!currentCheckoutOrder) return;
  const method = document.getElementById('checkout-payment-method').value;
  try {
    const res = await fetch(`${API_BASE}/hoa-don/thanh-toan/${currentCheckoutOrder}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phuong_thuc: method })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Không thể thanh toán');
    }
    const data = await res.json();
    closeModal('modal-checkout');
    showToast(`Thanh toán thành công! Mã HĐ: ${data.ma_hoa_don}`, 'success');

    // Tự động cộng tiền vào doanh thu chi nhánh và toàn hệ thống ngay lập tức
    loadDashboardData();
    if (activeView === 'floorplan') loadFloorplanData();
    if (activeView === 'hoadon') loadHoadonData();
    if (activeView === 'kitchen') loadKitchenData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =====================================================================
// 7. QUẢN LÝ HÓA ĐƠN & THU NGÂN
// =====================================================================

function switchHoadonTab(tabName) {
  const pendingTab = document.getElementById('hoadon-tab-pending');
  const completedTab = document.getElementById('hoadon-tab-completed');
  const btnPending = document.getElementById('tab-btn-pending');
  const btnCompleted = document.getElementById('tab-btn-completed');

  if (tabName === 'pending') {
    if (pendingTab) pendingTab.classList.remove('hidden');
    if (completedTab) completedTab.classList.add('hidden');
    btnPending.className = 'px-3.5 py-1.5 rounded-lg bg-white text-blue-600 shadow-sm transition-base flex items-center gap-1.5';
    btnCompleted.className = 'px-3.5 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-base flex items-center gap-1.5';
  } else {
    if (pendingTab) pendingTab.classList.add('hidden');
    if (completedTab) completedTab.classList.remove('hidden');
    btnCompleted.className = 'px-3.5 py-1.5 rounded-lg bg-white text-blue-600 shadow-sm transition-base flex items-center gap-1.5';
    btnPending.className = 'px-3.5 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-base flex items-center gap-1.5';
  }
  lucide.createIcons();
}

async function loadHoadonData() {
  const branchParam = (currentBranch && currentBranch !== 'ALL') ? `?ma_chi_nhanh=${encodeURIComponent(currentBranch)}` : '';

  // 1. Tải các đơn đang phục vụ chờ thanh toán
  try {
    const resPending = await fetch(`${API_BASE}/orders/pending${branchParam}`);
    if (resPending.ok) {
      const pendingList = await resPending.json();
      const badgeCount = document.getElementById('badge-pending-count');
      if (badgeCount) badgeCount.innerText = pendingList.length;

      const tbodyPending = document.getElementById('pending-orders-table-body');
      if (tbodyPending) {
        tbodyPending.innerHTML = '';
        if (pendingList.length === 0) {
          tbodyPending.innerHTML = '<tr><td colspan="8" class="px-5 py-8 text-center text-slate-400">Không có đơn order nào đang chờ thanh toán tại chi nhánh này.</td></tr>';
        } else {
          pendingList.forEach(o => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-base';
            tr.innerHTML = `
              <td class="px-5 py-3.5 font-mono font-bold text-blue-600">${o.MaOrder}</td>
              <td class="px-5 py-3.5 font-bold text-slate-900">Bàn ${o.SoBan}</td>
              <td class="px-5 py-3.5 text-xs text-slate-600">${o.TenChiNhanh}</td>
              <td class="px-5 py-3.5 text-xs text-slate-500">${o.ThoiGianOrder ? o.ThoiGianOrder.replace('T', ' ') : ''}</td>
              <td class="px-5 py-3.5 text-center font-medium">${o.SoLuongKhach || 1} khách</td>
              <td class="px-5 py-3.5 text-center font-semibold text-slate-700">${o.SoMon} món</td>
              <td class="px-5 py-3.5 text-right font-mono font-bold text-emerald-600">${new Intl.NumberFormat('vi-VN').format(o.TamTinh)} đ</td>
              <td class="px-5 py-3.5 text-center whitespace-nowrap space-x-1.5">
                <button onclick="openTableOrder('${o.MaBan}')" class="px-2.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-base">Thêm món</button>
                <button onclick="openCheckoutModal('${o.MaOrder}')" class="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-base inline-flex items-center gap-1">
                  <i data-lucide="receipt" class="w-3.5 h-3.5"></i>
                  <span>Thanh toán ngay</span>
                </button>
              </td>
            `;
            tbodyPending.appendChild(tr);
          });
        }
      }
    }
  } catch (err) {
    console.warn('Lỗi tải danh sách chờ thanh toán:', err);
  }

  // 2. Tải danh sách hóa đơn đã hoàn tất
  try {
    const res = await fetch(`${API_BASE}/crud/hoadon${branchParam}`);
    if (!res.ok) throw new Error('Không thể tải hóa đơn');
    const list = await res.json();

    const tbody = document.getElementById('hoadon-table-body');
    if (tbody) {
      tbody.innerHTML = '';
      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="px-5 py-8 text-center text-slate-400">Chưa có chứng từ hóa đơn nào đã xuất.</td></tr>';
      } else {
        list.forEach(hd => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-slate-50 transition-base';
          tr.innerHTML = `
            <td class="px-5 py-3.5 font-mono font-bold text-blue-600">${hd.MaHoaDon}</td>
            <td class="px-5 py-3.5 font-mono text-slate-500">${hd.MaOrder}</td>
            <td class="px-5 py-3.5 text-xs text-slate-600">${hd.TenChiNhanh}</td>
            <td class="px-5 py-3.5 font-bold">Bàn ${hd.SoBan}</td>
            <td class="px-5 py-3.5 text-xs text-slate-500">${hd.ThoiGianLap ? hd.ThoiGianLap.replace('T', ' ') : ''}</td>
            <td class="px-5 py-3.5 text-right font-mono font-bold text-emerald-600">${new Intl.NumberFormat('vi-VN').format(hd.TongTien)} đ</td>
            <td class="px-5 py-3.5"><span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">${hd.PhuongThucThanhToan}</span></td>
            <td class="px-5 py-3.5 text-center">
              <button onclick="viewBillDetails('${hd.MaHoaDon}')" class="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-base">Xem chi tiết</button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
  } catch (err) {
    showToast(err.message, 'error');
  }

  lucide.createIcons();
}

async function viewBillDetails(maHoaDon) {
  currentCheckoutOrder = null;
  try {
    const res = await fetch(`${API_BASE}/crud/hoadon/${maHoaDon}/details`);
    if (!res.ok) throw new Error('Không thể tải chi tiết hóa đơn');
    const data = await res.json();
    const hd = data.hoa_don;

    document.getElementById('checkout-receipt-info').innerHTML = `
      <p><strong>Số HĐ:</strong> ${hd.MaHoaDon} • <strong>Bàn:</strong> ${hd.SoBan}</p>
      <p><strong>Cơ sở:</strong> ${hd.TenChiNhanh} (${hd.DiaChi})</p>
      <p><strong>Thời gian lập bill:</strong> ${hd.ThoiGianLap ? hd.ThoiGianLap.replace('T', ' ') : ''}</p>
      <p><strong>Phương thức thanh toán:</strong> <span class="font-bold text-slate-800">${hd.PhuongThucThanhToan}</span></p>
    `;

    const tbody = document.getElementById('checkout-items-body');
    tbody.innerHTML = '';
    (data.items || []).forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-1 font-medium">${it.TenMon}</td>
        <td class="py-1 text-center font-bold font-mono">x${it.SoLuong}</td>
        <td class="py-1 text-right font-mono">${new Intl.NumberFormat('vi-VN').format(it.DonGiaBan)} đ</td>
        <td class="py-1 text-right font-mono font-bold text-blue-600">${new Intl.NumberFormat('vi-VN').format(it.ThanhTien)} đ</td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('checkout-total-amount').innerText = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(hd.TongTien);

    // Cấu hình giao diện Modal cho chứng từ đã thanh toán
    const titleEl = document.getElementById('checkout-modal-title');
    if (titleEl) titleEl.innerText = 'Chi tiết Hóa đơn thanh toán';
    const paySec = document.getElementById('checkout-payment-section');
    if (paySec) paySec.classList.add('hidden');
    const btnConfirm = document.getElementById('btn-confirm-checkout');
    if (btnConfirm) btnConfirm.classList.add('hidden');
    const paidBadge = document.getElementById('checkout-paid-badge');
    if (paidBadge) paidBadge.classList.remove('hidden');

    openModal('modal-checkout');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =====================================================================
// 8. QUẢN TRỊ DỮ LIỆU ĐA NĂNG (GENERIC CRUD)
// =====================================================================

const CRUD_CONFIG = {
  chinhanh: {
    title: 'Quản lý Chi nhánh',
    desc: 'Danh sách các chi nhánh của chuỗi nhà hàng trên toàn quốc',
    endpoint: '/crud/chinhanh',
    idKey: 'MaChiNhanh',
    columns: [
      { key: 'MaChiNhanh', label: 'Mã CN', isId: true },
      { key: 'TenChiNhanh', label: 'Tên Chi Nhánh' },
      { key: 'DiaChi', label: 'Địa chỉ' },
      { key: 'SoDienThoai', label: 'Hotline' }
    ],
    fields: [
      { name: 'MaChiNhanh', label: 'Mã Chi Nhánh', type: 'text', required: true, placeholder: 'VD: CN11' },
      { name: 'TenChiNhanh', label: 'Tên Chi Nhánh', type: 'text', required: true, placeholder: 'VD: Nhà hàng Biển Đông - Landmark 81' },
      { name: 'DiaChi', label: 'Địa chỉ', type: 'text', required: true, placeholder: 'VD: 720A Điện Biên Phủ, P. 22, Bình Thạnh' },
      { name: 'SoDienThoai', label: 'Số điện thoại', type: 'text', placeholder: 'VD: 0901234599' }
    ]
  },
  banan: {
    title: 'Quản lý Bàn ăn',
    desc: 'Sơ đồ bàn theo từng chi nhánh',
    endpoint: '/crud/banan',
    idKey: 'MaBan',
    columns: [
      { key: 'MaBan', label: 'Mã Bàn', isId: true },
      { key: 'SoBan', label: 'Số bàn' },
      { key: 'TenChiNhanh', label: 'Chi nhánh' },
      { key: 'SucChua', label: 'Sức chứa' },
      { key: 'TrangThai', label: 'Trạng thái', badge: true }
    ],
    fields: [
      { name: 'MaBan', label: 'Mã Bàn', type: 'text', required: true, placeholder: 'VD: B51' },
      { name: 'SoBan', label: 'Số Bàn (STT)', type: 'number', required: true, placeholder: 'VD: 1' },
      { name: 'MaChiNhanh', label: 'Thuộc Chi Nhánh', type: 'select', optionsSrc: 'branches', required: true },
      { name: 'SucChua', label: 'Sức chứa (Khách)', type: 'number', default: 4 },
      { name: 'TrangThai', label: 'Trạng thái', type: 'select', options: ['Trong', 'DangPhucVu', 'DaDat'] }
    ]
  },
  nhomthucdon: {
    title: 'Nhóm thực đơn',
    desc: 'Phân loại các món ăn (Khai vị, Món chính, Đồ uống...)',
    endpoint: '/crud/nhomthucdon',
    idKey: 'MaNhom',
    columns: [
      { key: 'MaNhom', label: 'Mã nhóm', isId: true },
      { key: 'TenNhom', label: 'Tên nhóm' }
    ],
    fields: [
      { name: 'MaNhom', label: 'Mã Nhóm', type: 'text', required: true, placeholder: 'VD: N06' },
      { name: 'TenNhom', label: 'Tên Nhóm Thực Đơn', type: 'text', required: true, placeholder: 'VD: Dimsum & Điểm tâm' }
    ]
  },
  monan: {
    title: 'Món ăn & Thực đơn',
    desc: 'Danh mục món ăn, đơn giá và trạng thái phục vụ',
    endpoint: '/crud/monan',
    idKey: 'MaMonAn',
    columns: [
      { key: 'MaMonAn', label: 'Mã món', isId: true },
      { key: 'TenMon', label: 'Tên món ăn' },
      { key: 'TenNhom', label: 'Nhóm' },
      { key: 'DonGiaMon', label: 'Đơn giá', currency: true },
      { key: 'TrangThaiPhucVu', label: 'Trạng thái', badge: true }
    ],
    fields: [
      { name: 'MaMonAn', label: 'Mã Món Ăn', type: 'text', required: true, placeholder: 'VD: M21' },
      { name: 'TenMon', label: 'Tên Món Ăn', type: 'text', required: true, placeholder: 'VD: Súp vi cá hoàng gia' },
      { name: 'MaNhom', label: 'Nhóm Thực Đơn', type: 'select', optionsSrc: 'categories', required: true },
      { name: 'DonGiaMon', label: 'Đơn Giá (VND)', type: 'number', required: true, placeholder: 'VD: 150000' },
      { name: 'TrangThaiPhucVu', label: 'Trạng thái', type: 'select', options: ['DangPhucVu', 'TamNgung'] }
    ]
  },
  nguyenlieu: {
    title: 'Danh mục Nguyên liệu',
    desc: 'Các loại nguyên liệu thô để chế biến món ăn',
    endpoint: '/crud/nguyenlieu',
    idKey: 'MaNguyenLieu',
    columns: [
      { key: 'MaNguyenLieu', label: 'Mã NL', isId: true },
      { key: 'TenNguyenLieu', label: 'Tên nguyên liệu' },
      { key: 'DonViTinh', label: 'Đơn vị tính' }
    ],
    fields: [
      { name: 'MaNguyenLieu', label: 'Mã Nguyên Liệu', type: 'text', required: true, placeholder: 'VD: NL11' },
      { name: 'TenNguyenLieu', label: 'Tên Nguyên Liệu', type: 'text', required: true, placeholder: 'VD: Thịt cua lột tươi' },
      { name: 'DonViTinh', label: 'Đơn Vị Tính', type: 'text', required: true, placeholder: 'kg, gram, lon...' }
    ]
  },
  khonguyenlieu: {
    title: 'Kho Nguyên Liệu Chi Nhánh',
    desc: 'Số lượng tồn kho nguyên liệu tại từng chi nhánh (Khóa chính kép: Chi nhánh + Nguyên liệu)',
    endpoint: '/crud/khonguyenlieu',
    compositeKeys: ['MaChiNhanh', 'MaNguyenLieu'],
    columns: [
      { key: 'MaChiNhanh', label: 'Mã CN', isId: true },
      { key: 'TenChiNhanh', label: 'Chi nhánh' },
      { key: 'MaNguyenLieu', label: 'Mã NL', fontMono: true },
      { key: 'TenNguyenLieu', label: 'Nguyên liệu' },
      { key: 'SoLuongTon', label: 'Số lượng tồn kho', fontMono: true },
      { key: 'DonViTinh', label: 'Đơn vị' }
    ],
    fields: [
      { name: 'MaChiNhanh', label: 'Chi nhánh', type: 'select', optionsSrc: 'branches', required: true },
      { name: 'MaNguyenLieu', label: 'Nguyên liệu', type: 'select', optionsSrc: 'ingredients', required: true },
      { name: 'SoLuongTon', label: 'Số lượng tồn (>= 0)', type: 'number', step: '0.1', required: true, placeholder: 'VD: 25.5' }
    ]
  },
  dinhluongmon: {
    title: 'Định lượng món ăn (BOM)',
    desc: 'Công thức định lượng nguyên liệu cấu thành 1 phần ăn (Khóa chính kép: Món ăn + Nguyên liệu)',
    endpoint: '/crud/dinhluongmon',
    compositeKeys: ['MaMonAn', 'MaNguyenLieu'],
    columns: [
      { key: 'MaMonAn', label: 'Mã Món', isId: true },
      { key: 'TenMon', label: 'Món ăn' },
      { key: 'MaNguyenLieu', label: 'Mã NL', fontMono: true },
      { key: 'TenNguyenLieu', label: 'Nguyên liệu thành phần' },
      { key: 'SoLuongDinhLuong', label: 'Định lượng (1 suất)', fontMono: true },
      { key: 'DonViTinh', label: 'Đơn vị tính' }
    ],
    fields: [
      { name: 'MaMonAn', label: 'Món Ăn', type: 'select', optionsSrc: 'dishes', required: true },
      { name: 'MaNguyenLieu', label: 'Nguyên liệu thành phần', type: 'select', optionsSrc: 'ingredients', required: true },
      { name: 'SoLuongDinhLuong', label: 'Định lượng cần (1 suất)', type: 'number', step: '0.01', required: true, placeholder: 'VD: 0.25' }
    ]
  },
  datban: {
    title: 'Đặt bàn trước',
    desc: 'Danh sách khách đặt bàn trước qua điện thoại / website',
    endpoint: '/crud/datban',
    idKey: 'MaDatBan',
    columns: [
      { key: 'MaDatBan', label: 'Mã đặt', isId: true },
      { key: 'TenKhachHang', label: 'Khách hàng' },
      { key: 'SoDienThoai', label: 'SĐT' },
      { key: 'ThoiGianDat', label: 'Giờ hẹn' },
      { key: 'SoBan', label: 'Xếp bàn' },
      { key: 'TenChiNhanh', label: 'Chi nhánh' },
      { key: 'TrangThai', label: 'Trạng thái', badge: true }
    ],
    fields: [
      { name: 'MaDatBan', label: 'Mã Đặt Bàn', type: 'text', required: true, placeholder: 'VD: DB55' },
      { name: 'MaBan', label: 'Xếp Bàn Ăn', type: 'select', optionsSrc: 'tables', required: true },
      { name: 'TenKhachHang', label: 'Tên Khách Hàng', type: 'text', required: true, placeholder: 'VD: Trần Thị Mai' },
      { name: 'SoDienThoai', label: 'Số Điện Thoại', type: 'text', required: true, placeholder: 'VD: 0918765432' },
      { name: 'ThoiGianDat', label: 'Thời Gian Đặt (YYYY-MM-DD HH:MM:SS)', type: 'text', required: true, placeholder: 'VD: 2026-11-20 19:00:00' },
      { name: 'SoLuongKhach', label: 'Số Lượng Khách', type: 'number', required: true, placeholder: 'VD: 4' },
      { name: 'TrangThai', label: 'Trạng thái', type: 'select', options: ['ChuaNhan', 'DaNhan', 'Huy'] }
    ]
  }
};

async function openCrud(entityKey) {
  activeCrudEntity = entityKey;
  await switchView('crud');
  await loadCrudData(entityKey);
}

async function loadCrudData(entityKey) {
  const conf = CRUD_CONFIG[entityKey];
  if (!conf) return;

  document.getElementById('crud-entity-title').innerText = conf.title;
  document.getElementById('crud-entity-desc').innerText = conf.desc;

  try {
    const res = await fetch(`${API_BASE}${conf.endpoint}`);
    if (!res.ok) throw new Error('Không thể tải dữ liệu bảng');
    crudDataCache = await res.json();
    renderCrudTable(crudDataCache);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderCrudTable(data) {
  const conf = CRUD_CONFIG[activeCrudEntity];
  const thead = document.getElementById('crud-table-head');
  const tbody = document.getElementById('crud-table-body');

  // Header
  let headHtml = '<tr>';
  conf.columns.forEach(c => {
    headHtml += `<th class="px-5 py-3.5">${c.label}</th>`;
  });
  headHtml += '<th class="px-5 py-3.5 text-center">Thao tác</th></tr>';
  thead.innerHTML = headHtml;

  // Body
  tbody.innerHTML = '';
  document.getElementById('crud-page-count').innerText = data.length;

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${conf.columns.length + 1}" class="px-5 py-8 text-center text-slate-400">Không có bản ghi nào.</td></tr>`;
    return;
  }

  data.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition-base';
    let rowHtml = '';

    conf.columns.forEach(c => {
      let val = row[c.key];
      if (c.currency) val = new Intl.NumberFormat('vi-VN').format(val) + ' đ';
      if (c.isId) {
        rowHtml += `<td class="px-5 py-3.5 font-mono font-bold text-blue-600">${val || ''}</td>`;
      } else if (c.badge) {
        let badgeColor = 'bg-slate-100 text-slate-700';
        if (val === 'DangPhucVu' || val === 'DaNhan') badgeColor = 'bg-emerald-100 text-emerald-800';
        else if (val === 'Trong' || val === 'ChuaNhan') badgeColor = 'bg-blue-100 text-blue-800';
        else if (val === 'TamNgung' || val === 'Huy') badgeColor = 'bg-rose-100 text-rose-800';
        rowHtml += `<td class="px-5 py-3.5"><span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeColor}">${val || ''}</span></td>`;
      } else {
        rowHtml += `<td class="px-5 py-3.5 ${c.fontMono ? 'font-mono' : ''}">${val !== null && val !== undefined ? val : ''}</td>`;
      }
    });

    const cacheIdx = crudDataCache.indexOf(row);
    const targetIdx = cacheIdx !== -1 ? cacheIdx : index;

    rowHtml += `
      <td class="px-5 py-3.5 text-center space-x-2 whitespace-nowrap">
        <button onclick="openEditModal(${targetIdx})" class="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-base">Sửa</button>
        <button onclick="confirmDeleteCrud(${targetIdx})" class="px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-base">Xóa</button>
      </td>
    `;
    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);
  });
}

function onCrudSearch() {
  const term = document.getElementById('crud-search-input').value.toLowerCase();
  if (!term) {
    renderCrudTable(crudDataCache);
    return;
  }
  const filtered = crudDataCache.filter(row => {
    return Object.values(row).some(v => String(v).toLowerCase().includes(term));
  });
  renderCrudTable(filtered);
}

function openCreateModal() {
  const conf = CRUD_CONFIG[activeCrudEntity];
  currentEditingIndex = null;
  currentEditingRow = null;
  document.getElementById('modal-crud-title').innerText = `Thêm mới - ${conf.title}`;
  renderCrudFormFields({}, false);
  openModal('modal-crud');
}

function openEditModal(index) {
  const conf = CRUD_CONFIG[activeCrudEntity];
  const row = crudDataCache[index];
  if (!row) return;

  currentEditingIndex = index;
  currentEditingRow = row;

  let label = '';
  if (conf.compositeKeys) {
    label = `[${row[conf.compositeKeys[0]]} - ${row[conf.compositeKeys[1]]}]`;
  } else {
    label = `#${row[conf.idKey]}`;
  }

  document.getElementById('modal-crud-title').innerText = `Chỉnh sửa - ${conf.title} (${label})`;
  renderCrudFormFields(row, true);
  openModal('modal-crud');
}

function renderCrudFormFields(initialData, isEdit = false) {
  const conf = CRUD_CONFIG[activeCrudEntity];
  const container = document.getElementById('crud-form-fields');
  container.innerHTML = '';

  const pkKeys = conf.compositeKeys ? conf.compositeKeys : [conf.idKey];

  conf.fields.forEach(f => {
    const val = initialData[f.name] !== undefined ? initialData[f.name] : (f.default !== undefined ? f.default : '');
    const isPkField = pkKeys.includes(f.name);
    const div = document.createElement('div');
    let inputHtml = '';

    if (f.type === 'select') {
      let optionsHtml = '';
      if (f.optionsSrc === 'branches') {
        branchesList.forEach(b => {
          optionsHtml += `<option value="${b.MaChiNhanh}" ${val === b.MaChiNhanh ? 'selected' : ''}>${b.MaChiNhanh} - ${b.TenChiNhanh}</option>`;
        });
      } else if (f.optionsSrc === 'categories') {
        categoriesList.forEach(c => {
          optionsHtml += `<option value="${c.MaNhom}" ${val === c.MaNhom ? 'selected' : ''}>${c.MaNhom} - ${c.TenNhom}</option>`;
        });
      } else if (f.optionsSrc === 'dishes') {
        dishesList.forEach(d => {
          optionsHtml += `<option value="${d.MaMonAn}" ${val === d.MaMonAn ? 'selected' : ''}>${d.MaMonAn} - ${d.TenMon}</option>`;
        });
      } else if (f.optionsSrc === 'ingredients') {
        ingredientsList.forEach(i => {
          optionsHtml += `<option value="${i.MaNguyenLieu}" ${val === i.MaNguyenLieu ? 'selected' : ''}>${i.MaNguyenLieu} - ${i.TenNguyenLieu} (${i.DonViTinh})</option>`;
        });
      } else if (f.optionsSrc === 'tables') {
        tablesList.forEach(t => {
          optionsHtml += `<option value="${t.MaBan}" ${val === t.MaBan ? 'selected' : ''}>${t.MaBan} - Bàn ${t.SoBan} (${t.TenChiNhanh})</option>`;
        });
      } else if (f.options) {
        f.options.forEach(opt => {
          optionsHtml += `<option value="${opt}" ${val === opt ? 'selected' : ''}>${opt}</option>`;
        });
      }

      if (isEdit && isPkField) {
        inputHtml = `
          <select disabled class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium bg-slate-100 text-slate-500 cursor-not-allowed">${optionsHtml}</select>
          <input type="hidden" name="${f.name}" value="${val}">
        `;
      } else {
        inputHtml = `<select name="${f.name}" ${f.required ? 'required' : ''} class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none">${optionsHtml}</select>`;
      }
    } else {
      const stepAttr = f.step ? `step="${f.step}"` : (f.type === 'number' ? 'step="any"' : '');
      const placeholderAttr = f.placeholder ? `placeholder="${f.placeholder}"` : '';
      const readonlyAttr = (isEdit && isPkField) ? 'readonly class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium bg-slate-100 text-slate-500 cursor-not-allowed"' : 'class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"';

      inputHtml = `<input type="${f.type}" name="${f.name}" value="${val}" ${stepAttr} ${placeholderAttr} ${readonlyAttr} ${f.required ? 'required' : ''}>`;
    }

    div.innerHTML = `
      <label class="block text-xs font-semibold text-slate-700 mb-1">${f.label} ${f.required ? '<span class="text-red-500">*</span>' : ''}</label>
      ${inputHtml}
    `;
    container.appendChild(div);
  });
}

async function handleCrudSubmit(e) {
  e.preventDefault();
  const conf = CRUD_CONFIG[activeCrudEntity];
  const formData = new FormData(e.target);
  const payload = {};
  formData.forEach((value, key) => {
    payload[key] = value;
  });

  const isEdit = (currentEditingIndex !== null && currentEditingRow !== null);
  let url = `${API_BASE}${conf.endpoint}`;
  let method = 'POST';

  if (isEdit) {
    method = 'PUT';
    if (conf.compositeKeys) {
      const k1 = currentEditingRow[conf.compositeKeys[0]];
      const k2 = currentEditingRow[conf.compositeKeys[1]];
      url = `${API_BASE}${conf.endpoint}/${encodeURIComponent(k1)}/${encodeURIComponent(k2)}`;
    } else {
      const idVal = currentEditingRow[conf.idKey];
      url = `${API_BASE}${conf.endpoint}/${encodeURIComponent(idVal)}`;
    }
  }

  try {
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Không thể lưu dữ liệu');
    }
    const data = await res.json();
    closeModal('modal-crud');
    showToast(data.message || (isEdit ? 'Cập nhật bản ghi thành công' : 'Thêm mới bản ghi thành công'), 'success');
    
    // Tải lại dữ liệu bảng hiện tại
    await loadCrudData(activeCrudEntity);
    // Đồng thời làm mới danh sách lookup nếu bảng vừa sửa ảnh hưởng đến các bảng khác
    preloadLookupData();
    if (['chinhanh', 'banan'].includes(activeCrudEntity)) {
      loadBranchesDropdown();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function confirmDeleteCrud(index) {
  const conf = CRUD_CONFIG[activeCrudEntity];
  const row = crudDataCache[index];
  if (!row) return;

  let label = '';
  let deleteUrl = '';

  if (conf.compositeKeys) {
    const k1 = row[conf.compositeKeys[0]];
    const k2 = row[conf.compositeKeys[1]];
    label = `[${k1} - ${k2}]`;
    deleteUrl = `${API_BASE}${conf.endpoint}/${encodeURIComponent(k1)}/${encodeURIComponent(k2)}`;
  } else {
    const idVal = row[conf.idKey];
    label = `#${idVal}`;
    deleteUrl = `${API_BASE}${conf.endpoint}/${encodeURIComponent(idVal)}`;
  }

  document.getElementById('delete-confirm-text').innerText = `Bạn có chắc chắn muốn xóa bản ghi ${label} khỏi bảng "${conf.title}" không?`;
  
  currentDeleteCallback = async () => {
    try {
      const res = await fetch(deleteUrl, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Không thể xóa bản ghi');
      }
      const data = await res.json();
      closeModal('modal-delete');
      showToast(data.message || 'Đã xóa bản ghi thành công', 'success');
      await loadCrudData(activeCrudEntity);
      preloadLookupData();
      if (['chinhanh', 'banan'].includes(activeCrudEntity)) {
        loadBranchesDropdown();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('btn-confirm-delete').onclick = currentDeleteCallback;
  openModal('modal-delete');
}

// =====================================================================
// 9. MODAL & TOAST HELPERS
// =====================================================================

function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('hidden');
  lucide.createIcons();
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('hidden');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  let bg = 'bg-slate-900 text-white';
  let icon = 'info';

  if (type === 'success') {
    bg = 'bg-emerald-600 text-white';
    icon = 'check-circle';
  } else if (type === 'error') {
    bg = 'bg-red-600 text-white';
    icon = 'alert-triangle';
  } else if (type === 'warning') {
    bg = 'bg-amber-600 text-white';
    icon = 'alert-circle';
  }

  toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-xs font-semibold pointer-events-auto transform transition-all duration-300 translate-y-2 opacity-0 ${bg}`;
  toast.innerHTML = `
    <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  // Animation show
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  // Auto remove after 3.5s
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
