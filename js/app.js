var STATE = { boot: null, items: [], stock: [], loc: 'MAIN', receive: { item: null, lines: [] }, pickStock: [] };

function api(name, payload) {
  return DrugAPI.api(name, payload || {});
}
function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(function () { el.style.display = 'none'; }, 3200);
}
function money(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function todayInput() {
  var d = new Date();
  return d.toISOString().slice(0, 10);
}
function showPage(id) {
  document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.page === id); });
  document.getElementById('page-' + id).classList.add('active');
  if (id === 'items') loadItems();
  if (id === 'stock') showStock(STATE.loc);
  if (id === 'receive') loadReceipts();
  if (id === 'transfer') loadTransferPick();
  if (id === 'adjust') loadAdjustStock();
}

document.querySelectorAll('.nav-btn').forEach(function (btn) {
  btn.addEventListener('click', function () { showPage(btn.dataset.page); });
});

function setStatus(msg, isError) {
  var el = document.getElementById('bootStatus');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.background = isError ? 'var(--danger-soft)' : '';
  el.style.color = isError ? 'var(--danger)' : '';
  el.textContent = msg;
}
function applyBoot(b) {
  STATE.boot = b;
  document.getElementById('brandSub').textContent = (b.settings.unitName || '') + ' Â· ' + (b.settings.unitSub || '');
  document.getElementById('dashSub').textContent = b.settings.unitName || '';
  var link = document.getElementById('sheetLink');
  if (link) {
    link.textContent = 'ส่งออกข้อมูลสำรอง (JSON)';
    link.onclick = function (e) {
      e.preventDefault();
      exportBackup();
    };
  }
  fillSelect('itemCatFilter', ['à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”'].concat(b.categories || []), true);
  fillSelect('itCat', b.categories || []);
  fillSelect('itValCat', b.valueCategories || []);
  document.getElementById('stUnit').value = b.settings.unitName || '';
  document.getElementById('stSub').value = b.settings.unitSub || '';
  document.getElementById('stReq').value = b.settings.requesterName || '';
  document.getElementById('stPos').value = b.settings.requesterPosition || '';
  document.getElementById('stIss').value = b.settings.issuerName || '';
  renderDash(b);
  document.getElementById('rcDate').value = todayInput();
  document.getElementById('trDate').value = todayInput();
  document.getElementById('adjDate').value = todayInput();
  var now = new Date();
  document.getElementById('rpMonth').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}
function loadBootstrap() {
  setStatus('à¸à¸³à¸¥à¸±à¸‡à¹‚à¸«à¸¥à¸”à¸‚à¹‰à¸­à¸¡à¸¹à¸¥...');
  api('bootstrap').then(function (b) {
    applyBoot(b);
    if (b.imported) {
      setStatus('');
      loadItems();
      return;
    }
    setStatus('à¸à¸³à¸¥à¸±à¸‡à¸™à¸³à¹€à¸‚à¹‰à¸²à¸¢à¸²à¹à¸¥à¸°à¹€à¸§à¸Šà¸ à¸±à¸“à¸‘à¹Œà¸ˆà¸²à¸à¹„à¸Ÿà¸¥à¹Œà¹€à¸”à¸´à¸¡ à¸à¸£à¸¸à¸“à¸²à¸£à¸­à¸ªà¸±à¸à¸„à¸£à¸¹à¹ˆ...');
    return api('importSeed', { force: false }).then(function (r) {
      toast(r.message || 'à¸™à¸³à¹€à¸‚à¹‰à¸²à¹à¸¥à¹‰à¸§');
      setStatus(r.message || 'à¸™à¸³à¹€à¸‚à¹‰à¸²à¹à¸¥à¹‰à¸§');
      return api('bootstrap').then(function (b2) {
        applyBoot(b2);
        setStatus('');
        loadItems();
        showStock('MAIN');
      });
    });
  }).catch(function (e) {
    var msg = (e && e.message) ? e.message : String(e);
    setStatus('à¹‚à¸«à¸¥à¸”à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ: ' + msg, true);
    toast(msg);
  });
}

