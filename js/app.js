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
  if (id === 'import') loadLoginUsers();
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
  document.getElementById('brandSub').textContent = (b.settings.unitName || '') + ' · ' + (b.settings.unitSub || '');
  document.getElementById('dashSub').textContent = b.settings.unitName || '';
  var link = document.getElementById('sheetLink');
  if (link) {
    link.textContent = 'ส่งออกข้อมูลสำรอง (JSON)';
    link.onclick = function (e) { e.preventDefault(); exportBackup(); };
  }
  fillSelect('itemCatFilter', ['ทั้งหมด'].concat(b.categories || []), true);
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
  setStatus('กำลังโหลดข้อมูล...');
  api('bootstrap').then(function (b) {
    applyBoot(b);
    if (b.imported) {
      setStatus('');
      loadItems();
      return;
    }
    setStatus('กำลังนำเข้ายาและเวชภัณฑ์จากไฟล์เดิม กรุณารอสักครู่...');
    return api('importSeed', { force: false }).then(function (r) {
      toast(r.message || 'นำเข้าแล้ว');
      setStatus(r.message || 'นำเข้าแล้ว');
      return api('bootstrap').then(function (b2) {
        applyBoot(b2);
        setStatus('');
        loadItems();
        showStock('MAIN');
      });
    });
  }).catch(function (e) {
    var msg = (e && e.message) ? e.message : String(e);
    setStatus('โหลดข้อมูลไม่สำเร็จ: ' + msg, true);
    toast(msg);
  });
}

function fillSelect(id, arr, withBlank) {
  var el = document.getElementById(id);
  var keep = el.value;
  el.innerHTML = '';
  (withBlank ? [''].concat(arr.filter(function (x) { return x !== 'ทั้งหมด'; })) : arr).forEach(function (v) {
    var o = document.createElement('option');
    o.value = v === 'ทั้งหมด' ? '' : v;
    o.textContent = v || 'ทั้งหมด';
    el.appendChild(o);
  });
  if (keep) el.value = keep;
}

