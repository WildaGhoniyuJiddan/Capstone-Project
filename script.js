/* ============================================================
   WarungKu Insight – script.js
   Vanilla JavaScript untuk Kasir, Dashboard, dan Menu & Stok
   ============================================================ */

/* ──────────────────────────────────────────────────────────
   KONSTANTA & KUNCI LOCALSTORAGE
   ────────────────────────────────────────────────────────── */
const LS_MENU       = 'warungku_menu';
const LS_TRANSAKSI  = 'warungku_transaksi';
const DATA_URL      = 'data.json';          // file data awal

/* ──────────────────────────────────────────────────────────
   STATE GLOBAL
   ────────────────────────────────────────────────────────── */
let appMenu      = [];   // daftar menu aktif
let appTransaksi = [];   // seluruh riwayat transaksi

// Keranjang belanja: { id, nama, harga, qty, kategori }
let cart = [];

// Referensi Chart.js agar bisa di-destroy sebelum rebuild
let charts = {};

// Filter Kasir
let kasirFilter   = 'Semua';
let kasirSearch   = '';

/* ──────────────────────────────────────────────────────────
   INISIALISASI APLIKASI
   ────────────────────────────────────────────────────────── */
/**
 * Titik masuk utama. Dipanggil setelah DOM + data.json dimuat.
 */
async function init() {
  await loadData();         // ambil data dari localStorage atau data.json
  renderKasir();            // render halaman Kasir
  renderStokTable();        // render tabel Menu & Stok
  updateDashboard();        // render dashboard

  // Listener pencarian Kasir
  document.getElementById('kasir-search').addEventListener('input', (e) => {
    kasirSearch = e.target.value.toLowerCase().trim();
    renderMenuGrid();
  });
}

/* ──────────────────────────────────────────────────────────
   MANAJEMEN DATA & LOCALSTORAGE
   ────────────────────────────────────────────────────────── */
/**
 * Muat data dari localStorage; jika kosong, ambil dari data.json
 */
async function loadData() {
  const savedMenu = localStorage.getItem(LS_MENU);
  const savedTx   = localStorage.getItem(LS_TRANSAKSI);

  if (savedMenu && savedTx) {
    appMenu      = JSON.parse(savedMenu);
    appTransaksi = JSON.parse(savedTx);
  } else {
    // Pertama kali atau setelah reset: fetch data.json
    try {
      const res  = await fetch(DATA_URL);
      const data = await res.json();
      appMenu      = data.menu;
      appTransaksi = data.transaksi;
      saveToStorage();
    } catch (err) {
      console.error('Gagal memuat data.json:', err);
      appMenu = []; appTransaksi = [];
    }
  }
}

/** Simpan state saat ini ke localStorage */
function saveToStorage() {
  localStorage.setItem(LS_MENU,      JSON.stringify(appMenu));
  localStorage.setItem(LS_TRANSAKSI, JSON.stringify(appTransaksi));
}

/**
 * Reset semua data ke data.json awal (hapus localStorage lalu reload)
 */
async function resetData() {
  if (!confirm('Reset semua data ke kondisi awal? Seluruh transaksi baru akan dihapus.')) return;
  localStorage.removeItem(LS_MENU);
  localStorage.removeItem(LS_TRANSAKSI);
  await loadData();
  cart = [];
  renderKasir();
  renderStokTable();
  updateDashboard();
  showToast('Data berhasil direset ke kondisi awal.');
}

/* ──────────────────────────────────────────────────────────
   NAVIGASI VIEW
   ────────────────────────────────────────────────────────── */
/**
 * Tampilkan salah satu view: 'kasir' | 'dashboard' | 'stok'
 */
function showView(view) {
  ['kasir', 'dashboard', 'stok'].forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('hidden', v !== view);
    document.getElementById(`nav-${v}`).classList.toggle('active', v !== view ? false : true);
  });

  // Re-render dashboard saat ditampilkan agar chart terupdate
  if (view === 'dashboard') updateDashboard();
  if (view === 'stok')      renderStokTable();
}