function fillSelect(id, arr, withBlank) {
  var el = document.getElementById(id);
  var keep = el.value;
  el.innerHTML = '';
  (withBlank ? [''].concat(arr.filter(function (x) { return x !== 'à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”'; })) : arr).forEach(function (v) {
    var o = document.createElement('option');
    o.value = v === 'à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”' ? '' : v;
    o.textContent = v || 'à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”';
    el.appendChild(o);
  });
  if (keep) el.value = keep;
}

function renderDash(b) {
  var d = b.dashboard;
  document.getElementById('kpis').innerHTML =
    kpi('à¸¡à¸¹à¸¥à¸„à¹ˆà¸²à¸£à¸§à¸¡', money(d.totalValue) + ' à¸¿', 'à¸„à¸¥à¸±à¸‡à¸«à¸¥à¸±à¸ + à¸•à¸¹à¹‰à¸‚à¹‰à¸²à¸‡à¸™à¸­à¸') +
    kpi('à¸„à¸¥à¸±à¸‡à¸«à¸¥à¸±à¸', money(d.mainValue) + ' à¸¿', 'à¸£à¸±à¸šà¹€à¸‚à¹‰à¸²à¸ˆà¸²à¸à¹‚à¸£à¸‡à¸žà¸¢à¸²à¸šà¸²à¸¥') +
    kpi('à¸•à¸¹à¹‰à¸‚à¹‰à¸²à¸‡à¸™à¸­à¸', money(d.cabinetValue) + ' à¸¿', d.transferCount + ' à¸„à¸£à¸±à¹‰à¸‡à¸—à¸µà¹ˆà¹€à¸šà¸´à¸') +
    kpi('à¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸™à¸—à¸°à¹€à¸šà¸µà¸¢à¸™', String(b.itemCount || 0), (d.receiptCount || 0) + ' à¹ƒà¸šà¸£à¸±à¸šà¹€à¸‚à¹‰à¸²');
  document.getElementById('valueCats').innerHTML = '<h3>à¸¡à¸¹à¸¥à¸„à¹ˆà¸²à¹à¸¢à¸à¸«à¸¡à¸§à¸”</h3>' + d.byValue.map(function (x) {
    return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>' + x.category + '</span><b>' + money(x.value) + '</b></div>';
  }).join('');
  document.getElementById('dashExpiry').innerHTML = d.expiry.length
    ? '<table><tr><th>à¸£à¸²à¸¢à¸à¸²à¸£</th><th>à¸—à¸µà¹ˆà¹€à¸à¹‡à¸š</th><th>à¸«à¸¡à¸”à¸­à¸²à¸¢à¸¸</th><th class="right">à¸„à¸‡à¹€à¸«à¸¥à¸·à¸­</th></tr>' + d.expiry.map(function (x) {
      return '<tr><td>' + x.name + '</td><td>' + x.location + '</td><td><span class="pill warn">' + x.expiry + '</span></td><td class="right">' + x.qty + '</td></tr>';
    }).join('') + '</table>'
    : 'à¹„à¸¡à¹ˆà¸¡à¸µà¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸à¸¥à¹‰à¸«à¸¡à¸”à¸­à¸²à¸¢à¸¸';
  var rec = (b.recentReceipts || []).map(function (r) { return 'à¸£à¸±à¸šà¹€à¸‚à¹‰à¸² ' + (r.number || r.id) + ' Â· ' + money(r.totalValue) + ' à¸¿'; });
  var tr = (b.recentTransfers || []).map(function (r) { return 'à¹€à¸šà¸´à¸à¸•à¸¹à¹‰ ' + r.id + ' Â· ' + money(r.totalValue) + ' à¸¿'; });
  document.getElementById('dashRecent').innerHTML = (rec.concat(tr).slice(0, 8).join('<br>') || 'à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸£à¸²à¸¢à¸à¸²à¸£');
}
function kpi(label, value, hint) {
  return '<div class="card kpi"><div class="label">' + label + '</div><div class="value">' + value + '</div><div class="hint">' + hint + '</div></div>';
}

