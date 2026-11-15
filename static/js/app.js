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
let menuList = [];
let orderModalSelectedItems = {};
let currentCheckoutOrder = null;
let currentDeleteCallback = null;
let branchRevenueChart = null;
let tableStatusChart = null;

// =====================================================================
// 1. INITIALIZATION & ROUTING
// =====================================================================

document.addEventListener('DOMContentLoaded', async () => {
  initClock();
  lucide.createIcons();
  await loadBranchesDropdown();
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
  ['dashboard', 'floorplan', 'kitchen', 'hoadon', 'crud', 'reports'].forEach(v => {
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
  if (viewName === 'reports') await loadReportQuery(1);

  lucide.createIcons();
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
    const rev = parseFloat(d.doanh_thu_thang_10 || 0);
    document.getElementById('stat-doanh-thu').innerText = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(rev);
    document.getElementById('stat-tong-hoadon').innerText = d.tong_hoa_don || 0;

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
            <button onclick="openCheckoutModal('${t.MaOrderHienTai}')" class="w-full py-1.5 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-base flex items-center justify-center gap-1.5">
              <i data-lucide="receipt" class="w-3.5 h-3.5"></i>
              <span>Tính tiền hóa đơn</span>
            </button>
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

    if (activeView === 'floorplan') loadFloorplanData();
    if (activeView === 'hoadon') loadHoadonData();
    if (activeView === 'dashboard') loadDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =====================================================================
// 7. QUẢN LÝ HÓA ĐƠN
// =====================================================================

async function loadHoadonData() {
  try {
    const url = currentBranch === 'ALL' ? `${API_BASE}/crud/hoadon` : `${API_BASE}/crud/hoadon?ma_chi_nhanh=${currentBranch}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Không thể tải hóa đơn');
    const list = await res.json();

    const tbody = document.getElementById('hoadon-table-body');
    tbody.innerHTML = '';
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
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function viewBillDetails(maHoaDon) {
  try {
    const res = await fetch(`${API_BASE}/crud/hoadon/${maHoaDon}/details`);
    if (!res.ok) throw new Error('Không thể tải chi tiết hóa đơn');
    const data = await res.json();
    const hd = data.hoa_don;

    document.getElementById('checkout-receipt-info').innerHTML = `
      <p><strong>Số HĐ:</strong> ${hd.MaHoaDon} • <strong>Bàn:</strong> ${hd.SoBan}</p>
      <p><strong>Cơ sở:</strong> ${hd.TenChiNhanh} (${hd.DiaChi})</p>
      <p><strong>Thời gian lập bill:</strong> ${hd.ThoiGianLap ? hd.ThoiGianLap.replace('T', ' ') : ''}</p>
      <p><strong>Phương thức:</strong> ${hd.PhuongThucThanhToan}</p>
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
      { name: 'MaChiNhanh', label: 'Mã Chi Nhánh', type: 'text', required: true },
      { name: 'TenChiNhanh', label: 'Tên Chi Nhánh', type: 'text', required: true },
      { name: 'DiaChi', label: 'Địa chỉ', type: 'text', required: true },
      { name: 'SoDienThoai', label: 'Số điện thoại', type: 'text' }
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
      { name: 'MaBan', label: 'Mã Bàn', type: 'text', required: true },
      { name: 'SoBan', label: 'Số Bàn', type: 'number', required: true },
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
      { name: 'MaNhom', label: 'Mã Nhóm', type: 'text', required: true },
      { name: 'TenNhom', label: 'Tên Nhóm Thực Đơn', type: 'text', required: true }
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
      { name: 'MaMonAn', label: 'Mã Món Ăn', type: 'text', required: true },
      { name: 'TenMon', label: 'Tên Món Ăn', type: 'text', required: true },
      { name: 'MaNhom', label: 'Nhóm Thực Đơn', type: 'text', required: true },
      { name: 'DonGiaMon', label: 'Đơn Giá (VND)', type: 'number', required: true },
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
      { name: 'MaNguyenLieu', label: 'Mã Nguyên Liệu', type: 'text', required: true },
      { name: 'TenNguyenLieu', label: 'Tên Nguyên Liệu', type: 'text', required: true },
      { name: 'DonViTinh', label: 'Đơn Vị Tính', type: 'text', required: true }
    ]
  },
  khonguyenlieu: {
    title: 'Kho Nguyên Liệu Chi Nhánh',
    desc: 'Số lượng tồn kho nguyên liệu tại từng chi nhánh',
    endpoint: '/crud/khonguyenlieu',
    idKey: 'MaNguyenLieu',
    columns: [
      { key: 'TenChiNhanh', label: 'Chi nhánh' },
      { key: 'TenNguyenLieu', label: 'Nguyên liệu' },
      { key: 'SoLuongTon', label: 'Số lượng tồn kho', fontMono: true },
      { key: 'DonViTinh', label: 'Đơn vị' }
    ],
    fields: [
      { name: 'MaChiNhanh', label: 'Chi nhánh', type: 'select', optionsSrc: 'branches', required: true },
      { name: 'MaNguyenLieu', label: 'Mã Nguyên Liệu', type: 'text', required: true },
      { name: 'SoLuongTon', label: 'Số lượng tồn (>= 0)', type: 'number', required: true }
    ]
  },
  dinhluongmon: {
    title: 'Định lượng món ăn (BOM)',
    desc: 'Công thức định lượng nguyên liệu cấu thành 1 phần ăn',
    endpoint: '/crud/dinhluongmon',
    idKey: 'MaMonAn',
    columns: [
      { key: 'TenMon', label: 'Món ăn' },
      { key: 'TenNguyenLieu', label: 'Nguyên liệu thành phần' },
      { key: 'SoLuongDinhLuong', label: 'Định lượng tiêu hao', fontMono: true },
      { key: 'DonViTinh', label: 'Đơn vị tính' }
    ],
    fields: [
      { name: 'MaMonAn', label: 'Mã Món Ăn', type: 'text', required: true },
      { name: 'MaNguyenLieu', label: 'Mã Nguyên Liệu', type: 'text', required: true },
      { name: 'SoLuongDinhLuong', label: 'Định lượng cần (1 suất)', type: 'number', required: true }
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
      { name: 'MaDatBan', label: 'Mã Đặt Bàn', type: 'text', required: true },
      { name: 'MaBan', label: 'Mã Bàn', type: 'text', required: true },
      { name: 'TenKhachHang', label: 'Tên Khách Hàng', type: 'text', required: true },
      { name: 'SoDienThoai', label: 'Số Điện Thoại', type: 'text', required: true },
      { name: 'ThoiGianDat', label: 'Thời Gian Đặt (YYYY-MM-DD HH:MM:SS)', type: 'text', required: true },
      { name: 'SoLuongKhach', label: 'Số Lượng Khách', type: 'number', required: true },
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

  data.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition-base';
    let rowHtml = '';

    conf.columns.forEach(c => {
      let val = row[c.key];
      if (c.currency) val = new Intl.NumberFormat('vi-VN').format(val) + ' đ';
      if (c.isId) {
        rowHtml += `<td class="px-5 py-3.5 font-mono font-bold text-blue-600">${val || ''}</td>`;
      } else if (c.badge) {
        rowHtml += `<td class="px-5 py-3.5"><span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">${val || ''}</span></td>`;
      } else {
        rowHtml += `<td class="px-5 py-3.5 ${c.fontMono ? 'font-mono' : ''}">${val !== null && val !== undefined ? val : ''}</td>`;
      }
    });

    const idVal = row[conf.idKey];
    rowHtml += `
      <td class="px-5 py-3.5 text-center space-x-2">
        <button onclick="openEditModal('${idVal}')" class="text-blue-600 hover:text-blue-800 text-xs font-semibold">Sửa</button>
        <button onclick="confirmDeleteCrud('${idVal}')" class="text-red-600 hover:text-red-800 text-xs font-semibold">Xóa</button>
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
  document.getElementById('modal-crud-title').innerText = `Thêm mới - ${conf.title}`;
  renderCrudFormFields({});
  openModal('modal-crud');
}

function openEditModal(idVal) {
  const conf = CRUD_CONFIG[activeCrudEntity];
  const row = crudDataCache.find(r => r[conf.idKey] === idVal);
  if (!row) return;

  document.getElementById('modal-crud-title').innerText = `Chỉnh sửa - ${conf.title} (#${idVal})`;
  renderCrudFormFields(row, true);
  openModal('modal-crud');
}

function renderCrudFormFields(initialData, isEdit = false) {
  const conf = CRUD_CONFIG[activeCrudEntity];
  const container = document.getElementById('crud-form-fields');
  container.innerHTML = '';

  conf.fields.forEach(f => {
    const val = initialData[f.name] !== undefined ? initialData[f.name] : (f.default || '');
    const div = document.createElement('div');
    let inputHtml = '';

    if (f.type === 'select') {
      let optionsHtml = '';
      if (f.optionsSrc === 'branches') {
        branchesList.forEach(b => {
          optionsHtml += `<option value="${b.MaChiNhanh}" ${val === b.MaChiNhanh ? 'selected' : ''}>${b.MaChiNhanh} - ${b.TenChiNhanh}</option>`;
        });
      } else if (f.options) {
        f.options.forEach(opt => {
          optionsHtml += `<option value="${opt}" ${val === opt ? 'selected' : ''}>${opt}</option>`;
        });
      }
      inputHtml = `<select name="${f.name}" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none">${optionsHtml}</select>`;
    } else {
      inputHtml = `<input type="${f.type}" name="${f.name}" value="${val}" ${isEdit && f.name === conf.idKey ? 'readonly class="bg-slate-100"' : ''} ${f.required ? 'required' : ''} class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none">`;
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

  const idVal = payload[conf.idKey];
  const isEdit = crudDataCache.some(r => r[conf.idKey] === idVal);

  const url = isEdit ? `${API_BASE}${conf.endpoint}/${idVal}` : `${API_BASE}${conf.endpoint}`;
  const method = isEdit ? 'PUT' : 'POST';

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
    showToast(data.message || 'Lưu dữ liệu thành công', 'success');
    await loadCrudData(activeCrudEntity);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function confirmDeleteCrud(idVal) {
  const conf = CRUD_CONFIG[activeCrudEntity];
  document.getElementById('delete-confirm-text').innerText = `Bạn có chắc chắn muốn xóa bản ghi #${idVal} khỏi bảng ${conf.title}?`;
  
  currentDeleteCallback = async () => {
    try {
      const res = await fetch(`${API_BASE}${conf.endpoint}/${idVal}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Không thể xóa bản ghi');
      }
      closeModal('modal-delete');
      showToast('Đã xóa bản ghi thành công', 'success');
      await loadCrudData(activeCrudEntity);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('btn-confirm-delete').onclick = currentDeleteCallback;
  openModal('modal-delete');
}

// =====================================================================
// 9. 8 TRUY VẤN BÁO CÁO SQL BTL
// =====================================================================

async function loadReportQuery(cauSo) {
  document.querySelectorAll('.report-tab').forEach(b => {
    b.classList.remove('border-blue-500', 'bg-blue-50', 'text-blue-600');
  });
  const activeBtn = document.getElementById(`btn-query-${cauSo}`);
  if (activeBtn) {
    activeBtn.classList.add('border-blue-500', 'bg-blue-50', 'text-blue-600');
  }

  try {
    const res = await fetch(`${API_BASE}/reports/${cauSo}`);
    if (!res.ok) throw new Error('Không thể thực thi câu truy vấn');
    const data = await res.json();

    document.getElementById('report-title').innerText = data.title;
    document.getElementById('report-desc').innerText = data.desc;
    document.getElementById('report-sql-text').innerText = data.sql;
    document.getElementById('report-record-count').innerText = `${data.total_records} dòng kết quả`;
    document.getElementById('btn-export-csv').href = `${API_BASE}/reports/${cauSo}/export-csv`;

    renderReportTable(data.data || []);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderReportTable(rows) {
  const thead = document.getElementById('report-table-head');
  const tbody = document.getElementById('report-table-body');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td class="p-6 text-center text-slate-400 text-xs">Không có dòng dữ liệu nào khớp với điều kiện.</td></tr>';
    return;
  }

  // Header
  const headers = Object.keys(rows[0]);
  let headHtml = '<tr>';
  headers.forEach(h => {
    headHtml += `<th class="px-4 py-2.5 font-bold text-xs uppercase">${h}</th>`;
  });
  headHtml += '</tr>';
  thead.innerHTML = headHtml;

  // Body
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition-base';
    let rowHtml = '';
    headers.forEach(h => {
      let val = r[h];
      if (typeof val === 'number' && !Number.isInteger(val)) {
        val = val.toFixed(2);
      }
      rowHtml += `<td class="px-4 py-2.5 font-mono text-xs">${val !== null ? val : 'NULL'}</td>`;
    });
    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);
  });
}

// =====================================================================
// 10. MODAL & TOAST HELPERS
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