/* ──────────────────────────────────────────────────────────
   MODUL KASIR
   ────────────────────────────────────────────────────────── */

/** Render halaman Kasir (grid menu + keranjang kosong) */
function renderKasir() {
  renderMenuGrid();
  renderCart();
}

/** Render kartu menu berdasarkan filter & pencarian */
function renderMenuGrid() {
  const grid = document.getElementById('menu-grid');
  grid.innerHTML = '';

  // Filter menu
  const filtered = appMenu.filter(m => {
    const matchKat = kasirFilter === 'Semua' || m.kategori === kasirFilter;
    const matchQ   = m.nama.toLowerCase().includes(kasirSearch);
    return matchKat && matchQ;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<p class="col-span-full text-center text-gray-400 py-8 text-sm">Menu tidak ditemukan.</p>`;
    return;
  }

  filtered.forEach(menu => {
    const habis   = menu.stok <= 0;
    const card    = document.createElement('div');
    card.className = `menu-card ${habis ? 'out-of-stock' : ''}`;
    card.innerHTML = `
      <span class="badge-kategori badge-${menu.kategori}">${menu.kategori}</span>
      <p class="menu-nama">${menu.nama}</p>
      <p class="menu-harga">${formatRp(menu.harga)}</p>
      <p class="menu-stok">Stok: ${menu.stok}</p>
    `;
    if (!habis) card.onclick = () => addToCart(menu.id);
    grid.appendChild(card);
  });
}

/** Filter tombol kategori Kasir */
function filterKasir(kat) {
  kasirFilter = kat;
  // Update tampilan tombol aktif
  ['Semua','Minuman','Makanan','Snack'].forEach(k => {
    document.getElementById(`kf-${k}`).classList.toggle('active-filter', k === kat);
  });
  renderMenuGrid();
}

/* ──── Keranjang ─────────────────────────────────────────── */

/** Tambah item ke keranjang; jika sudah ada, tambah qty */
function addToCart(menuId) {
  const menu = appMenu.find(m => m.id === menuId);
  if (!menu || menu.stok <= 0) return;

  const existing = cart.find(c => c.id === menuId);
  if (existing) {
    if (existing.qty >= menu.stok) {
      showToast(`Stok ${menu.nama} hanya tersisa ${menu.stok}.`);
      return;
    }
    existing.qty++;
  } else {
    cart.push({ id: menu.id, nama: menu.nama, harga: menu.harga, qty: 1, kategori: menu.kategori });
  }
  renderCart();
  showToast(`${menu.nama} ditambahkan ke keranjang.`);
}

/** Ubah qty item di keranjang (delta: +1 atau -1) */
function changeQty(menuId, delta) {
  const idx  = cart.findIndex(c => c.id === menuId);
  if (idx < 0) return;
  const menu = appMenu.find(m => m.id === menuId);

  cart[idx].qty += delta;

  // Batasi atas dengan stok
  if (menu && cart[idx].qty > menu.stok) cart[idx].qty = menu.stok;

  // Hapus jika qty jadi 0 atau kurang
  if (cart[idx].qty <= 0) cart.splice(idx, 1);

  renderCart();
}

/** Hapus item dari keranjang */
function removeFromCart(menuId) {
  cart = cart.filter(c => c.id !== menuId);
  renderCart();
}

/** Kosongkan seluruh keranjang */
function clearCart() {
  cart = [];
  renderCart();
}

/** Render tampilan keranjang dan total */
function renderCart() {
  const container = document.getElementById('cart-items');
  const emptyMsg  = document.getElementById('cart-empty');

  // Hapus semua item yang ada (kecuali pesan kosong)
  container.querySelectorAll('.cart-item').forEach(el => el.remove());

  if (cart.length === 0) {
    emptyMsg.classList.remove('hidden');
    document.getElementById('btn-bayar').disabled = true;
    setCartTotal(0);
    return;
  }

  emptyMsg.classList.add('hidden');

  let total = 0;
  cart.forEach(item => {
    const sub  = item.harga * item.qty;
    total += sub;

    const div  = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `
      <span class="item-nama">${item.nama}</span>
      <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
      <span class="qty-val">${item.qty}</span>
      <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
      <span class="item-subtotal">${formatRp(sub)}</span>
      <button class="btn-remove" onclick="removeFromCart(${item.id})" title="Hapus">✕</button>
    `;
    container.appendChild(div);
  });

  document.getElementById('btn-bayar').disabled = false;
  setCartTotal(total);
}

/** Update tampilan total keranjang */
function setCartTotal(total) {
  document.getElementById('cart-subtotal').textContent = formatRp(total);
  document.getElementById('cart-total').textContent    = formatRp(total);
}

/* ──── Proses Bayar ──────────────────────────────────────── */

/**
 * Simpan transaksi, kurangi stok, tampilkan struk.
 */
function bayar() {
  if (cart.length === 0) return;

  const now      = new Date();
  const tanggal  = now.toISOString().slice(0, 10);   // YYYY-MM-DD
  const waktu    = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  let total = 0;
  const struks = [];

  // Buat entri transaksi untuk setiap item keranjang
  cart.forEach(item => {
    const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    appTransaksi.push({
      id:          txId,
      tanggal:     tanggal,
      menu:        item.nama,
      kategori:    item.kategori,
      jumlah:      item.qty,
      harga_satuan: item.harga
    });

    // Kurangi stok
    const menuRef = appMenu.find(m => m.id === item.id);
    if (menuRef) menuRef.stok -= item.qty;

    const sub = item.harga * item.qty;
    total += sub;
    struks.push({ nama: item.nama, qty: item.qty, sub });
  });

  // Simpan ke localStorage
  saveToStorage();

  // Tampilkan struk
  tampilStruk(struks, total, waktu, tanggal);

  // Kosongkan keranjang & refresh grid (stok berubah)
  cart = [];
  renderMenuGrid();
  renderCart();
}

/** Tampilkan modal struk */
function tampilStruk(struks, total, waktu, tanggal) {
  const itemsEl = document.getElementById('struk-items');
  itemsEl.innerHTML = '';

  struks.forEach(s => {
    itemsEl.innerHTML += `
      <div class="struk-row">
        <span class="nama">${s.nama} x${s.qty}</span>
        <span class="subtotal">${formatRp(s.sub)}</span>
      </div>`;
  });

  document.getElementById('struk-total').textContent = formatRp(total);
  document.getElementById('struk-waktu').textContent =
    `${tanggal.split('-').reverse().join('/')}  •  ${waktu}`;

  document.getElementById('modal-struk').classList.remove('hidden');
}

/** Tutup modal struk dan refresh dashboard jika terbuka */
function closeStruk() {
  document.getElementById('modal-struk').classList.add('hidden');
  // Jika dashboard terbuka, perbarui
  if (!document.getElementById('view-dashboard').classList.contains('hidden')) {
    updateDashboard();
  }
}

/* ──────────────────────────────────────────────────────────
   MODUL MENU & STOK
   ────────────────────────────────────────────────────────── */

/** Render tabel seluruh menu */
function renderStokTable() {
  const tbody = document.getElementById('stok-table-body');
  tbody.innerHTML = '';

  appMenu.forEach((m, idx) => {
    const rendah = m.stok <= 5;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-gray-400 text-xs">${idx + 1}</td>
      <td class="font-semibold text-gray-700">${m.nama}</td>
      <td><span class="badge-kategori badge-${m.kategori} text-xs px-2 py-0.5 rounded-full font-semibold">${m.kategori}</span></td>
      <td class="text-right font-semibold text-kopi-dark">${formatRp(m.harga)}</td>
      <td class="text-center font-bold ${rendah ? 'text-red-600' : 'text-gray-700'}">${m.stok}</td>
      <td class="text-center">
        ${rendah
          ? `<span class="badge-stok-low">⚠ Menipis</span>`
          : `<span class="badge-stok-ok">✓ Tersedia</span>`}
      </td>
      <td class="text-center">
        <div class="flex gap-1.5 justify-center">
          <button class="btn-edit" onclick="openEditMenuModal(${m.id})">✏ Edit</button>
          <button class="btn-hapus" onclick="hapusMenu(${m.id})">🗑 Hapus</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ──── Modal Tambah/Edit Menu ────────────────────────────── */

/** Buka modal untuk tambah menu baru */
function openAddMenuModal() {
  document.getElementById('modal-menu-title').textContent = '➕ Tambah Menu';
  document.getElementById('menu-edit-id').value = '';
  document.getElementById('form-menu').reset();
  document.getElementById('modal-menu').classList.remove('hidden');
}

/** Buka modal untuk edit menu yang ada */
function openEditMenuModal(id) {
  const menu = appMenu.find(m => m.id === id);
  if (!menu) return;

  document.getElementById('modal-menu-title').textContent = '✏ Edit Menu';
  document.getElementById('menu-edit-id').value    = menu.id;
  document.getElementById('menu-nama').value       = menu.nama;
  document.getElementById('menu-kategori').value   = menu.kategori;
  document.getElementById('menu-harga').value      = menu.harga;
  document.getElementById('menu-stok').value       = menu.stok;
  document.getElementById('modal-menu').classList.remove('hidden');
}

/** Tutup modal menu */
function closeMenuModal() {
  document.getElementById('modal-menu').classList.add('hidden');
}

/**
 * Simpan menu baru atau perubahan edit.
 * Dipanggil dari form onsubmit.
 */
function saveMenu(e) {
  e.preventDefault();

  const editId = document.getElementById('menu-edit-id').value;
  const nama   = document.getElementById('menu-nama').value.trim();
  const kat    = document.getElementById('menu-kategori').value;
  const harga  = parseInt(document.getElementById('menu-harga').value);
  const stok   = parseInt(document.getElementById('menu-stok').value);

  if (!nama || !kat || isNaN(harga) || isNaN(stok)) return;

  if (editId) {
    // Mode edit: perbarui data yang ada
    const menu = appMenu.find(m => m.id === parseInt(editId));
    if (menu) {
      menu.nama    = nama;
      menu.kategori = kat;
      menu.harga   = harga;
      menu.stok    = stok;
    }
    showToast(`Menu "${nama}" berhasil diperbarui.`);
  } else {
    // Mode tambah: buat id unik baru
    const newId = appMenu.length > 0 ? Math.max(...appMenu.map(m => m.id)) + 1 : 1;
    appMenu.push({ id: newId, nama, kategori: kat, harga, stok });
    showToast(`Menu "${nama}" berhasil ditambahkan.`);
  }

  saveToStorage();
  closeMenuModal();
  renderStokTable();
  renderMenuGrid();      // perbarui grid Kasir juga
}

/** Hapus menu (dengan konfirmasi) */
function hapusMenu(id) {
  const menu = appMenu.find(m => m.id === id);
  if (!menu) return;
  if (!confirm(`Hapus menu "${menu.nama}"? Aksi ini tidak bisa dibatalkan.`)) return;

  appMenu = appMenu.filter(m => m.id !== id);
  // Hapus juga dari keranjang jika ada
  cart    = cart.filter(c => c.id !== id);

  saveToStorage();
  renderStokTable();
  renderMenuGrid();
  renderCart();
  showToast(`Menu "${menu.nama}" dihapus.`);
}

/* ──────────────────────────────────────────────────────────
   MODUL DASHBOARD
   ────────────────────────────────────────────────────────── */

/** Entry point – ambil filter, filter data, update semua komponen dashboard */
function updateDashboard() {
  const katFilter  = document.getElementById('filter-kategori').value;
  const periodeVal = parseInt(document.getElementById('filter-periode').value);

  // Ambil rentang tanggal
  const dateTo   = getTodayStr();
  const dateFrom = getDateNDaysAgo(periodeVal - 1);

  // Filter transaksi berdasarkan periode dan kategori
  const filtered = appTransaksi.filter(t => {
    const inRange = t.tanggal >= dateFrom && t.tanggal <= dateTo;
    const inKat   = katFilter === 'Semua' || t.kategori === katFilter;
    return inRange && inKat;
  });

  updateKPI(filtered);
  renderChartTrend(filtered, dateFrom, dateTo);
  renderChartKategori(filtered);
  renderChartTop5(filtered);
  renderChartHari(filtered);
  renderInsight(filtered);
}

/* ──── KPI ───────────────────────────────────────────────── */

/** Hitung dan tampilkan 4 KPI cards */
function updateKPI(data) {
  const revenue = data.reduce((sum, t) => sum + t.jumlah * t.harga_satuan, 0);
  const txCount = data.length;

  // Menu terlaris (berdasarkan jumlah terjual)
  const menuQty = {};
  data.forEach(t => { menuQty[t.menu] = (menuQty[t.menu] || 0) + t.jumlah; });
  const terlaris = Object.entries(menuQty).sort((a,b) => b[1]-a[1])[0];

  const avg = txCount > 0 ? revenue / txCount : 0;

  document.getElementById('kpi-revenue').textContent  = formatRp(revenue);
  document.getElementById('kpi-tx').textContent       = txCount;
  document.getElementById('kpi-terlaris').textContent = terlaris ? terlaris[0] : '-';
  document.getElementById('kpi-avg').textContent      = formatRp(Math.round(avg));
}

/* ──── Chart: Sales Trend (Line) ─────────────────────────── */

function renderChartTrend(data, dateFrom, dateTo) {
  // Buat array semua tanggal dalam range
  const labels = [];
  const cur    = new Date(dateFrom);
  const end    = new Date(dateTo);
  while (cur <= end) {
    labels.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  // Hitung revenue per hari
  const revenueMap = {};
  data.forEach(t => {
    revenueMap[t.tanggal] = (revenueMap[t.tanggal] || 0) + t.jumlah * t.harga_satuan;
  });

  const values   = labels.map(d => revenueMap[d] || 0);
  const labelsFmt = labels.map(d => {
    const [y,m,day] = d.split('-');
    return `${day}/${m}`;
  });

  destroyChart('chart-trend');
  const ctx = document.getElementById('chart-trend').getContext('2d');
  charts['chart-trend'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labelsFmt,
      datasets: [{
        label: 'Pendapatan (Rp)',
        data: values,
        fill: true,
        backgroundColor: 'rgba(111,78,55,0.08)',
        borderColor: '#6F4E37',
        pointBackgroundColor: '#C8964E',
        pointRadius: 3,
        tension: 0.4
      }]
    },
    options: chartOptions({ prefix: 'Rp ', compact: true })
  });
}

/* ──── Chart: Revenue per Kategori (Doughnut) ───────────── */

function renderChartKategori(data) {
  const katMap = {};
  data.forEach(t => {
    katMap[t.kategori] = (katMap[t.kategori] || 0) + t.jumlah * t.harga_satuan;
  });

  const labels = Object.keys(katMap);
  const values = Object.values(katMap);

  destroyChart('chart-kategori');
  const ctx = document.getElementById('chart-kategori').getContext('2d');
  charts['chart-kategori'] = new Chart(ctx, {
    type: 'polarArea',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['rgba(111,78,55,0.75)', 'rgba(200,150,78,0.75)', 'rgba(232,221,204,0.85)'],
        borderColor:     ['#6F4E37', '#C8964E', '#C8A882'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, padding: 12, color: '#374151' }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatRp(ctx.raw)}`
          }
        }
      },
      scales: {
        r: {
          ticks: {
            font: { size: 10 },
            color: '#9CA3AF',
            backdropColor: 'transparent',
            callback: v => shortNum(v)
          },
          grid: { color: '#F3EDE5' },
          pointLabels: { display: false }
        }
      }
    }
  });
}