function loadItems() {
  api('listItems').then(function (r) {
    STATE.items = r.items || [];
    renderItems();
  }).catch(function (e) { toast(e.message || String(e)); });
}
function renderItems() {
  var q = (document.getElementById('itemQ').value || '').toLowerCase();
  var cat = document.getElementById('itemCatFilter').value;
  var rows = STATE.items.filter(function (i) {
    return i.active !== '0' &&
      (!cat || i.category === cat) &&
      (!q || (i.name + i.packSize + i.code).toLowerCase().indexOf(q) >= 0);
  });
  var html = '<tr><th>à¸Šà¸·à¹ˆà¸­</th><th>à¸«à¸¡à¸§à¸”</th><th>à¸šà¸£à¸£à¸ˆà¸¸</th><th class="right">à¸£à¸²à¸„à¸²</th><th></th></tr>';
  html += rows.map(function (i) {
    return '<tr><td>' + esc(i.name) + (i.code ? '<div class="muted">' + esc(i.code) + '</div>' : '') + '</td><td>' + esc(i.category) + '</td><td>' + esc(i.packSize) + '</td><td class="right">' + money(i.unitPrice) + '</td><td><button class="btn ghost" onclick="openItem(\'' + i.id + '\')">à¹à¸à¹‰</button></td></tr>';
  }).join('');
  document.getElementById('itemTable').innerHTML = html || '<tr><td>à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸£à¸²à¸¢à¸à¸²à¸£</td></tr>';
}
function openItem(id) {
  var it = (STATE.items || []).filter(function (x) { return x.id === id; })[0] || {};
  document.getElementById('itId').value = it.id || '';
  document.getElementById('itName').value = it.name || '';
  document.getElementById('itCode').value = it.code || '';
  document.getElementById('itCat').value = it.category || 'à¸¢à¸²à¹€à¸¡à¹‡à¸”';
  document.getElementById('itValCat').value = it.valueCategory || 'à¸¢à¸²';
  document.getElementById('itPack').value = it.packSize || '';
  document.getElementById('itForm').value = it.form || '';
  document.getElementById('itPrice').value = it.unitPrice || '';
  document.getElementById('itQuota').value = it.yearQuota || '';
  document.getElementById('itLow').value = it.lowStock || '';
  document.getElementById('itNotes').value = it.notes || '';
  document.getElementById('itemModal').style.display = 'flex';
}
function closeModal() { document.getElementById('itemModal').style.display = 'none'; }
function saveItem() {
  api('saveItem', {
    id: document.getElementById('itId').value,
    name: document.getElementById('itName').value,
    code: document.getElementById('itCode').value,
    category: document.getElementById('itCat').value,
    valueCategory: document.getElementById('itValCat').value,
    packSize: document.getElementById('itPack').value,
    form: document.getElementById('itForm').value,
    unitPrice: document.getElementById('itPrice').value,
    yearQuota: document.getElementById('itQuota').value,
    lowStock: document.getElementById('itLow').value,
    notes: document.getElementById('itNotes').value
  }).then(function () {
    closeModal();
    toast('à¸šà¸±à¸™à¸—à¸¶à¸à¸£à¸²à¸¢à¸à¸²à¸£à¹à¸¥à¹‰à¸§');
    loadItems();
  }).catch(function (e) { toast(e.message || String(e)); });
}

function showStock(loc) {
  STATE.loc = loc;
  document.querySelectorAll('[data-loc]').forEach(function (b) {
    b.className = b.dataset.loc === loc ? 'btn' : 'btn secondary';
  });
  api('listStock', { location: loc }).then(function (r) {
    STATE.stock = r.stock || [];
    renderStock();
  }).catch(function (e) { toast(e.message || String(e)); });
}
function renderStock() {
  var q = (document.getElementById('stockQ').value || '').toLowerCase();
  var rows = STATE.stock.filter(function (s) { return !q || String(s.name).toLowerCase().indexOf(q) >= 0; });
  var html = '<tr><th>à¸£à¸²à¸¢à¸à¸²à¸£</th><th>à¸«à¸¡à¸§à¸”</th><th>à¸šà¸£à¸£à¸ˆà¸¸</th><th class="right">à¸„à¸‡à¹€à¸«à¸¥à¸·à¸­</th><th class="right">à¸£à¸²à¸„à¸²</th><th class="right">à¸¡à¸¹à¸¥à¸„à¹ˆà¸²</th><th>à¸«à¸¡à¸”à¸­à¸²à¸¢à¸¸</th></tr>';
  html += rows.map(function (s) {
    return '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.category) + '</td><td>' + esc(s.packSize) + '</td><td class="right"><b>' + s.qty + '</b></td><td class="right">' + money(s.unitPrice) + '</td><td class="right">' + money(s.amount) + '</td><td>' + (s.nearExpiry ? '<span class="pill warn">' : '') + (s.expiryLabel || '-') + (s.nearExpiry ? '</span>' : '') + '</td></tr>';
  }).join('');
  document.getElementById('stockTable').innerHTML = html;
}

