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
    el.classList.remove('bg-blue-50/80', 'text-blue-700', 'font-semibold', 'border-blue-600', 'shadow-xs');
    el.classList.add('text-slate-600', 'border-transparent');
    const icon = el.querySelector('i');
    if (icon) {
      icon.classList.remove('text-blue-600');
      icon.classList.add('text-slate-400');
    }
  });

  // Show active view
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.remove('hidden');

  const navBtn = document.getElementById(`nav-${viewName}`);
  if (navBtn) {
    navBtn.classList.remove('text-slate-600', 'border-transparent');
    navBtn.classList.add('bg-blue-50/80', 'text-blue-700', 'font-semibold', 'border-blue-600', 'shadow-xs');
    const icon = navBtn.querySelector('i');
    if (icon) {
      icon.classList.remove('text-slate-400');
      icon.classList.add('text-blue-600');
    }
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
      chartTitleEl.innerText = data.is_branch ? 'Doanh thu theo Nhóm thực đơn (Chi nhánh)' : 'Top 5 Chi nhánh có Doanh thu cao nhất';
    }

    const bestSellerTitleEl = document.getElementById('best-seller-title');
    if (bestSellerTitleEl) {
      bestSellerTitleEl.innerText = data.is_branch ? 'Món ăn bán chạy tại Chi nhánh' : 'Món ăn bán chạy nhất toàn hệ thống';
    }

    // Charts
    renderBranchRevenueChart(data.top_branches || [], data.is_branch);
    renderTableStatusChart(b);

    // Recent orders table
    const recentBody = document.getElementById('dashboard-recent-orders');
    recentBody.innerHTML = '';
    (data.recent_orders || []).forEach(o => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/70 transition-base';
      const isServing = o.TrangThaiOrder === 'DangXuLy';
      const statusBadge = isServing
        ? '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Đang phục vụ</span>'
        : '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Đã thanh toán</span>';

      tr.innerHTML = `
        <td class="px-4 py-3 font-mono text-xs font-medium text-slate-800">${o.MaOrder}</td>
        <td class="px-4 py-3 font-medium text-slate-900">Bàn ${o.SoBan}</td>
        <td class="px-4 py-3 text-xs text-slate-500">${o.TenChiNhanh}</td>
        <td class="px-4 py-3 text-center text-xs text-slate-600">${o.SoLuongKhach} khách</td>
        <td class="px-4 py-3 text-xs text-slate-500 font-mono-num">${o.ThoiGianOrder ? o.ThoiGianOrder.replace('T', ' ') : ''}</td>
        <td class="px-4 py-3">${statusBadge}</td>
      `;
      recentBody.appendChild(tr);
    });

    // Top dishes table
    const topBody = document.getElementById('dashboard-top-dishes');
    topBody.innerHTML = '';
    (data.top_dishes || []).forEach((m, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/70 transition-base';
      tr.innerHTML = `
        <td class="px-4 py-3 font-mono text-xs text-slate-400">#${idx + 1}</td>
        <td class="px-4 py-3 font-medium text-slate-800">${m.TenMon}</td>
        <td class="px-4 py-3 text-right font-mono-num font-semibold text-slate-900">${m.SoLuongBan} phần</td>
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
        backgroundColor: '#2563EB',
        hoverBackgroundColor: '#1D4ED8',
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11, family: 'Inter' }, color: '#64748B' }
        },
        y: {
          grid: { color: '#F1F5F9' },
          ticks: {
            font: { size: 11, family: 'JetBrains Mono' },
            color: '#64748B',
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
        backgroundColor: ['#EF4444', '#10B981', '#F59E0B'],
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 8, font: { size: 11, family: 'Inter' }, color: '#475569', padding: 14 }
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

      let badgeHtml = '';
      if (isEmpty) {
        badgeHtml = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Trong</span>`;
      } else if (isServing) {
        badgeHtml = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200/80"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>DangPhucVu</span>`;
      } else {
        badgeHtml = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/80"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>DaDat</span>`;
      }

      const card = document.createElement('div');
      card.className = 'p-4 rounded-lg border border-slate-200 bg-white shadow-xs flex flex-col justify-between transition-base hover:border-slate-300';
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between mb-2">
            ${badgeHtml}
            <span class="text-xs text-slate-400 font-medium">${t.SucChua} chỗ</span>
          </div>
          <h4 class="text-base font-semibold text-slate-900 tracking-tight mt-1">Bàn ${t.SoBan}</h4>
          <p class="text-xs text-slate-500 mt-0.5 truncate">${t.TenChiNhanh}</p>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-100">
          ${isEmpty ? `
            <button onclick="openTableOrder('${t.MaBan}')" class="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium shadow-xs transition-base text-center">
              Mở bàn & Gọi món
            </button>
          ` : isServing ? `
            <div class="grid grid-cols-2 gap-1.5">
              <button onclick="openTableOrder('${t.MaBan}')" class="py-1.5 px-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-md text-xs font-medium transition-base text-center">
                Thêm món
              </button>
              <button onclick="openCheckoutModal('${t.MaOrderHienTai}')" class="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-medium shadow-xs transition-base text-center">
                Tính tiền
              </button>
            </div>
          ` : `
            <button onclick="setTableStatus('${t.MaBan}', 'Trong')" class="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium transition-base text-center">
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
        <div class="col-span-full p-12 text-center bg-white rounded-lg border border-slate-200">
          <h4 class="text-sm font-semibold text-slate-800">Bếp đã hoàn thành tất cả các món!</h4>
          <p class="text-xs text-slate-500 mt-1">Không có món ăn nào đang chờ chế biến.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    items.forEach(it => {
      const isCooking = it.TrangThaiBep === 'DangCheBien';
      const card = document.createElement('div');
      card.className = 'p-4 rounded-lg border border-slate-200 bg-white shadow-xs flex flex-col justify-between transition-base hover:border-slate-300';
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium px-2 py-0.5 rounded ${isCooking ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
              ${isCooking ? 'Đang chế biến' : 'Chờ xử lý'}
            </span>
            <span class="text-xs font-mono font-medium text-slate-400">${it.MaOrder}</span>
          </div>

          <div class="flex items-start justify-between gap-3 mt-1">
            <div>
              <h3 class="text-base font-semibold text-slate-900">${it.TenMon}</h3>
              <p class="text-xs text-slate-500 mt-0.5">Bàn ${it.SoBan} • ${it.TenChiNhanh}</p>
            </div>
            <span class="text-xl font-bold text-slate-900 font-mono-num">x${it.SoLuong}</span>
          </div>

          <p class="text-xs text-slate-400 font-mono-num mt-3">
            Gọi lúc: ${it.ThoiGianGoiMon ? it.ThoiGianGoiMon.replace('T', ' ') : ''}
          </p>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
          ${!isCooking ? `
            <button onclick="updateKitchenStatus(${it.MaChiTietOrder}, 'DangCheBien')" class="py-1.5 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-medium transition-base text-center">
              Bắt đầu nấu
            </button>
          ` : `
            <div class="py-1.5 px-3 bg-amber-50 text-amber-800 rounded-md text-xs font-medium border border-amber-200 text-center">
              Đang trên bếp...
            </div>
          `}
          <button onclick="updateKitchenStatus(${it.MaChiTietOrder}, 'HoanThanhMon')" class="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-medium shadow-xs transition-base text-center">
            Hoàn thành (Trừ kho)
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
    div.className = 'flex items-center justify-between p-2.5 rounded-md bg-white border border-slate-200 hover:border-slate-300 transition-base';
    div.innerHTML = `
      <div>
        <p class="text-sm font-medium text-slate-900">${m.TenMon}</p>
        <p class="text-xs text-slate-500 font-mono-num font-medium">${new Intl.NumberFormat('vi-VN').format(m.DonGiaMon)} đ • <span class="text-slate-400 font-sans">${m.TenNhom}</span></p>
      </div>
      <div class="flex items-center gap-1.5">
        <button onclick="changeOrderItemQty('${m.MaMonAn}', -1)" class="w-6 h-6 rounded border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 flex items-center justify-center transition-base text-xs">-</button>
        <span id="qty-${m.MaMonAn}" class="w-6 text-center text-xs font-semibold font-mono-num text-slate-900">${qty}</span>
        <button onclick="changeOrderItemQty('${m.MaMonAn}', 1)" class="w-6 h-6 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 flex items-center justify-center transition-base text-xs">+</button>
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
    btnPending.className = 'px-3.5 py-1.5 rounded-md bg-white text-slate-900 shadow-xs font-medium transition-base flex items-center gap-1.5';
    btnCompleted.className = 'px-3.5 py-1.5 rounded-md text-slate-600 hover:text-slate-900 font-medium transition-base';
  } else {
    if (pendingTab) pendingTab.classList.add('hidden');
    if (completedTab) completedTab.classList.remove('hidden');
    btnCompleted.className = 'px-3.5 py-1.5 rounded-md bg-white text-slate-900 shadow-xs font-medium transition-base';
    btnPending.className = 'px-3.5 py-1.5 rounded-md text-slate-600 hover:text-slate-900 font-medium transition-base flex items-center gap-1.5';
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
            tr.className = 'hover:bg-slate-50/70 transition-base';
            tr.innerHTML = `
              <td class="px-5 py-3.5 font-mono text-xs font-medium text-slate-800">${o.MaOrder}</td>
              <td class="px-5 py-3.5 font-semibold text-slate-900">Bàn ${o.SoBan}</td>
              <td class="px-5 py-3.5 text-xs text-slate-500">${o.TenChiNhanh}</td>
              <td class="px-5 py-3.5 text-xs text-slate-500 font-mono-num">${o.ThoiGianOrder ? o.ThoiGianOrder.replace('T', ' ') : ''}</td>
              <td class="px-5 py-3.5 text-center text-xs text-slate-600 font-medium">${o.SoLuongKhach || 1} khách</td>
              <td class="px-5 py-3.5 text-center text-xs font-medium text-slate-700">${o.SoMon} món</td>
              <td class="px-5 py-3.5 text-right font-mono-num font-semibold text-slate-900">${new Intl.NumberFormat('vi-VN').format(o.TamTinh)} đ</td>
              <td class="px-5 py-3.5 text-center whitespace-nowrap space-x-1.5">
                <button onclick="openTableOrder('${o.MaBan}')" class="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-base">Thêm món</button>
                <button onclick="openCheckoutModal('${o.MaOrder}')" class="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-xs transition-base">Thanh toán ngay</button>
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
          tr.className = 'hover:bg-slate-50/70 transition-base';
          tr.innerHTML = `
            <td class="px-5 py-3.5 font-mono text-xs font-medium text-slate-800">${hd.MaHoaDon}</td>
            <td class="px-5 py-3.5 font-mono text-xs text-slate-400">${hd.MaOrder}</td>
            <td class="px-5 py-3.5 text-xs text-slate-500">${hd.TenChiNhanh}</td>
            <td class="px-5 py-3.5 font-semibold text-slate-900">Bàn ${hd.SoBan}</td>
            <td class="px-5 py-3.5 text-xs text-slate-500 font-mono-num">${hd.ThoiGianLap ? hd.ThoiGianLap.replace('T', ' ') : ''}</td>
            <td class="px-5 py-3.5 text-right font-mono-num font-semibold text-slate-900">${new Intl.NumberFormat('vi-VN').format(hd.TongTien)} đ</td>
            <td class="px-5 py-3.5"><span class="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">${hd.PhuongThucThanhToan}</span></td>
            <td class="px-5 py-3.5 text-center">
              <button onclick="viewBillDetails('${hd.MaHoaDon}')" class="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-base">Xem chi tiết</button>
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

  // Highlight specific CRUD nav item
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('bg-blue-50/80', 'text-blue-700', 'font-semibold', 'border-blue-600', 'shadow-xs');
    el.classList.add('text-slate-600', 'border-transparent');
    const icon = el.querySelector('i');
    if (icon) {
      icon.classList.remove('text-blue-600');
      icon.classList.add('text-slate-400');
    }
  });
  const crudNavBtn = document.getElementById(`nav-crud-${entityKey}`);
  if (crudNavBtn) {
    crudNavBtn.classList.remove('text-slate-600', 'border-transparent');
    crudNavBtn.classList.add('bg-blue-50/80', 'text-blue-700', 'font-semibold', 'border-blue-600', 'shadow-xs');
    const icon = crudNavBtn.querySelector('i');
    if (icon) {
      icon.classList.remove('text-slate-400');
      icon.classList.add('text-blue-600');
    }
  }

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
    headHtml += `<th class="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider ${c.currency ? 'text-right' : ''}">${c.label}</th>`;
  });
  headHtml += '<th class="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider text-center">Thao tác</th></tr>';
  thead.innerHTML = headHtml;

  // Body
  tbody.innerHTML = '';
  document.getElementById('crud-page-count').innerText = data.length;

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${conf.columns.length + 1}" class="px-4 py-8 text-center text-slate-400">Không có bản ghi nào.</td></tr>`;
    return;
  }

  data.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/70 transition-base';
    let rowHtml = '';

    conf.columns.forEach(c => {
      let val = row[c.key];
      if (c.currency) val = new Intl.NumberFormat('vi-VN').format(val) + ' đ';
      if (c.isId) {
        rowHtml += `<td class="px-4 py-3 font-mono text-xs font-medium text-slate-900">${val || ''}</td>`;
      } else if (c.badge) {
        let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
        if (val === 'DangPhucVu' || val === 'DaNhan') badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
        else if (val === 'Trong' || val === 'ChuaNhan') badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
        else if (val === 'TamNgung' || val === 'Huy') badgeColor = 'bg-rose-50 text-rose-700 border-rose-200/80';
        rowHtml += `<td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-xs font-medium border ${badgeColor}">${val || ''}</span></td>`;
      } else {
        rowHtml += `<td class="px-4 py-3 text-sm text-slate-700 ${c.currency ? 'text-right font-mono-num font-medium text-slate-900' : ''} ${c.fontMono ? 'font-mono text-xs' : ''}">${val !== null && val !== undefined ? val : ''}</td>`;
      }
    });

    const cacheIdx = crudDataCache.indexOf(row);
    const targetIdx = cacheIdx !== -1 ? cacheIdx : index;

    rowHtml += `
      <td class="px-4 py-3 text-center space-x-1.5 whitespace-nowrap">
        <button onclick="openEditModal(${targetIdx})" class="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-base">Sửa</button>
        <button onclick="confirmDeleteCrud(${targetIdx})" class="px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-700 bg-white hover:bg-red-50 border border-slate-300 hover:border-red-200 rounded-md transition-base">Xóa</button>
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
          <select disabled class="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm font-normal bg-slate-100 text-slate-500 cursor-not-allowed">${optionsHtml}</select>
          <input type="hidden" name="${f.name}" value="${val}">
        `;
      } else {
        inputHtml = `<select name="${f.name}" ${f.required ? 'required' : ''} class="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm font-normal text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none transition-base">${optionsHtml}</select>`;
      }
    } else {
      const stepAttr = f.step ? `step="${f.step}"` : (f.type === 'number' ? 'step="any"' : '');
      const placeholderAttr = f.placeholder ? `placeholder="${f.placeholder}"` : '';
      const readonlyAttr = (isEdit && isPkField) ? 'readonly class="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm font-normal bg-slate-100 text-slate-500 cursor-not-allowed font-mono text-xs"' : 'class="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm font-normal text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none transition-base"';

      inputHtml = `<input type="${f.type}" name="${f.name}" value="${val}" ${stepAttr} ${placeholderAttr} ${readonlyAttr} ${f.required ? 'required' : ''}>`;
    }

    div.innerHTML = `
      <label class="block text-xs font-medium text-slate-700 mb-1">${f.label} ${f.required ? '<span class="text-red-500">*</span>' : ''}</label>
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
  let borderLeft = 'border-l-blue-600';
  let iconColor = 'text-blue-600';
  let icon = 'info';

  if (type === 'success') {
    borderLeft = 'border-l-emerald-600';
    iconColor = 'text-emerald-600';
    icon = 'check-circle';
  } else if (type === 'error') {
    borderLeft = 'border-l-rose-600';
    iconColor = 'text-rose-600';
    icon = 'alert-triangle';
  } else if (type === 'warning') {
    borderLeft = 'border-l-amber-600';
    iconColor = 'text-amber-600';
    icon = 'alert-circle';
  }

  toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-md shadow-elevated bg-white text-slate-800 border border-slate-200 border-l-4 ${borderLeft} text-xs font-medium pointer-events-auto transform transition-all duration-200 translate-y-2 opacity-0`;
  toast.innerHTML = `
    <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0 ${iconColor}"></i>
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
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}