/* ──── Chart: Top 5 Menu (Bar Horizontal) ───────────────── */

function renderChartTop5(data) {
  const menuQty = {};
  data.forEach(t => { menuQty[t.menu] = (menuQty[t.menu] || 0) + t.jumlah; });

  const sorted = Object.entries(menuQty).sort((a,b) => b[1]-a[1]).slice(0, 5);
  const labels = sorted.map(([n]) => n);
  const values = sorted.map(([,v]) => v);

  destroyChart('chart-top5');
  const ctx = document.getElementById('chart-top5').getContext('2d');
  charts['chart-top5'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Jumlah Terjual',
        data: values,
        backgroundColor: '#6F4E37',
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      ...chartOptions({ suffix: ' porsi' }),
      indexAxis: 'y'
    }
  });
}

/* ──── Chart: Transaksi per Hari Seminggu (Bar) ─────────── */

function renderChartHari(data) {
  const hariNama = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const counts   = Array(7).fill(0);

  data.forEach(t => {
    const day = new Date(t.tanggal + 'T00:00:00').getDay(); // 0=Minggu
    counts[day]++;
  });

  destroyChart('chart-hari');
  const ctx = document.getElementById('chart-hari').getContext('2d');
  charts['chart-hari'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: hariNama,
      datasets: [{
        label: 'Jumlah Transaksi',
        data: counts,
        backgroundColor: counts.map((v, i) => {
          const max = Math.max(...counts);
          return v === max ? '#C8964E' : '#6F4E37';
        }),
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: chartOptions({ suffix: ' tx' })
  });
}

/* ──── Helper: default Chart.js options ─────────────────── */

/**
 * Opsi Chart.js default yang konsisten.
 * @param {Object} opts - { prefix, suffix, compact }
 */
function chartOptions({ prefix = '', suffix = '', compact = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => {
            const val = compact ? shortNum(ctx.raw) : ctx.raw.toLocaleString('id-ID');
            return ` ${prefix}${val}${suffix}`;
          }
        }
      }
    },
    scales: {
      x: { grid: { color: '#F3EDE5' }, ticks: { font: { size: 11 } } },
      y: {
        grid: { color: '#F3EDE5' },
        ticks: {
          font: { size: 11 },
          callback: v => compact ? shortNum(v) : v.toLocaleString('id-ID')
        }
      }
    }
  };
}