var searchTimer = 0;
function searchPick(kind) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function () {
    var q = document.getElementById(kind + 'Search').value;
    api('searchItems', { q: q }).then(function (r) {
      var box = document.getElementById(kind + 'Suggest');
      box.style.display = 'block';
      box.innerHTML = (r.items || []).map(function (i) {
        return '<div onclick="chooseItem(\'' + kind + '\',\'' + i.id + '\')">' + esc(i.name) + ' <span class="muted">' + esc(i.packSize) + ' Â· ' + money(i.unitPrice) + '</span></div>';
      }).join('') || '<div class="muted">à¹„à¸¡à¹ˆà¸žà¸š à¹ƒà¸Šà¹‰à¸Šà¸·à¹ˆà¸­à¸™à¸µà¹‰à¹€à¸›à¹‡à¸™à¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸«à¸¡à¹ˆà¹„à¸”à¹‰</div>';
      STATE._search = r.items || [];
    });
  }, 220);
}
function chooseItem(kind, id) {
  var it = (STATE._search || []).filter(function (x) { return x.id === id; })[0];
  if (!it) return;
  STATE.receive.item = it;
  document.getElementById(kind + 'Search').value = it.name + ' (' + it.packSize + ')';
  document.getElementById('rcPrice').value = it.unitPrice || 0;
  document.getElementById(kind + 'Suggest').style.display = 'none';
}
function addReceiveLine() {
  var nameBox = document.getElementById('rcSearch').value.trim();
  var qtyText = document.getElementById('rcQty').value.trim();
  if (!qtyText) return toast('à¹ƒà¸ªà¹ˆà¸ˆà¸³à¸™à¸§à¸™à¸à¹ˆà¸­à¸™');
  var it = STATE.receive.item;
  var line = {
    itemId: it && it.id,
    name: it ? it.name : nameBox,
    packSize: it ? it.packSize : '',
    category: it ? it.category : (document.getElementById('rcKind').value === 'à¹€à¸§à¸Šà¸ à¸±à¸“à¸‘à¹Œ' ? 'à¹€à¸§à¸Šà¸ à¸±à¸“à¸‘à¹Œà¸—à¸µà¹ˆà¸¡à¸´à¹ƒà¸Šà¹ˆà¸¢à¸²' : 'à¸¢à¸²à¹€à¸¡à¹‡à¸”'),
    qtyText: qtyText,
    unitPrice: Number(document.getElementById('rcPrice').value || 0),
    expiry: document.getElementById('rcExpiry').value,
    notes: ''
  };
  api('parseQty', { text: qtyText }).then(function (p) {
    line.qty = p.packs;
    line.approvedQty = p.packs;
    line.requestedQty = p.packs;
    line.amount = line.qty * line.unitPrice;
    STATE.receive.lines.push(line);
    STATE.receive.item = null;
    document.getElementById('rcSearch').value = '';
    document.getElementById('rcQty').value = '';
    renderReceive();
  });
}
function renderReceive() {
  var tot = 0;
  var html = '<tr><th>à¸£à¸²à¸¢à¸à¸²à¸£</th><th>à¸ˆà¸³à¸™à¸§à¸™</th><th class="right">à¸£à¸²à¸„à¸²</th><th class="right">à¹€à¸›à¹‡à¸™à¹€à¸‡à¸´à¸™</th><th>à¸«à¸¡à¸”à¸­à¸²à¸¢à¸¸</th><th></th></tr>';
  html += STATE.receive.lines.map(function (l, i) {
    tot += Number(l.amount || 0);
    return '<tr><td>' + esc(l.name) + '</td><td>' + esc(l.qtyText) + '</td><td class="right">' + money(l.unitPrice) + '</td><td class="right">' + money(l.amount) + '</td><td>' + (l.expiry || '-') + '</td><td><button class="btn ghost" onclick="STATE.receive.lines.splice(' + i + ',1);renderReceive()">à¸¥à¸š</button></td></tr>';
  }).join('');
  document.getElementById('rcTable').innerHTML = html;
  document.getElementById('rcCalc').textContent = 'à¸¢à¸­à¸”à¸£à¸§à¸¡ ' + money(tot) + ' à¸šà¸²à¸— Â· ' + STATE.receive.lines.length + ' à¸£à¸²à¸¢à¸à¸²à¸£';
}
function saveReceipt() {
  if (!STATE.receive.lines.length) return toast('à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸£à¸²à¸¢à¸à¸²à¸£');
  api('saveReceipt', {
    number: document.getElementById('rcNumber').value,
    date: document.getElementById('rcDate').value,
    source: document.getElementById('rcSource').value,
    kind: document.getElementById('rcKind').value,
    notes: document.getElementById('rcNotes').value,
    lines: STATE.receive.lines
  }).then(function (r) {
    toast('à¸šà¸±à¸™à¸—à¸¶à¸à¹ƒà¸šà¸£à¸±à¸š ' + r.receipt.id + ' à¸£à¸§à¸¡ ' + money(r.receipt.totalValue) + ' à¸šà¸²à¸—');
    STATE.receive.lines = [];
    renderReceive();
    loadReceipts();
    loadBootstrap();
  }).catch(function (e) { toast(e.message || String(e)); });
}
function loadReceipts() {
  api('listReceipts').then(function (r) {
    document.getElementById('rcHistory').innerHTML = (r.receipts || []).slice(0, 10).map(function (x) {
      return '<div>' + esc(x.date) + ' Â· ' + esc(x.number || x.id) + ' Â· ' + money(x.totalValue) + ' à¸¿ Â· ' + esc(x.source) + '</div>';
    }).join('') || 'à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µ';
  });
}