function renderDash(b) {
  var d = b.dashboard;
  document.getElementById('kpis').innerHTML =
    kpi('มูลค่ารวม', money(d.totalValue) + ' ฿', 'คลังหลัก + ตู้ข้างนอก') +
    kpi('คลังหลัก', money(d.mainValue) + ' ฿', 'รับเข้าจากโรงพยาบาล') +
    kpi('ตู้ข้างนอก', money(d.cabinetValue) + ' ฿', d.transferCount + ' ครั้งที่เบิก') +
    kpi('รายการในทะเบียน', String(b.itemCount || 0), (d.receiptCount || 0) + ' ใบรับเข้า');
  document.getElementById('valueCats').innerHTML = '<h3>มูลค่าแยกหมวด</h3>' + d.byValue.map(function (x) {
    return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>' + x.category + '</span><b>' + money(x.value) + '</b></div>';
  }).join('');
  document.getElementById('dashExpiry').innerHTML = d.expiry.length
    ? '<table><tr><th>รายการ</th><th>ที่เก็บ</th><th>หมดอายุ</th><th class="right">คงเหลือ</th></tr>' + d.expiry.map(function (x) {
      return '<tr><td>' + x.name + '</td><td>' + x.location + '</td><td><span class="pill warn">' + x.expiry + '</span></td><td class="right">' + x.qty + '</td></tr>';
    }).join('') + '</table>'
    : 'ไม่มีรายการใกล้หมดอายุ';
  var rec = (b.recentReceipts || []).map(function (r) { return 'รับเข้า ' + (r.number || r.id) + ' · ' + money(r.totalValue) + ' ฿'; });
  var tr = (b.recentTransfers || []).map(function (r) { return 'เบิกตู้ ' + r.id + ' · ' + money(r.totalValue) + ' ฿'; });
  document.getElementById('dashRecent').innerHTML = (rec.concat(tr).slice(0, 8).join('<br>') || 'ยังไม่มีรายการ');
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
  var html = '<tr><th>ชื่อ</th><th>หมวด</th><th>บรรจุ</th><th class="right">ราคา</th><th></th></tr>';
  html += rows.map(function (i) {
    return '<tr><td>' + esc(i.name) + (i.code ? '<div class="muted">' + esc(i.code) + '</div>' : '') + '</td><td>' + esc(i.category) + '</td><td>' + esc(i.packSize) + '</td><td class="right">' + money(i.unitPrice) + '</td><td><button class="btn ghost" onclick="openItem(\'' + i.id + '\')">แก้</button></td></tr>';
  }).join('');
  document.getElementById('itemTable').innerHTML = html || '<tr><td>ยังไม่มีรายการ</td></tr>';
}
function openItem(id) {
  var it = (STATE.items || []).filter(function (x) { return x.id === id; })[0] || {};
  document.getElementById('itId').value = it.id || '';
  document.getElementById('itName').value = it.name || '';
  document.getElementById('itCode').value = it.code || '';
  document.getElementById('itCat').value = it.category || 'ยาเม็ด';
  document.getElementById('itValCat').value = it.valueCategory || 'ยา';
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
    toast('บันทึกรายการแล้ว');
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
  var html = '<tr><th>รายการ</th><th>หมวด</th><th>บรรจุ</th><th class="right">คงเหลือ</th><th class="right">ราคา</th><th class="right">มูลค่า</th><th>หมดอายุ</th></tr>';
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
        return '<div onclick="chooseItem(\'' + kind + '\',\'' + i.id + '\')">' + esc(i.name) + ' <span class="muted">' + esc(i.packSize) + ' · ' + money(i.unitPrice) + '</span></div>';
      }).join('') || '<div class="muted">ไม่พบ ใช้ชื่อนี้เป็นรายการใหม่ได้</div>';
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
  if (!qtyText) return toast('ใส่จำนวนก่อน');
  var it = STATE.receive.item;
  var line = {
    itemId: it && it.id,
    name: it ? it.name : nameBox,
    packSize: it ? it.packSize : '',
    category: it ? it.category : (document.getElementById('rcKind').value === 'เวชภัณฑ์' ? 'เวชภัณฑ์ที่มิใช่ยา' : 'ยาเม็ด'),
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
  var html = '<tr><th>รายการ</th><th>จำนวน</th><th class="right">ราคา</th><th class="right">เป็นเงิน</th><th>หมดอายุ</th><th></th></tr>';
  html += STATE.receive.lines.map(function (l, i) {
    tot += Number(l.amount || 0);
    return '<tr><td>' + esc(l.name) + '</td><td>' + esc(l.qtyText) + '</td><td class="right">' + money(l.unitPrice) + '</td><td class="right">' + money(l.amount) + '</td><td>' + (l.expiry || '-') + '</td><td><button class="btn ghost" onclick="STATE.receive.lines.splice(' + i + ',1);renderReceive()">ลบ</button></td></tr>';
  }).join('');
  document.getElementById('rcTable').innerHTML = html;
  document.getElementById('rcCalc').textContent = 'ยอดรวม ' + money(tot) + ' บาท · ' + STATE.receive.lines.length + ' รายการ';
}
function saveReceipt() {
  if (!STATE.receive.lines.length) return toast('ยังไม่มีรายการ');
  api('saveReceipt', {
    number: document.getElementById('rcNumber').value,
    date: document.getElementById('rcDate').value,
    source: document.getElementById('rcSource').value,
    kind: document.getElementById('rcKind').value,
    notes: document.getElementById('rcNotes').value,
    lines: STATE.receive.lines
  }).then(function (r) {
    toast('บันทึกใบรับ ' + r.receipt.id + ' รวม ' + money(r.receipt.totalValue) + ' บาท');
    STATE.receive.lines = [];
    renderReceive();
    loadReceipts();
    loadBootstrap();
  }).catch(function (e) { toast(e.message || String(e)); });
}
function loadReceipts() {
  api('listReceipts').then(function (r) {
    document.getElementById('rcHistory').innerHTML = (r.receipts || []).slice(0, 10).map(function (x) {
      return '<div>' + esc(x.date) + ' · ' + esc(x.number || x.id) + ' · ' + money(x.totalValue) + ' ฿ · ' + esc(x.source) + '</div>';
    }).join('') || 'ยังไม่มี';
  });
}

