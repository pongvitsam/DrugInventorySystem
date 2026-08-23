var STATE = {
  boot: null,
  items: [],
  stock: [],
  stockCache: { MAIN: null },
  loc: 'MAIN',
  stockFilter: 'all',
  receive: { item: null, lines: [] },
  ocrReview: [],
  pickStock: [],
  withdrawCart: [],
  reportKind: 'month',
  lastWithdrawId: null
};

function api(name, payload) {
  if (typeof DrugAPI === 'undefined' || !DrugAPI || typeof DrugAPI.api !== 'function') {
    return Promise.reject(new Error('ระบบยังโหลดไม่ครบ กรุณากด Ctrl+F5 แล้วลองใหม่'));
  }
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
  if (id === 'stock') showStock();
  if (id === 'receive') {
    loadReceipts();
    initItemOptionSelects(STATE.items || []);
  }
  if (id === 'withdraw') {
    loadWithdrawPick();
    loadWithdrawHistory();
  }
  if (id === 'import') loadLoginUsers();
  if (id === 'reports') setReportTab(STATE.reportKind || 'month');
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
  var s = b.settings || {};
  document.getElementById('brandSub').textContent = (s.unitName || '') + ' · ' + (s.unitSub || '');
  document.getElementById('dashSub').textContent = s.unitName || '';
  var link = document.getElementById('sheetLink');
  if (link) {
    link.textContent = 'ส่งออกข้อมูลสำรอง (JSON)';
    link.onclick = function (e) { e.preventDefault(); exportBackup(); };
  }
  fillSelect('itemCatFilter', ['ทั้งหมด'].concat(b.categories || []), true);
  fillSelect('itCat', b.categories || []);
  fillSelect('wdCatFilter', ['ทั้งหมด'].concat(b.categories || []), true);
  document.getElementById('stUnit').value = s.unitName || '';
  document.getElementById('stSub').value = s.unitSub || '';
  document.getElementById('stApp').value = s.approverName || '';
  document.getElementById('stAppPos').value = s.approverPosition || '';
  document.getElementById('stReq').value = s.requesterName || '';
  document.getElementById('stPos').value = s.requesterPosition || '';
  document.getElementById('stRecv').value = s.receiverName || '';
  document.getElementById('stRecvPos').value = s.receiverPosition || '';
  document.getElementById('stIss').value = s.issuerName || '';
  document.getElementById('stIssPos').value = s.issuerPosition || '';
  renderDash(b);
  ThDate.set('rcDate', todayInput());
  ThDate.set('wdDate', todayInput());
  var now = new Date();
  ThDate.set('rpMonth', now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'));
  initItemOptionSelects(STATE.items || []);
}
function refreshStockCache(cb) {
  return api('listStockAll').then(function (r) {
    STATE.stockCache.MAIN = r.MAIN || [];
    if (document.getElementById('page-stock').classList.contains('active')) {
      STATE.stock = STATE.stockCache.MAIN || [];
      renderStock();
    }
    if (document.getElementById('page-withdraw').classList.contains('active')) {
      STATE.pickStock = STATE.stockCache.MAIN || [];
      filterWithdrawStock();
    }
    if (cb) cb();
  }).catch(function (e) {
    if (cb) cb(e);
    else toast(e.message || String(e));
  });
}
function refreshAfterMutation() {
  refreshStockCache();
  api('bootstrap').then(function (b) { applyBoot(b); });
}
function loadBootstrap() {
  setStatus('กำลังโหลดข้อมูล...');
  api('bootstrap').then(function (b) {
    applyBoot(b);
    if (b.imported) {
      setStatus('');
      loadItems();
      refreshStockCache();
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
        refreshStockCache();
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
  if (!el) return;
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
    kpi('มูลค่าคลังหลัก', money(d.totalValue) + ' ฿', 'ยอดคงเหลือปัจจุบัน') +
    kpi('ใบรับเข้า', String(d.receiptCount || 0), 'จากโรงพยาบาลในเมือง') +
    kpi('ใบเบิก', String(d.transferCount || 0), 'ออกจากคลังหลัก') +
    kpi('รายการในทะเบียน', String(b.itemCount || 0), 'ยาและเวชภัณฑ์');
  document.getElementById('valueCats').innerHTML = '<h3>มูลค่าแยกหมวด</h3>' + ((d.byValue || []).length
    ? d.byValue.map(function (x) {
      return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>' + esc(x.category) + '</span><b>' + money(x.value) + '</b></div>';
    }).join('')
    : '<div class="muted">ยังไม่มีข้อมูล</div>');
  document.getElementById('dashExpiry').innerHTML = (d.expiry || []).length
    ? '<table><tr><th>รายการ</th><th>หมดอายุ</th><th class="right">คงเหลือ</th></tr>' + d.expiry.map(function (x) {
      return '<tr><td>' + esc(x.name) + '</td><td><span class="pill warn">' + esc(x.expiry) + '</span></td><td class="right">' + x.qty + '</td></tr>';
    }).join('') + '</table>'
    : 'ไม่มีรายการใกล้หมดอายุ';
  var rec = (b.recentReceipts || []).map(function (r) { return 'รับเข้า ' + (r.number || r.id) + ' · ' + money(r.totalValue) + ' ฿'; });
  var tr = (b.recentTransfers || []).map(function (r) { return 'เบิก ' + r.id + ' · ' + money(r.totalValue) + ' ฿'; });
  document.getElementById('dashRecent').innerHTML = (rec.concat(tr).slice(0, 8).join('<br>') || 'ยังไม่มีรายการ');
}
function kpi(label, value, hint) {
  return '<div class="card kpi"><div class="label">' + label + '</div><div class="value">' + value + '</div><div class="hint">' + hint + '</div></div>';
}

function loadItems() {
  api('listItems').then(function (r) {
    STATE.items = r.items || [];
    initItemOptionSelects(STATE.items);
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
  var html = '<tr><th>ชื่อ</th><th>หมวด</th><th>บรรจุ</th><th class="right">ราคา</th><th class="right">คงเหลือ</th><th>ล็อต / วันหมดอายุ</th><th></th></tr>';
  html += rows.map(function (i) {
    var lots = i.lots || [];
    var lotHtml;
    if (!lots.length) {
      lotHtml = '<span class="muted">ไม่มีสต็อก</span>';
    } else {
      lotHtml = '<div class="lot-list">' + lots.map(function (l) {
        var exp = l.expiryLabel || (l.expiry ? ThDate.formatDateLong(l.expiry) : 'ไม่ระบุวันหมดอายุ');
        var pill = l.nearExpiry ? 'pill warn' : 'pill';
        return '<div class="lot-row"><b>' + l.qty + '</b> · <span class="' + pill + '">' + esc(exp) + '</span></div>';
      }).join('') + '</div>';
    }
    return '<tr><td>' + esc(i.name) + (i.code ? '<div class="muted">' + esc(i.code) + '</div>' : '') +
      '</td><td>' + esc(i.category) + '</td><td>' + esc(i.packSize) +
      '</td><td class="right">' + money(i.unitPrice) +
      '</td><td class="right"><b>' + (i.stockQty || 0) + '</b>' +
      (i.stockValue ? '<div class="muted">' + money(i.stockValue) + ' ฿</div>' : '') +
      '</td><td>' + lotHtml +
      '</td><td><button class="btn ghost" onclick="openItem(\'' + i.id + '\')">แก้</button></td></tr>';
  }).join('');
  document.getElementById('itemTable').innerHTML = html || '<tr><td>ยังไม่มีรายการ</td></tr>';
}
function openItem(id) {
  var it = (STATE.items || []).filter(function (x) { return x.id === id; })[0] || {};
  document.getElementById('itId').value = it.id || '';
  document.getElementById('itName').value = it.name || '';
  document.getElementById('itCode').value = it.code || '';
  document.getElementById('itCat').value = it.category || 'ยาเม็ด';
  fillSelectWithCustom('itPack', 'itPackCustom', Options.mergePackFromItems(STATE.items), it.packSize || '');
  fillSelectWithCustom('itForm', 'itFormCustom', Options.mergeFormFromItems(STATE.items), it.form || '');
  document.getElementById('itPrice').value = it.unitPrice || '';
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
    packSize: readSelectWithCustom('itPack', 'itPackCustom'),
    form: readSelectWithCustom('itForm', 'itFormCustom'),
    unitPrice: document.getElementById('itPrice').value,
    notes: document.getElementById('itNotes').value
  }).then(function () {
    closeModal();
    toast('บันทึกรายการแล้ว');
    loadItems();
    refreshStockCache();
  }).catch(function (e) { toast(e.message || String(e)); });
}

var LOW_STOCK_QTY = 10;

function isLowStock(s) {
  return Number(s.qty || 0) > 0 && Number(s.qty || 0) < LOW_STOCK_QTY;
}

function setStockFilter(kind) {
  STATE.stockFilter = kind || 'all';
  document.querySelectorAll('#stockFilters .chip').forEach(function (b) {
    b.classList.toggle('active', b.dataset.sf === STATE.stockFilter);
  });
  renderStock();
}

function showStock() {
  STATE.loc = 'MAIN';
  if (STATE.stockCache.MAIN) {
    STATE.stock = STATE.stockCache.MAIN;
    renderStock();
  }
  api('listStock', { location: 'MAIN' }).then(function (r) {
    STATE.stockCache.MAIN = r.stock || [];
    STATE.stock = STATE.stockCache.MAIN;
    renderStock();
  }).catch(function (e) { toast(e.message || String(e)); });
}

function renderStockAlert(allRows) {
  var box = document.getElementById('stockAlert');
  if (!box) return;
  var byItem = {};
  (allRows || []).forEach(function (s) {
    if (!isLowStock(s)) return;
    var key = s.itemId || s.name;
    if (!byItem[key]) {
      byItem[key] = { name: s.name, packSize: s.packSize, qty: 0, lots: 0, nearExpiry: false };
    }
    byItem[key].qty += Number(s.qty || 0);
    byItem[key].lots += 1;
    if (s.nearExpiry) byItem[key].nearExpiry = true;
  });
  var lows = Object.keys(byItem).map(function (k) { return byItem[k]; })
    .sort(function (a, b) { return a.qty - b.qty; });
  if (!lows.length) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  box.style.display = 'block';
  var chips = lows.slice(0, 8).map(function (x) {
    return '<span class="stock-alert-item"><b>' + esc(x.name) + '</b> เหลือ <em>' + x.qty + '</em>' +
      (x.packSize ? ' · ' + esc(x.packSize) : '') +
      (x.nearExpiry ? ' <span class="pill warn">หมดอายุใกล้</span>' : '') +
      '</span>';
  }).join('');
  var more = lows.length > 8 ? '<span class="muted">และอีก ' + (lows.length - 8) + ' รายการ</span>' : '';
  box.innerHTML =
    '<div class="stock-alert-head">' +
    '<div><strong>เตือนใกล้หมด</strong> พบ <b>' + lows.length + '</b> รายการ คงเหลือน้อยกว่า ' + LOW_STOCK_QTY + '</div>' +
    '<button type="button" class="btn secondary" onclick="setStockFilter(\'low\')">ดูเฉพาะใกล้หมด</button>' +
    '</div>' +
    '<div class="stock-alert-list">' + chips + more + '</div>';
}

function renderStock() {
  var q = (document.getElementById('stockQ').value || '').toLowerCase();
  var filter = STATE.stockFilter || 'all';
  var all = STATE.stock || [];
  renderStockAlert(all);

  var rows = all.filter(function (s) {
    if (q && String(s.name).toLowerCase().indexOf(q) < 0) return false;
    if (filter === 'low' && !isLowStock(s)) return false;
    if (filter === 'expiry' && !s.nearExpiry) return false;
    return true;
  });

  // ใกล้หมด / ใกล้หมดอายุ ขึ้นก่อน
  rows = rows.slice().sort(function (a, b) {
    var al = isLowStock(a) ? 0 : 1;
    var bl = isLowStock(b) ? 0 : 1;
    if (al !== bl) return al - bl;
    var ae = a.nearExpiry ? 0 : 1;
    var be = b.nearExpiry ? 0 : 1;
    if (ae !== be) return ae - be;
    return Number(a.qty || 0) - Number(b.qty || 0);
  });

  var html = '<tr><th>สถานะ</th><th>รายการ</th><th>หมวด</th><th>บรรจุ</th><th class="right">คงเหลือ</th><th class="right">ราคา</th><th class="right">มูลค่า</th><th>หมดอายุ</th></tr>';
  if (!rows.length) {
    html += '<tr><td colspan="8" class="muted">ไม่พบรายการตามเงื่อนไข</td></tr>';
  } else {
    html += rows.map(function (s) {
      var low = isLowStock(s);
      var rowClass = [];
      if (low) rowClass.push('stock-low-row');
      else if (s.fefoRecommend) rowClass.push('fefo-row');
      if (s.nearExpiry) rowClass.push('stock-expiry-row');

      var status = '';
      if (low && Number(s.qty) <= 3) status = '<span class="pill danger">วิกฤต</span>';
      else if (low) status = '<span class="pill warn">ใกล้หมด</span>';
      else if (s.nearExpiry) status = '<span class="pill warn">ใกล้หมดอายุ</span>';
      else status = '<span class="pill">ปกติ</span>';

      var qtyCell = low
        ? '<span class="qty-low">' + s.qty + '</span>'
        : '<b>' + s.qty + '</b>';

      return '<tr class="' + rowClass.join(' ') + '">' +
        '<td>' + status + '</td>' +
        '<td>' + esc(s.name) + '</td>' +
        '<td>' + esc(s.category) + '</td>' +
        '<td>' + esc(s.packSize) + '</td>' +
        '<td class="right">' + qtyCell + '</td>' +
        '<td class="right">' + money(s.unitPrice) + '</td>' +
        '<td class="right">' + money(s.amount) + '</td>' +
        '<td>' + (s.nearExpiry ? '<span class="pill warn">' : '') +
        (s.expiryLabel || (s.expiry ? ThDate.formatDateLong(s.expiry) : '-')) +
        (s.nearExpiry ? '</span>' : '') + '</td></tr>';
    }).join('');
  }
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
  document.getElementById(kind + 'Search').value = it.name;
  document.getElementById('rcPrice').value = it.unitPrice || 0;
  fillSelectWithCustom('rcPack', 'rcPackCustom', Options.mergePackFromItems(STATE.items), it.packSize || '');
  document.getElementById(kind + 'Suggest').style.display = 'none';
}
function addReceiveLine() {
  var nameBox = document.getElementById('rcSearch').value.trim();
  var qty = Number(document.getElementById('rcQty').value || 0);
  var pack = readSelectWithCustom('rcPack', 'rcPackCustom');
  if (!qty || qty <= 0) return toast('ใส่จำนวนก่อน');
  if (!pack) return toast('เลือกหน่วยบรรจุ');
  var it = STATE.receive.item;
  var qtyText = qty + ' × ' + pack;
  var line = {
    itemId: it && it.id,
    name: it ? it.name : nameBox,
    packSize: pack,
    category: it ? it.category : (document.getElementById('rcKind').value === 'เวชภัณฑ์' ? 'เวชภัณฑ์ที่มิใช่ยา' : 'ยาเม็ด'),
    qtyText: qtyText,
    qty: qty,
    approvedQty: qty,
    requestedQty: qty,
    unitPrice: Number(document.getElementById('rcPrice').value || 0),
    expiry: document.getElementById('rcExpiry').value,
    notes: ''
  };
  line.amount = line.qty * line.unitPrice;
  STATE.receive.lines.push(line);
  STATE.receive.item = null;
  document.getElementById('rcSearch').value = '';
  document.getElementById('rcQty').value = '';
  renderReceive();
}
function renderReceive() {
  var tot = 0;
  var html = '<tr><th>รายการ</th><th>จำนวน</th><th>บรรจุ</th><th class="right">ราคา</th><th class="right">เป็นเงิน</th><th>หมดอายุ</th><th></th></tr>';
  html += STATE.receive.lines.map(function (l, i) {
    tot += Number(l.amount || 0);
    return '<tr><td>' + esc(l.name) + '</td><td>' + esc(l.qty) + '</td><td>' + esc(l.packSize) + '</td><td class="right">' + money(l.unitPrice) + '</td><td class="right">' + money(l.amount) + '</td><td>' + (l.expiry ? ThDate.formatDateLong(l.expiry) : '-') + '</td><td><button class="btn ghost" onclick="STATE.receive.lines.splice(' + i + ',1);renderReceive()">ลบ</button></td></tr>';
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
    refreshAfterMutation();
  }).catch(function (e) { toast(e.message || String(e)); });
}
function loadReceipts() {
  api('listReceipts').then(function (r) {
    document.getElementById('rcHistory').innerHTML = (r.receipts || []).slice(0, 10).map(function (x) {
      return '<div>' + esc(ThDate.formatDateLong(x.date)) + ' · ' + esc(x.number || x.id) + ' · ' + money(x.totalValue) + ' ฿ · ' + esc(x.source) + '</div>';
    }).join('') || 'ยังไม่มี';
  });
}

function runBillOcr() {
  var fileInput = document.getElementById('ocrFile');
  var file = fileInput && fileInput.files && fileInput.files[0];
  if (!file) return toast('เลือกไฟล์รูปบิลก่อน');
  var btn = document.getElementById('btnOcrScan');
  if (btn) btn.disabled = true;
  var status = document.getElementById('ocrStatus');
  if (status) { status.style.display = 'block'; status.textContent = 'เตรียมรูป…'; }

  var known = STATE.items && STATE.items.length ? STATE.items : [];
  var chain = known.length ? Promise.resolve(known) : api('listItems').then(function (r) {
    STATE.items = r.items || [];
    return STATE.items;
  });

  chain.then(function (items) {
    return BillOcr.scanFile(file, items);
  }).then(function (parsed) {
    STATE.ocrReview = (parsed.lines || []).map(function (l, i) {
      return Object.assign({ _id: 'ocr' + i }, l, { keep: true });
    });
    if (parsed.receiptNumber && !document.getElementById('rcNumber').value) {
      document.getElementById('rcNumber').value = parsed.receiptNumber;
    }
    renderOcrReview();
    if (!STATE.ocrReview.length) {
      toast('อ่านข้อความได้ แต่ยังแยกรายการไม่ชัด — ลองรูปคมกว่า หรือกรอกมือ');
      var st = document.getElementById('ocrStatus');
      if (st) st.textContent = 'อ่านแล้วแต่แยกแถวไม่เจอชัด — ดูตัวอย่างรูปแล้วกรอกมือ หรือลองใหม่';
    } else {
      toast('พบ ' + STATE.ocrReview.length + ' รายการ — กรุณาตรวจแก้');
    }
  }).catch(function (e) {
    toast(e.message || String(e));
    var st = document.getElementById('ocrStatus');
    if (st) { st.style.display = 'block'; st.textContent = e.message || String(e); }
  }).then(function () {
    if (btn) btn.disabled = false;
  });
}

function renderOcrReview() {
  var rows = STATE.ocrReview || [];
  var card = document.getElementById('ocrReviewCard');
  if (card) card.style.display = rows.length ? 'block' : 'none';
  var html = '<tr><th></th><th>ชื่อ</th><th class="right">จำนวน</th><th>บรรจุ</th><th class="right">ราคา/หน่วย</th><th class="right">เป็นเงิน</th><th>จับคู่ทะเบียน</th></tr>';
  var tot = 0;
  var kept = 0;
  html += rows.map(function (l, i) {
    if (l.keep) {
      kept++;
      tot += Number(l.qty || 0) * Number(l.unitPrice || 0);
    }
    return '<tr class="' + (l.keep ? '' : 'ocr-skip') + '">' +
      '<td><input type="checkbox" ' + (l.keep ? 'checked' : '') + ' onchange="STATE.ocrReview[' + i + '].keep=this.checked;renderOcrReview()"></td>' +
      '<td><input value="' + esc(l.name) + '" onchange="STATE.ocrReview[' + i + '].name=this.value" style="width:100%"></td>' +
      '<td class="right"><input type="number" min="0" step="1" value="' + (l.qty || '') + '" style="width:80px" onchange="updateOcrField(' + i + ',\'qty\',this.value)"></td>' +
      '<td><input value="' + esc(l.packSize || '') + '" style="width:90px" onchange="STATE.ocrReview[' + i + '].packSize=this.value"></td>' +
      '<td class="right"><input type="number" step="0.01" value="' + (l.unitPrice || '') + '" style="width:100px" onchange="updateOcrField(' + i + ',\'unitPrice\',this.value)"></td>' +
      '<td class="right">' + money(Number(l.qty || 0) * Number(l.unitPrice || 0)) + '</td>' +
      '<td>' + (l.matched ? '<span class="pill">ตรงทะเบียน</span>' : '<span class="pill warn">รายการใหม่</span>') + '</td>' +
      '</tr>';
  }).join('');
  document.getElementById('ocrReviewTable').innerHTML = html || '<tr><td>ไม่มีรายการ</td></tr>';
  document.getElementById('ocrReviewCalc').textContent = kept + ' รายการที่เลือก · ' + money(tot) + ' บาท';
}

function updateOcrField(i, key, value) {
  var row = STATE.ocrReview[i];
  if (!row) return;
  if (key === 'qty' || key === 'unitPrice') row[key] = Number(value || 0);
  else row[key] = value;
  row.amount = Number(row.qty || 0) * Number(row.unitPrice || 0);
  renderOcrReview();
}

function clearOcrReview() {
  STATE.ocrReview = [];
  renderOcrReview();
  var preview = document.getElementById('ocrPreview');
  if (preview) { preview.style.display = 'none'; preview.removeAttribute('src'); }
  var status = document.getElementById('ocrStatus');
  if (status) { status.style.display = 'none'; status.textContent = ''; }
  var file = document.getElementById('ocrFile');
  if (file) file.value = '';
}

function confirmOcrReview() {
  var rows = (STATE.ocrReview || []).filter(function (l) { return l.keep && String(l.name || '').trim() && Number(l.qty) > 0; });
  if (!rows.length) return toast('เลือกรายการที่ต้องการอย่างน้อย 1 รายการ');
  var kind = document.getElementById('rcKind').value;
  rows.forEach(function (l) {
    var pack = String(l.packSize || '').trim() || 'กล่อง';
    var qty = Number(l.qty || 0);
    var price = Number(l.unitPrice || 0);
    STATE.receive.lines.push({
      itemId: l.itemId || '',
      name: String(l.name).trim(),
      packSize: pack,
      category: kind === 'เวชภัณฑ์' ? 'เวชภัณฑ์ที่มิใช่ยา' : 'ยาเม็ด',
      qtyText: qty + ' × ' + pack,
      qty: qty,
      approvedQty: qty,
      requestedQty: qty,
      unitPrice: price,
      amount: qty * price,
      expiry: l.expiry || '',
      notes: 'จาก OCR'
    });
  });
  renderReceive();
  clearOcrReview();
  toast('ใส่รายการรับเข้าแล้ว ' + rows.length + ' รายการ — ตรวจวันหมดอายุแล้วบันทึกได้');
}

function loadWithdrawPick() {
  if (STATE.stockCache.MAIN) {
    STATE.pickStock = STATE.stockCache.MAIN;
    filterWithdrawStock();
  }
  api('listStock', { location: 'MAIN' }).then(function (r) {
    STATE.stockCache.MAIN = r.stock || [];
    STATE.pickStock = STATE.stockCache.MAIN;
    filterWithdrawStock();
  });
  renderWithdrawSummary();
}
function filterWithdrawStock() {
  var q = (document.getElementById('wdSearch').value || '').toLowerCase().trim();
  var cat = document.getElementById('wdCatFilter') ? document.getElementById('wdCatFilter').value : '';
  var rows = (STATE.pickStock || []).filter(function (s) {
    if (cat && s.category !== cat) return false;
    if (!q) return true;
    return (String(s.name) + ' ' + String(s.packSize) + ' ' + String(s.category)).toLowerCase().indexOf(q) >= 0;
  });
  renderWithdrawPick(rows);
}
function renderWithdrawPick(rows) {
  rows = rows || STATE.pickStock || [];
  var html = '<tr><th></th><th>รายการ</th><th>หมวด</th><th>บรรจุ</th><th class="right">คงเหลือ</th><th class="right">ราคา</th><th>หมดอายุ</th><th class="right">จำนวน</th><th></th></tr>';
  if (!rows.length) {
    html += '<tr><td colspan="9" class="muted">ไม่พบรายการที่ตรงเงื่อนไข</td></tr>';
  } else {
    html += rows.map(function (s) {
      var tip = s.fefoRecommend ? '<span class="pill warn">แนะนำ</span>' : '';
      var inCart = (STATE.withdrawCart || []).filter(function (c) { return c.stockId === s.id; })[0];
      var defQty = inCart ? inCart.qty : '';
      return '<tr class="' + (s.fefoRecommend ? 'fefo-row' : '') + '">' +
        '<td>' + tip + '</td>' +
        '<td>' + esc(s.name) + '</td>' +
        '<td>' + esc(s.category) + '</td>' +
        '<td>' + esc(s.packSize) + '</td>' +
        '<td class="right">' + s.qty + '</td>' +
        '<td class="right">' + money(s.unitPrice) + '</td>' +
        '<td>' + (s.expiryLabel || '-') + '</td>' +
        '<td class="right"><input id="wdQty_' + s.id + '" type="number" min="1" step="1" max="' + s.qty + '" value="' + defQty + '" style="width:80px"></td>' +
        '<td><button type="button" class="btn" onclick="addWithdrawLine(\'' + s.id + '\')">' + (inCart ? 'อัปเดต' : 'เพิ่ม') + '</button></td>' +
        '</tr>';
    }).join('');
  }
  document.getElementById('wdPickTable').innerHTML = html;
}
function addWithdrawLine(stockId) {
  var s = (STATE.pickStock || []).filter(function (x) { return x.id === stockId; })[0];
  if (!s) return toast('ไม่พบสต็อก');
  var inp = document.getElementById('wdQty_' + stockId);
  var qty = Number(inp && inp.value ? inp.value : 0);
  if (!qty || qty <= 0) return toast('ใส่จำนวนที่ต้องการเบิก');
  if (qty > Number(s.qty) + 1e-9) return toast('จำนวนเกินคงเหลือ (' + s.qty + ')');
  var cart = STATE.withdrawCart || [];
  var existing = cart.filter(function (c) { return c.stockId === stockId; })[0];
  if (existing) {
    existing.qty = qty;
    existing.amount = qty * Number(s.unitPrice || 0);
  } else {
    cart.push({
      stockId: s.id,
      itemId: s.itemId,
      name: s.name,
      category: s.category,
      packSize: s.packSize,
      expiry: s.expiry || '',
      expiryLabel: s.expiryLabel || '-',
      unitPrice: Number(s.unitPrice || 0),
      qty: qty,
      maxQty: Number(s.qty || 0),
      amount: qty * Number(s.unitPrice || 0),
      fefoRecommend: !!s.fefoRecommend
    });
  }
  STATE.withdrawCart = cart;
  renderWithdrawSummary();
  filterWithdrawStock();
  toast('เพิ่ม ' + s.name + ' × ' + qty);
}
function updateWithdrawCartQty(stockId, value) {
  var line = (STATE.withdrawCart || []).filter(function (c) { return c.stockId === stockId; })[0];
  if (!line) return;
  var qty = Number(value || 0);
  if (qty <= 0) {
    removeWithdrawLine(stockId);
    return;
  }
  if (qty > line.maxQty + 1e-9) {
    toast('จำนวนเกินคงเหลือ (' + line.maxQty + ')');
    qty = line.maxQty;
  }
  line.qty = qty;
  line.amount = qty * line.unitPrice;
  renderWithdrawSummary();
}
function removeWithdrawLine(stockId) {
  STATE.withdrawCart = (STATE.withdrawCart || []).filter(function (c) { return c.stockId !== stockId; });
  renderWithdrawSummary();
  filterWithdrawStock();
}
function clearWithdrawCart() {
  STATE.withdrawCart = [];
  renderWithdrawSummary();
  filterWithdrawStock();
}
function renderWithdrawSummary() {
  var cart = STATE.withdrawCart || [];
  var html = '<tr><th>ลำดับ</th><th>รายการ</th><th>บรรจุ</th><th>หมดอายุ</th><th class="right">ราคา</th><th class="right">จำนวน</th><th class="right">มูลค่า</th><th></th></tr>';
  if (!cart.length) {
    html += '<tr><td colspan="8" class="muted">ยังไม่มีรายการ — ค้นหาด้านบนแล้วกดเพิ่ม</td></tr>';
  } else {
    html += cart.map(function (l, i) {
      return '<tr class="' + (l.fefoRecommend ? 'fefo-row' : '') + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(l.name) + (l.fefoRecommend ? ' <span class="pill warn">แนะนำ</span>' : '') + '</td>' +
        '<td>' + esc(l.packSize) + '</td>' +
        '<td>' + esc(l.expiryLabel) + '</td>' +
        '<td class="right">' + money(l.unitPrice) + '</td>' +
        '<td class="right"><input type="number" min="1" step="1" max="' + l.maxQty + '" value="' + l.qty + '" style="width:80px" onchange="updateWithdrawCartQty(\'' + l.stockId + '\', this.value)"></td>' +
        '<td class="right"><b>' + money(l.amount) + '</b></td>' +
        '<td><button type="button" class="btn ghost" onclick="removeWithdrawLine(\'' + l.stockId + '\')">ลบ</button></td>' +
        '</tr>';
    }).join('');
  }
  document.getElementById('wdSummaryTable').innerHTML = html;
  var n = 0, v = 0;
  cart.forEach(function (l) { n += Number(l.qty || 0); v += Number(l.amount || 0); });
  document.getElementById('wdCalc').textContent = cart.length
    ? ('สรุป ' + cart.length + ' รายการ · ' + n + ' หน่วย · ' + money(v) + ' บาท')
    : 'ยังไม่ได้เลือก';
}
function saveWithdraw() {
  var lines = (STATE.withdrawCart || []).filter(function (l) { return Number(l.qty) > 0; })
    .map(function (l) { return { stockId: l.stockId, qty: l.qty }; });
  if (!lines.length) return toast('เพิ่มรายการที่ต้องการเบิกก่อน');
  api('saveTransfer', {
    date: document.getElementById('wdDate').value,
    notes: document.getElementById('wdNotes').value,
    lines: lines
  }).then(function (r) {
    toast('บันทึกใบเบิก ' + r.transfer.id + ' · ' + money(r.transfer.totalValue) + ' บาท');
    STATE.lastWithdrawId = r.transfer.id;
    STATE.withdrawCart = [];
    renderWithdrawSummary();
    loadWithdrawPick();
    loadWithdrawHistory();
    showWithdrawPrint(r.transfer.id);
    refreshAfterMutation();
  }).catch(function (e) { toast(e.message || String(e)); });
}
function loadWithdrawHistory() {
  api('listTransfers').then(function (r) {
    document.getElementById('wdHistory').innerHTML = (r.transfers || []).slice(0, 10).map(function (x) {
      return '<div class="user-row"><span>' + esc(ThDate.formatDateLong(x.date)) + ' · ' + esc(x.id) + ' · ' + money(x.totalValue) + ' ฿</span><button class="btn ghost" onclick="showWithdrawPrint(\'' + x.id + '\')">พิมพ์</button></div>';
    }).join('') || 'ยังไม่มี';
  });
}
function showWithdrawPrint(id) {
  api('getTransfer', { id: id }).then(function (data) {
    var t = data.transfer;
    var s = data.settings || {};
    var html = '<div style="text-align:center;margin-bottom:12px"><b>' + esc(s.unitName || '') + '</b><div>' + esc(s.unitSub || '') + '</div>' +
      '<h2 style="margin:8px 0 4px">ใบเบิกยาและเวชภัณฑ์จากคลังหลัก</h2>' +
      '<div>วันที่ ' + esc(ThDate.formatDateLong(t.date)) + (t.notes ? ' · ' + esc(t.notes) : '') + '</div></div>';
    html += '<table><tr><th>ลำดับ</th><th>รายการ</th><th class="right">ราคา/หน่วย</th><th class="right">จำนวนที่เบิก</th><th class="right">จำนวนที่อนุมัติ</th><th class="right">มูลค่า</th><th>วันหมดอายุ</th><th>หมายเหตุ</th></tr>';
    (data.lines || []).forEach(function (l) {
      html += '<tr><td>' + l.no + '</td><td>' + esc(l.name) + (l.packSize ? '<div class="muted">' + esc(l.packSize) + '</div>' : '') +
        '</td><td class="right">' + money(l.unitPrice) + '</td><td class="right">' + l.qty + '</td><td class="right">' + l.approvedQty +
        '</td><td class="right">' + money(l.amount) + '</td><td>' + esc(l.expiryLabel || '-') + '</td><td></td></tr>';
    });
    html += '<tr><td colspan="5" class="right"><b>รวมทั้งสิ้น</b></td><td class="right"><b>' + money(t.totalValue) + '</b></td><td colspan="2"></td></tr></table>';
    html += signBlock4(s);
    document.getElementById('wdPrintOut').innerHTML = html;
    document.getElementById('wdPrintCard').style.display = 'block';
  }).catch(function (e) { toast(e.message || String(e)); });
}

function beMonthKey(isoMonth) {
  var p = isoMonth.split('-');
  return (Number(p[0]) + 543) + '-' + p[1];
}
function setReportTab(kind) {
  STATE.reportKind = kind;
  document.querySelectorAll('.rp-tab').forEach(function (b) {
    var on = b.dataset.rp === kind;
    b.className = on ? 'btn rp-tab active' : 'btn secondary rp-tab';
  });
}
function runReport(kind) {
  setReportTab(kind);
  var iso = ThDate.get('rpMonth') || document.getElementById('rpMonth').value;
  var monthKey = beMonthKey(iso);
  var fn = kind === 'money' ? 'moneyReport' : 'monthReport';
  document.getElementById('reportOut').textContent = 'กำลังสร้างรายงาน...';
  api(fn, { monthKey: monthKey }).then(function (data) {
    if (kind === 'money') renderMoney(data);
    else renderMonth(data);
  }).catch(function (e) {
    document.getElementById('reportOut').textContent = e.message || String(e);
  });
}
function hdr(s, title, sub) {
  return '<div style="text-align:center;margin-bottom:12px"><b>' + esc(s.unitName || '') + '</b><div>' + esc(s.unitSub || '') + '</div><h2 style="margin:8px 0 4px">' + title + '</h2><div class="muted">' + sub + '</div></div>';
}
function renderMonth(d) {
  var sm = d.summary || {};
  var html = hdr(d.settings, 'สรุปคลังหลักรายเดือน', d.label);
  html += '<div class="cards" style="margin-bottom:14px">' +
    kpi('รับเข้าเดือนนี้', money(sm.receivedValue) + ' ฿', (sm.receivedQty || 0) + ' หน่วย') +
    kpi('เบิกออกเดือนนี้', money(sm.issuedValue) + ' ฿', (sm.issuedQty || 0) + ' หน่วย') +
    kpi('คงเหลือสิ้นเดือน', money(sm.remainValue) + ' ฿', (sm.remainQty || 0) + ' หน่วย') +
    '</div>';
  (d.groups || []).forEach(function (g) {
    html += '<h3>' + esc(g.category) + '</h3><table><tr><th>รายการ</th><th>บรรจุ</th><th class="right">ราคา</th><th class="right">ยกมา</th><th class="right">รับ</th><th class="right">เบิก</th><th class="right">คงเหลือ</th><th class="right">มูลค่า</th></tr>';
    g.rows.forEach(function (r) {
      html += '<tr><td>' + esc(r.item.name) + '</td><td>' + esc(r.item.packSize) + '</td><td class="right">' + money(r.item.unitPrice) + '</td><td class="right">' + r.opening + '</td><td class="right">' + r.received + '</td><td class="right">' + r.issued + '</td><td class="right"><b>' + r.remain + '</b></td><td class="right">' + money(r.remainValue) + '</td></tr>';
    });
    html += '<tr><td colspan="7" class="right"><b>รวม ' + esc(g.category) + '</b></td><td class="right"><b>' + money(g.totalValue) + '</b></td></tr></table>';
  });
  html += '<p class="right"><b>รวมคงเหลือทั้งสิ้น ' + money(d.grandTotal) + ' บาท</b></p>';
  html += signBlock4(d.settings);
  document.getElementById('reportOut').innerHTML = html;
}
function renderMoney(d) {
  var t = d.totals || {};
  var html = hdr(d.settings, 'สรุปมูลค่ารายหมวด', 'ประจำเดือน ' + d.label);
  html += '<div class="cards" style="margin-bottom:14px">' +
    kpi('รับเข้า', money(t.receive) + ' ฿', 'เดือนนี้') +
    kpi('เบิกออก', money(t.used) + ' ฿', 'เดือนนี้') +
    kpi('คงเหลือ', money(t.remain) + ' ฿', 'สิ้นเดือน') +
    '</div>';
  html += '<table><tr><th>หมวด</th><th class="right">ยอดยกมา</th><th class="right">รับเข้า</th><th class="right">เบิกออก</th><th class="right">คงเหลือ</th></tr>';
  (d.rows || []).forEach(function (r) {
    html += '<tr><td>' + esc(r.category) + '</td><td class="right">' + money(r.opening) + '</td><td class="right">' + money(r.receive) + '</td><td class="right">' + money(r.used) + '</td><td class="right"><b>' + money(r.remain) + '</b></td></tr>';
  });
  html += '</table>' + signBlock4(d.settings);
  document.getElementById('reportOut').innerHTML = html;
}
function signBlock4(s) {
  return '<div class="sign-grid">' +
    '<div>ลงชื่อ ................................<br>ผู้อนุมัติ<br><br>(' + esc(s.approverName || '................................') + ')<br>' + esc(s.approverPosition || 'ตำแหน่ง ................................') + '</div>' +
    '<div>ลงชื่อ ................................<br>ผู้เบิก<br><br>(' + esc(s.requesterName || '................................') + ')<br>' + esc(s.requesterPosition || 'ตำแหน่ง ................................') + '</div>' +
    '<div>ลงชื่อ ................................<br>ผู้รับ<br><br>(' + esc(s.receiverName || '................................') + ')<br>' + esc(s.receiverPosition || 'ตำแหน่ง ................................') + '</div>' +
    '<div>ลงชื่อ ................................<br>ผู้จ่าย<br><br>(' + esc(s.issuerName || '................................') + ')<br>' + esc(s.issuerPosition || 'ตำแหน่ง ................................') + '</div>' +
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
    approverName: document.getElementById('stApp').value,
    approverPosition: document.getElementById('stAppPos').value,
    requesterName: document.getElementById('stReq').value,
    requesterPosition: document.getElementById('stPos').value,
    receiverName: document.getElementById('stRecv').value,
    receiverPosition: document.getElementById('stRecvPos').value,
    issuerName: document.getElementById('stIss').value,
    issuerPosition: document.getElementById('stIssPos').value
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
      var safe = esc(u).replace(/'/g, "\\'");
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
  if (typeof DrugAPI === 'undefined') {
    setStatus('โหลดระบบไม่สำเร็จ (api.js) — กด Ctrl+F5 หรือรีเฟรชหน้า', true);
    toast('โหลดระบบไม่สำเร็จ กรุณารีเฟรชหน้า');
    return;
  }
  ThDate.initAll();
  loadBootstrap();
}