function loadTransferPick() {
  api('listStock', { location: 'MAIN' }).then(function (r) {
    STATE.pickStock = r.stock || [];
    var html = '<tr><th>à¸£à¸²à¸¢à¸à¸²à¸£</th><th>à¸šà¸£à¸£à¸ˆà¸¸</th><th class="right">à¸„à¸‡à¹€à¸«à¸¥à¸·à¸­à¸„à¸¥à¸±à¸‡</th><th class="right">à¸£à¸²à¸„à¸²</th><th>à¸«à¸¡à¸”à¸­à¸²à¸¢à¸¸</th><th class="right">à¹€à¸šà¸´à¸à¸„à¸£à¸±à¹‰à¸‡à¸™à¸µà¹‰</th></tr>';
    html += STATE.pickStock.map(function (s) {
      return '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.packSize) + '</td><td class="right">' + s.qty + '</td><td class="right">' + money(s.unitPrice) + '</td><td>' + (s.expiryLabel || '-') + '</td><td class="right"><input data-sid="' + s.id + '" type="number" min="0" step="0.01" max="' + s.qty + '" style="width:90px" oninput="sumTransfer()"></td></tr>';
    }).join('');
    document.getElementById('trPickTable').innerHTML = html;
    sumTransfer();
  });
}
function sumTransfer() {
  var n = 0, v = 0;
  document.querySelectorAll('#trPickTable input[data-sid]').forEach(function (inp) {
    var q = Number(inp.value || 0);
    if (!q) return;
    var s = STATE.pickStock.filter(function (x) { return x.id === inp.dataset.sid; })[0];
    n += q; v += q * Number(s.unitPrice || 0);
  });
  document.getElementById('trCalc').textContent = n ? ('à¹€à¸šà¸´à¸ ' + n + ' à¸«à¸™à¹ˆà¸§à¸¢ Â· ' + money(v) + ' à¸šà¸²à¸—') : 'à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¹€à¸¥à¸·à¸­à¸';
}
function saveTransfer() {
  var lines = [];
  document.querySelectorAll('#trPickTable input[data-sid]').forEach(function (inp) {
    var q = Number(inp.value || 0);
    if (q > 0) lines.push({ stockId: inp.dataset.sid, qty: q });
  });
  if (!lines.length) return toast('à¹ƒà¸ªà¹ˆà¸ˆà¸³à¸™à¸§à¸™à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¹€à¸šà¸´à¸');
  api('saveTransfer', {
    date: document.getElementById('trDate').value,
    notes: document.getElementById('trNotes').value,
    lines: lines
  }).then(function (r) {
    toast('à¸šà¸±à¸™à¸—à¸¶à¸à¹€à¸šà¸´à¸à¸•à¸¹à¹‰ ' + r.transfer.id);
    loadTransferPick();
    loadBootstrap();
  }).catch(function (e) { toast(e.message || String(e)); });
}