/** Hancurkan instance chart sebelumnya agar canvas bisa dipakai ulang */
function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

/* ──── Insight Otomatis ─────────────────────────────────── */

/**
 * Hasilkan teks insight dari data transaksi yang difilter.
 */
function renderInsight(data) {
  const panel = document.getElementById('insight-panel');
  panel.innerHTML = '';

  const insights = [];

  // 1. Hari dengan pendapatan terendah
  const revPerDay = {};
  data.forEach(t => {
    revPerDay[t.tanggal] = (revPerDay[t.tanggal] || 0) + t.jumlah * t.harga_satuan;
  });
  const days = Object.entries(revPerDay);
  if (days.length > 0) {
    const [lowestDate, lowestRev] = days.sort((a,b) => a[1]-b[1])[0];
    insights.push({
      icon: '📉',
      text: `Pendapatan terendah terjadi pada <strong>${formatTanggal(lowestDate)}</strong> dengan total <strong>${formatRp(lowestRev)}</strong>. Pertimbangkan promo di hari tersebut.`
    });
  }

  // 2. Menu yang penjualannya menurun dalam 7 hari terakhir vs sebelumnya
  const today   = getTodayStr();
  const d7ago   = getDateNDaysAgo(6);
  const d14ago  = getDateNDaysAgo(13);

  const qtyLast7 = {}; const qtyPrev7 = {};
  appTransaksi.forEach(t => {
    if (t.tanggal >= d7ago  && t.tanggal <= today)  qtyLast7[t.menu] = (qtyLast7[t.menu] || 0) + t.jumlah;
    if (t.tanggal >= d14ago && t.tanggal < d7ago)   qtyPrev7[t.menu] = (qtyPrev7[t.menu] || 0) + t.jumlah;
  });

  const declining = Object.keys(qtyLast7).filter(name => {
    return qtyPrev7[name] && qtyLast7[name] < qtyPrev7[name];
  });

  if (declining.length > 0) {
    insights.push({
      icon: '⬇️',
      text: `Menu yang penjualannya <strong>menurun</strong> 7 hari terakhir: <strong>${declining.join(', ')}</strong>. Pertimbangkan diskon atau promosi untuk menu ini.`
    });
  }

  // 3. Stok menipis (≤ 5)
  const stokRendah = appMenu.filter(m => m.stok <= 5 && m.stok > 0).map(m => m.nama);
  const habis      = appMenu.filter(m => m.stok === 0).map(m => m.nama);

  if (stokRendah.length > 0) {
    insights.push({
      icon: '⚠️',
      text: `Stok menipis (≤ 5): <strong>${stokRendah.join(', ')}</strong>. Segera lakukan pengadaan bahan.`
    });
  }
  if (habis.length > 0) {
    insights.push({
      icon: '🚫',
      text: `Stok <strong>habis</strong>: <strong>${habis.join(', ')}</strong>. Menu ini tidak dapat dijual.`
    });
  }

  // 4. Rekomendasi stok/promo berdasarkan menu terlaris
  const menuQtyAll = {};
  data.forEach(t => { menuQtyAll[t.menu] = (menuQtyAll[t.menu] || 0) + t.jumlah; });
  const top1 = Object.entries(menuQtyAll).sort((a,b) => b[1]-a[1])[0];
  if (top1) {
    insights.push({
      icon: '🌟',
      text: `<strong>${top1[0]}</strong> adalah menu terlaris dengan <strong>${top1[1]} porsi</strong> terjual. Pastikan stok selalu cukup dan pertimbangkan paket bundling untuk meningkatkan nilai transaksi.`
    });
  }

  // Tampilkan semua insight
  if (insights.length === 0) {
    panel.innerHTML = '<p class="text-gray-400 text-sm">Belum cukup data untuk menghasilkan insight.</p>';
    return;
  }

  insights.forEach(({ icon, text }) => {
    panel.innerHTML += `
      <div class="insight-item">
        <span class="insight-icon">${icon}</span>
        <p class="insight-text">${text}</p>
      </div>`;
  });
}

/* ──────────────────────────────────────────────────────────
   UTILITIES
   ────────────────────────────────────────────────────────── */

/** Format angka ke Rupiah: 15000 → "Rp 15.000" */
function formatRp(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

/** Format tanggal ISO ke DD/MM/YYYY */
function formatTanggal(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Kembalikan tanggal hari ini dalam format YYYY-MM-DD */
function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Kembalikan tanggal n hari yang lalu dalam format YYYY-MM-DD */
function getDateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Singkat angka besar untuk label chart (e.g. 150000 → "150rb") */
function shortNum(val) {
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'jt';
  if (val >= 1_000)     return (val / 1_000).toFixed(0) + 'rb';
  return val;
}

/** Tampilkan toast notification singkat */
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

/* ──────────────────────────────────────────────────────────
   JALANKAN APLIKASI
   ────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