function loadTransferPick() {
  api('listStock', { location: 'MAIN' }).then(function (r) {
    STATE.pickStock = r.stock || [];
    var html = '<tr><th>รายการ</th><th>บรรจุ</th><th class="right">คงเหลือคลัง</th><th class="right">ราคา</th><th>หมดอายุ</th><th class="right">เบิกครั้งนี้</th></tr>';
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
  document.getElementById('trCalc').textContent = n ? ('เบิก ' + n + ' หน่วย · ' + money(v) + ' บาท') : 'ยังไม่ได้เลือก';
}
function saveTransfer() {
  var lines = [];
  document.querySelectorAll('#trPickTable input[data-sid]').forEach(function (inp) {
    var q = Number(inp.value || 0);
    if (q > 0) lines.push({ stockId: inp.dataset.sid, qty: q });
  });
  if (!lines.length) return toast('ใส่จำนวนที่ต้องการเบิก');
  api('saveTransfer', {
    date: document.getElementById('trDate').value,
    notes: document.getElementById('trNotes').value,
    lines: lines
  }).then(function (r) {
    toast('บันทึกเบิกตู้ ' + r.transfer.id);
    loadTransferPick();
    loadBootstrap();
  }).catch(function (e) { toast(e.message || String(e)); });
}

function loadAdjustStock() {
  var loc = document.getElementById('adjLoc').value;
  var type = document.getElementById('adjType').value;
  api('listStock', { location: loc }).then(function (r) {
    STATE.pickStock = r.stock || [];
    var qtyHead = type === 'COUNT' ? 'ยอดนับจริง' : 'จำนวนใช้ไป';
    var html = '<tr><th>รายการ</th><th>บรรจุ</th><th class="right">คงเหลือ</th><th>' + qtyHead + '</th></tr>';
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
  if (!lines.length) return toast('ยังไม่มีจำนวน');
  api('saveAdjustment', {
    date: document.getElementById('adjDate').value,
    type: type,
    location: document.getElementById('adjLoc').value,
    notes: document.getElementById('adjNotes').value,
    lines: lines
  }).then(function (r) {
    toast('บันทึกแล้ว ' + r.adjustment.id);
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
  document.getElementById('reportOut').textContent = 'กำลังสร้างรายงาน...';
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
  var html = hdr(d.settings, 'แบบฟอร์มเบิกยา', 'ยอดการใช้ยา ' + d.label);
  d.groups.forEach(function (g) {
    html += '<h3>' + esc(g.category) + '</h3><table><tr><th>รายการ</th><th>บรรจุ</th><th class="right">ราคา</th><th class="right">ยกมา</th><th class="right">รับ</th><th class="right">จ่าย</th><th class="right">คงเหลือ</th><th class="right">ขอเบิก</th><th class="right">มูลค่า</th></tr>';
    g.rows.forEach(function (r) {
      html += '<tr><td>' + esc(r.item.name) + '</td><td>' + esc(r.item.packSize) + '</td><td class="right">' + money(r.item.unitPrice) + '</td><td class="right">' + r.opening + '</td><td class="right">' + r.received + '</td><td class="right">' + r.issued + '</td><td class="right"><b>' + r.remain + '</b></td><td class="right">' + r.request + '</td><td class="right">' + money(r.remainValue) + '</td></tr>';
    });
    html += '<tr><td colspan="8" class="right"><b>รวม ' + esc(g.category) + '</b></td><td class="right"><b>' + money(g.totalValue) + '</b></td></tr></table>';
  });
  html += '<p class="right"><b>รวมทั้งสิ้น ' + money(d.grandTotal) + ' บาท</b></p>';
  html += signBlock(d.settings);
  document.getElementById('reportOut').innerHTML = html;
}
function renderMoney(d) {
  var html = hdr(d.settings, 'รายงานยอดยา เวชภัณฑ์ วัสดุทางการแพทย์ คงเหลือ', 'ประจำเดือน ' + d.label);
  html += '<table><tr><th>รายละเอียด</th><th class="right">ยอดยกมา</th><th class="right">ซื้อ</th><th class="right">เบิกจากรพ.</th><th class="right">ใช้ไป</th><th class="right">คงเหลือ</th></tr>';
  d.rows.forEach(function (r) {
    html += '<tr><td>' + esc(r.category) + '</td><td class="right">' + money(r.opening) + '</td><td class="right">' + money(r.buy) + '</td><td class="right">' + money(r.receive) + '</td><td class="right">' + money(r.used) + '</td><td class="right"><b>' + money(r.remain) + '</b></td></tr>';
  });
  html += '</table>' + signBlock(d.settings);
  document.getElementById('reportOut').innerHTML = html;
}
function renderQuarter(d) {
  var html = hdr(d.settings, 'ใบเบิกเวชภัณฑ์มิใช่ยา', 'ประจำ ' + d.label);
  html += '<table><tr><th>ลำดับ</th><th>รายการ</th><th>หน่วย</th><th class="right">เบิกทั้งปี</th><th class="right">คงเหลือ</th><th class="right">จำนวนที่เบิก</th><th class="right">ราคา</th><th class="right">มูลค่า</th></tr>';
  d.rows.forEach(function (r) {
    html += '<tr><td>' + r.no + '</td><td>' + esc(r.item.name) + '</td><td>' + esc(r.item.packSize) + '</td><td class="right">' + r.yearQuota + '</td><td class="right">' + r.remain + '</td><td class="right">' + r.request + '</td><td class="right">' + money(r.item.unitPrice) + '</td><td class="right">' + money(r.amount) + '</td></tr>';
  });
  html += '<tr><td colspan="7" class="right"><b>รวม</b></td><td class="right"><b>' + money(d.total) + '</b></td></tr></table>' + signBlock(d.settings);
  document.getElementById('reportOut').innerHTML = html;
}
function signBlock(s) {
  return '<div class="row" style="margin-top:28px;justify-content:space-around;text-align:center">' +
    '<div>ลงชื่อ ................................ ผู้เบิก<br><br>(' + esc(s.requesterName || '') + ')<br>' + esc(s.requesterPosition || '') + '</div>' +
    '<div>ลงชื่อ ................................ ผู้อนุมัติ<br><br>(' + esc(s.approverName || '................................') + ')<br>ตำแหน่ง ................................</div>' +
    '<div>ลงชื่อ ................................ ผู้จ่าย<br><br>(' + esc(s.issuerName || '................................') + ')<br>ตำแหน่ง ................................</div>' +
    '</div>';
}

function doImport(force) {
  if (force && !confirm('จะล้างสต็อกแล้วดึงจากไฟล์เดิมใหม่ ดำเนินการต่อหรือไม่?')) return;
  document.getElementById('btnImport').disabled = true;
  document.getElementById('importMsg').textContent = 'กำลังนำเข้า อาจใช้เวลาสักครู่...';
  api('importSeed', { force: force }).then(function (r) {
    document.getElementById('importMsg').textContent = r.message || JSON.stringify(r);
    toast(r.message || 'เสร็จแล้ว');
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
  }).then(function () { toast('บันทึกตั้งค่าแล้ว'); loadBootstrap(); });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
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

function loadLoginUsers() {
  api('listUsers').then(function (r) {
    var users = r.users || [];
    var html = users.map(function (u) {
      var safe = esc(u).replace(/'/g, "\'");
      return '<div class="user-row"><span>' + esc(u) + '</span><button class="btn ghost" onclick="removeLoginUser(\'' + safe + '\')">ลบ</button></div>';
    }).join('');
    document.getElementById('userList').innerHTML = html || '<p class="muted">ยังไม่มีผู้ใช้</p>';
  }).catch(function (e) { toast(e.message || String(e)); });
}

function addLoginUser() {
  var name = (document.getElementById('newUserName').value || '').trim();
  if (!name) return toast('กรุณาใส่ Username');
  api('addUser', { username: name }).then(function () {
    document.getElementById('newUserName').value = '';
    toast('เพิ่มผู้ใช้แล้ว');
    loadLoginUsers();
  }).catch(function (e) { toast(e.message || String(e)); });
}

function removeLoginUser(name) {
  if (!confirm('ลบผู้ใช้ ' + name + ' หรือไม่?')) return;
  api('removeUser', { username: name }).then(function () {
    toast('ลบแล้ว');
    loadLoginUsers();
  }).catch(function (e) { toast(e.message || String(e)); });
}

function startApp() {
  loadBootstrap();
}