function loadAdjustStock() {
  var loc = document.getElementById('adjLoc').value;
  var type = document.getElementById('adjType').value;
  api('listStock', { location: loc }).then(function (r) {
    STATE.pickStock = r.stock || [];
    var qtyHead = type === 'COUNT' ? 'à¸¢à¸­à¸”à¸™à¸±à¸šà¸ˆà¸£à¸´à¸‡' : 'à¸ˆà¸³à¸™à¸§à¸™à¹ƒà¸Šà¹‰à¹„à¸›';
    var html = '<tr><th>à¸£à¸²à¸¢à¸à¸²à¸£</th><th>à¸šà¸£à¸£à¸ˆà¸¸</th><th class="right">à¸„à¸‡à¹€à¸«à¸¥à¸·à¸­</th><th>' + qtyHead + '</th></tr>';
    html += STATE.pickStock.map(function (s) {
      return '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.packSize) + '</td><td class="right">' + s.qty + '</td><td><input data-sid="' + s.id + '" type="number" min="0" step="0.01" style="width:110px" ' + (type === 'COUNT' ? 'value="' + s.qty + '"' : '') + '></td></tr>';
    }).join('');
    document.getElementById('adjTable').innerHTML = html;
  });
}
function saveAdjustment() {
  var type = document.getElementById('adjType').value;
  var lines = [];
  document.querySelectorAll('#adjTable input[data-sid]').forEach(function (inp) {
    var n = Number(inp.value || 0);
    if (type === 'COUNT') lines.push({ stockId: inp.dataset.sid, counted: n });
    else if (n > 0) lines.push({ stockId: inp.dataset.sid, qty: n });
  });
  if (!lines.length) return toast('à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸ˆà¸³à¸™à¸§à¸™');
  api('saveAdjustment', {
    date: document.getElementById('adjDate').value,
    type: type,
    location: document.getElementById('adjLoc').value,
    notes: document.getElementById('adjNotes').value,
    lines: lines
  }).then(function (r) {
    toast('à¸šà¸±à¸™à¸—à¸¶à¸à¹à¸¥à¹‰à¸§ ' + r.adjustment.id);
    loadAdjustStock();
    loadBootstrap();
  }).catch(function (e) { toast(e.message || String(e)); });
}

function beMonthKey(isoMonth) {
  var p = isoMonth.split('-');
  return (Number(p[0]) + 543) + '-' + p[1];
}
function runReport(kind) {
  var iso = document.getElementById('rpMonth').value;
  var monthKey = beMonthKey(iso);
  var fn = kind === 'money' ? 'moneyReport' : kind === 'quarter' ? 'quarterReport' : 'monthReport';
  document.getElementById('reportOut').textContent = 'à¸à¸³à¸¥à¸±à¸‡à¸ªà¸£à¹‰à¸²à¸‡à¸£à¸²à¸¢à¸‡à¸²à¸™...';
  api(fn, { monthKey: monthKey }).then(function (data) {
    if (kind === 'money') renderMoney(data);
    else if (kind === 'quarter') renderQuarter(data);
    else renderMonth(data);
  }).catch(function (e) {
    document.getElementById('reportOut').textContent = e.message || String(e);
  });
}
function hdr(s, title, sub) {
  return '<div class="print-only"></div><div style="text-align:center;margin-bottom:12px"><b>' + esc(s.unitName || '') + '</b><div>' + esc(s.unitSub || '') + '</div><h2 style="margin:8px 0 4px">' + title + '</h2><div class="muted">' + sub + '</div></div>';
}
function renderMonth(d) {
  var html = hdr(d.settings, 'à¹à¸šà¸šà¸Ÿà¸­à¸£à¹Œà¸¡à¹€à¸šà¸´à¸à¸¢à¸²', 'à¸¢à¸­à¸”à¸à¸²à¸£à¹ƒà¸Šà¹‰à¸¢à¸² ' + d.label);
  d.groups.forEach(function (g) {
    html += '<h3>' + esc(g.category) + '</h3><table><tr><th>à¸£à¸²à¸¢à¸à¸²à¸£</th><th>à¸šà¸£à¸£à¸ˆà¸¸</th><th class="right">à¸£à¸²à¸„à¸²</th><th class="right">à¸¢à¸à¸¡à¸²</th><th class="right">à¸£à¸±à¸š</th><th class="right">à¸ˆà¹ˆà¸²à¸¢</th><th class="right">à¸„à¸‡à¹€à¸«à¸¥à¸·à¸­</th><th class="right">à¸‚à¸­à¹€à¸šà¸´à¸</th><th class="right">à¸¡à¸¹à¸¥à¸„à¹ˆà¸²</th></tr>';
    g.rows.forEach(function (r) {
      html += '<tr><td>' + esc(r.item.name) + '</td><td>' + esc(r.item.packSize) + '</td><td class="right">' + money(r.item.unitPrice) + '</td><td class="right">' + r.opening + '</td><td class="right">' + r.received + '</td><td class="right">' + r.issued + '</td><td class="right"><b>' + r.remain + '</b></td><td class="right">' + r.request + '</td><td class="right">' + money(r.remainValue) + '</td></tr>';
    });
    html += '<tr><td colspan="8" class="right"><b>à¸£à¸§à¸¡ ' + esc(g.category) + '</b></td><td class="right"><b>' + money(g.totalValue) + '</b></td></tr></table>';
  });
  html += '<p class="right"><b>à¸£à¸§à¸¡à¸—à¸±à¹‰à¸‡à¸ªà¸´à¹‰à¸™ ' + money(d.grandTotal) + ' à¸šà¸²à¸—</b></p>';
  html += signBlock(d.settings);
  document.getElementById('reportOut').innerHTML = html;
}
function renderMoney(d) {
  var html = hdr(d.settings, 'à¸£à¸²à¸¢à¸‡à¸²à¸™à¸¢à¸­à¸”à¸¢à¸² à¹€à¸§à¸Šà¸ à¸±à¸“à¸‘à¹Œ à¸§à¸±à¸ªà¸”à¸¸à¸—à¸²à¸‡à¸à¸²à¸£à¹à¸žà¸—à¸¢à¹Œ à¸„à¸‡à¹€à¸«à¸¥à¸·à¸­', 'à¸›à¸£à¸°à¸ˆà¸³à¹€à¸”à¸·à¸­à¸™ ' + d.label);
  html += '<table><tr><th>à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”</th><th class="right">à¸¢à¸­à¸”à¸¢à¸à¸¡à¸²</th><th class="right">à¸‹à¸·à¹‰à¸­</th><th class="right">à¹€à¸šà¸´à¸à¸ˆà¸²à¸à¸£à¸ž.</th><th class="right">à¹ƒà¸Šà¹‰à¹„à¸›</th><th class="right">à¸„à¸‡à¹€à¸«à¸¥à¸·à¸­</th></tr>';
  d.rows.forEach(function (r) {
    html += '<tr><td>' + esc(r.category) + '</td><td class="right">' + money(r.opening) + '</td><td class="right">' + money(r.buy) + '</td><td class="right">' + money(r.receive) + '</td><td class="right">' + money(r.used) + '</td><td class="right"><b>' + money(r.remain) + '</b></td></tr>';
  });
  html += '</table>' + signBlock(d.settings);
  document.getElementById('reportOut').innerHTML = html;
}
function renderQuarter(d) {
  var html = hdr(d.settings, 'à¹ƒà¸šà¹€à¸šà¸´à¸à¹€à¸§à¸Šà¸ à¸±à¸“à¸‘à¹Œà¸¡à¸´à¹ƒà¸Šà¹ˆà¸¢à¸²', 'à¸›à¸£à¸°à¸ˆà¸³ ' + d.label);
  html += '<table><tr><th>à¸¥à¸³à¸”à¸±à¸š</th><th>à¸£à¸²à¸¢à¸à¸²à¸£</th><th>à¸«à¸™à¹ˆà¸§à¸¢</th><th class="right">à¹€à¸šà¸´à¸à¸—à¸±à¹‰à¸‡à¸›à¸µ</th><th class="right">à¸„à¸‡à¹€à¸«à¸¥à¸·à¸­</th><th class="right">à¸ˆà¸³à¸™à¸§à¸™à¸—à¸µà¹ˆà¹€à¸šà¸´à¸</th><th class="right">à¸£à¸²à¸„à¸²</th><th class="right">à¸¡à¸¹à¸¥à¸„à¹ˆà¸²</th></tr>';
  d.rows.forEach(function (r) {
    html += '<tr><td>' + r.no + '</td><td>' + esc(r.item.name) + '</td><td>' + esc(r.item.packSize) + '</td><td class="right">' + r.yearQuota + '</td><td class="right">' + r.remain + '</td><td class="right">' + r.request + '</td><td class="right">' + money(r.item.unitPrice) + '</td><td class="right">' + money(r.amount) + '</td></tr>';
  });
  html += '<tr><td colspan="7" class="right"><b>à¸£à¸§à¸¡</b></td><td class="right"><b>' + money(d.total) + '</b></td></tr></table>' + signBlock(d.settings);
  document.getElementById('reportOut').innerHTML = html;
}
function signBlock(s) {
  return '<div class="row" style="margin-top:28px;justify-content:space-around;text-align:center">' +
    '<div>à¸¥à¸‡à¸Šà¸·à¹ˆà¸­ ................................ à¸œà¸¹à¹‰à¹€à¸šà¸´à¸<br><br>(' + esc(s.requesterName || '') + ')<br>' + esc(s.requesterPosition || '') + '</div>' +
    '<div>à¸¥à¸‡à¸Šà¸·à¹ˆà¸­ ................................ à¸œà¸¹à¹‰à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´<br><br>(' + esc(s.approverName || '................................') + ')<br>à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡ ................................</div>' +
    '<div>à¸¥à¸‡à¸Šà¸·à¹ˆà¸­ ................................ à¸œà¸¹à¹‰à¸ˆà¹ˆà¸²à¸¢<br><br>(' + esc(s.issuerName || '................................') + ')<br>à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡ ................................</div>' +
    '</div>';
}

function doImport(force) {
  if (force && !confirm('à¸ˆà¸°à¸¥à¹‰à¸²à¸‡à¸ªà¸•à¹‡à¸­à¸à¹à¸¥à¹‰à¸§à¸”à¸¶à¸‡à¸ˆà¸²à¸à¹„à¸Ÿà¸¥à¹Œà¹€à¸”à¸´à¸¡à¹ƒà¸«à¸¡à¹ˆ à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£à¸•à¹ˆà¸­à¸«à¸£à¸·à¸­à¹„à¸¡à¹ˆ?')) return;
  document.getElementById('btnImport').disabled = true;
  document.getElementById('importMsg').textContent = 'à¸à¸³à¸¥à¸±à¸‡à¸™à¸³à¹€à¸‚à¹‰à¸² à¸­à¸²à¸ˆà¹ƒà¸Šà¹‰à¹€à¸§à¸¥à¸²à¸ªà¸±à¸à¸„à¸£à¸¹à¹ˆ...';
  api('importSeed', { force: force }).then(function (r) {
    document.getElementById('importMsg').textContent = r.message || JSON.stringify(r);
    toast(r.message || 'à¹€à¸ªà¸£à¹‡à¸ˆà¹à¸¥à¹‰à¸§');
    loadBootstrap();
  }).catch(function (e) {
    document.getElementById('importMsg').textContent = e.message || String(e);
  }).then(function () {
    document.getElementById('btnImport').disabled = false;
  });
}
function saveSettings() {
  api('saveSettings', {
    unitName: document.getElementById('stUnit').value,
    unitSub: document.getElementById('stSub').value,
    requesterName: document.getElementById('stReq').value,
    requesterPosition: document.getElementById('stPos').value,
    issuerName: document.getElementById('stIss').value
  }).then(function () { toast('à¸šà¸±à¸™à¸—à¸¶à¸à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸²à¹à¸¥à¹‰à¸§'); loadBootstrap(); });
}
function exportBackup() {
  var data = DrugAPI.exportData();
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pharma-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('ดาวน์โหลดไฟล์สำรองแล้ว');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
loadBootstrap();
