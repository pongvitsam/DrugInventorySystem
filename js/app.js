var STATE = {
  boot: null,
  items: [],
  stock: [],
  stockCache: { MAIN: null },
  loc: 'MAIN',
  stockFilter: 'all',
  receive: { item: null, lines: [] },
  editingReceiptId: null,
  ocrReview: [],
  pickStock: [],
  withdrawCart: [],
  editingWithdrawId: null,
  editWithdrawOrig: {},
  reportKind: 'month',
  lastWithdrawId: null,
  optionLists: { categories: [], packSizes: [], forms: [] },
  lowStockItems: []
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
    updateReceiptEditUI();
    if (!STATE.items || !STATE.items.length) loadItems();
    else initItemOptionSelects(STATE.items);
  }
  if (id === 'withdraw') {
    loadWithdrawPick();
    loadWithdrawHistory();
  }
  if (id === 'import') {
    loadLoginUsers();
    loadLowStockSettings();
  }
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
  fillSelect('wdCatFilter', ['ทั้งหมด'].concat(b.categories || []), true);
  refreshOptionLists();
  bindItemModalOptionSelects();
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
  var stLow = document.getElementById('stDefaultLowStock');
  if (stLow) stLow.value = s.defaultLowStock || '10';
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

function refreshOptionLists() {
  var b = STATE.boot || {};
  var savedPacks = b.packSizes && b.packSizes.length ? b.packSizes : null;
  var savedForms = b.forms && b.forms.length ? b.forms : null;
  STATE.optionLists = {
    categories: (b.categories || []).slice(),
    packSizes: savedPacks || Options.mergePackFromItems(STATE.items || []),
    forms: savedForms || Options.mergeFormFromItems(STATE.items || [])
  };
}

function renderOptionTags() {}

function refillItemModalSelects(opts) {
  opts = opts || {};
  refreshOptionLists();
  fillOptionSelect('itCat', STATE.optionLists.categories, opts.category || 'ยาเม็ด', false);
  fillOptionSelect('itPack', STATE.optionLists.packSizes, opts.packSize || '', true);
  fillOptionSelect('itForm', STATE.optionLists.forms, opts.form || '', true);
  ['itCat', 'itPack', 'itForm'].forEach(hideOptionAddRow);
  document.querySelectorAll('.opt-manage-pop').forEach(function (p) { p.style.display = 'none'; });
}

function persistOptionLists() {
  return api('saveOptionLists', {
    categories: STATE.optionLists.categories,
    packSizes: STATE.optionLists.packSizes,
    forms: STATE.optionLists.forms
  }).then(function (r) {
    if (STATE.boot) {
      STATE.boot.categories = r.categories || STATE.optionLists.categories;
      STATE.boot.packSizes = r.packSizes || STATE.optionLists.packSizes;
      STATE.boot.forms = r.forms || STATE.optionLists.forms;
      if (STATE.boot.settings) {
        STATE.boot.settings.listCategories = JSON.stringify(STATE.optionLists.categories);
        STATE.boot.settings.listPackSizes = JSON.stringify(STATE.optionLists.packSizes);
        STATE.boot.settings.listForms = JSON.stringify(STATE.optionLists.forms);
      }
    }
    fillSelect('itemCatFilter', ['ทั้งหมด'].concat(STATE.optionLists.categories), true);
    fillSelect('wdCatFilter', ['ทั้งหมด'].concat(STATE.optionLists.categories), true);
    initItemOptionSelects(STATE.items || []);
  });
}

function addOptionListItem(listKey, val, selectId) {
  val = String(val || '').trim();
  if (!val) return toast('พิมพ์รายการที่ต้องการเพิ่ม');
  var list = (STATE.optionLists[listKey] || []).slice();
  if (list.some(function (x) { return String(x).toLowerCase() === val.toLowerCase(); })) {
    refillItemModalSelects({
      category: listKey === 'categories' ? val : readOptionSelect('itCat'),
      packSize: listKey === 'packSizes' ? val : readOptionSelect('itPack'),
      form: listKey === 'forms' ? val : readOptionSelect('itForm')
    });
    if (selectId) {
      var sel = document.getElementById(selectId);
      if (sel) { sel.value = val; sel._optPrev = val; }
      hideOptionAddRow(selectId);
    }
    return toast('มีรายการนี้แล้ว');
  }
  list.push(val);
  list.sort(function (a, b) { return String(a).localeCompare(String(b), 'th'); });
  STATE.optionLists[listKey] = list;
  persistOptionLists().then(function () {
    refillItemModalSelects({
      category: listKey === 'categories' ? val : readOptionSelect('itCat'),
      packSize: listKey === 'packSizes' ? val : readOptionSelect('itPack'),
      form: listKey === 'forms' ? val : readOptionSelect('itForm')
    });
    if (selectId) {
      var sel = document.getElementById(selectId);
      if (sel) { sel.value = val; sel._optPrev = val; }
      hideOptionAddRow(selectId);
    }
    toast('เพิ่มรายการแล้ว');
  }).catch(function (e) { toast(e.message || String(e)); });
}

function removeOptionListItem(listKey, index) {
  var list = (STATE.optionLists[listKey] || []).slice();
  var value = list[index];
  if (value == null) return;
  if (list.length <= 1) return toast('ต้องมีอย่างน้อย 1 รายการ');
  if (!confirm('ลบ "' + value + '" จากรายการเลือก?')) return;
  list.splice(index, 1);
  STATE.optionLists[listKey] = list;
  var map = { categories: 'itCat', packSizes: 'itPack', forms: 'itForm' };
  persistOptionLists().then(function () {
    refillItemModalSelects({
      category: readOptionSelect('itCat'),
      packSize: readOptionSelect('itPack'),
      form: readOptionSelect('itForm')
    });
    paintOptionManage(listKey, map[listKey] + 'Manage');
    toast('ลบรายการแล้ว');
  }).catch(function (e) { toast(e.message || String(e)); });
}

function ensureOptionOnSave(listKey, value) {
  value = String(value || '').trim();
  if (!value) return Promise.resolve();
  refreshOptionLists();
  var list = STATE.optionLists[listKey] || [];
  if (list.some(function (x) { return String(x).toLowerCase() === value.toLowerCase(); })) {
    return Promise.resolve();
  }
  list.push(value);
  list.sort(function (a, b) { return String(a).localeCompare(String(b), 'th'); });
  STATE.optionLists[listKey] = list;
  return persistOptionLists();
}

function renderDash(b) {
  var d = b.dashboard;
  document.getElementById('kpis').innerHTML =
    kpi('มูลค่าคลังหลัก', money(d.totalValue) + ' ฿', 'ยอดคงเหลือปัจจุบัน', 'teal') +
    kpi('ใบรับเข้า', String(d.receiptCount || 0), 'จากโรงพยาบาลคลองท่อม', 'sky') +
    kpi('ใบเบิก', String(d.transferCount || 0), 'ออกจากคลังหลัก', 'sand') +
    kpi('รายการในทะเบียน', String(b.itemCount || 0), 'ยาและเวชภัณฑ์', 'leaf');
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
function kpi(label, value, hint, tone) {
  tone = tone || 'teal';
  return '<div class="card kpi kpi-' + tone + '"><div class="label">' + label + '</div><div class="value">' + value + '</div><div class="hint">' + hint + '</div></div>';
}

function loadItems() {
  api('listItems').then(function (r) {
    STATE.items = r.items || [];
    initItemOptionSelects(STATE.items);
    renderItems();
  }).catch(function (e) { toast(e.message || String(e)); });
}
function formatItemPackLabel(it, lots) {
  var seen = {};
  (lots || []).forEach(function (l) {
    if (l.packSize) seen[l.packSize] = 1;
  });
  var keys = Object.keys(seen);
  if (keys.length > 1) return keys.sort().join(', ');
  if (keys.length === 1) return keys[0];
  return it.packSize || '';
}
function renderItems() {
  var q = (document.getElementById('itemQ').value || '').toLowerCase();
  var cat = document.getElementById('itemCatFilter').value;
  var rows = STATE.items.filter(function (i) {
    return i.active !== '0' &&
      (!cat || i.category === cat) &&
      (!q || (i.name + i.packSize + i.code).toLowerCase().indexOf(q) >= 0);
  });
  // ใกล้หมด (ตามเกณฑ์) ขึ้นก่อน แล้วค่อยรายการอื่น
  rows = rows.slice().sort(function (a, b) {
    var aq = Number(a.stockQty || 0);
    var bq = Number(b.stockQty || 0);
    var aLow = isItemLowStock(a.id, aq) ? 0 : 1;
    var bLow = isItemLowStock(b.id, bq) ? 0 : 1;
    if (aLow !== bLow) return aLow - bLow;
    if (aLow === 0 && bLow === 0) return aq - bq;
    return String(a.name || '').localeCompare(String(b.name || ''), 'th');
  });
  var html = '<tr><th>รหัสยา</th><th>ชื่อ</th><th>หมวด</th><th>บรรจุ</th><th class="right">ราคา</th><th class="right">คงเหลือ</th><th>ล็อต / วันหมดอายุ</th><th></th></tr>';
  html += rows.map(function (i) {
    var lots = i.lots || [];
    var lotHtml;
    if (!lots.length) {
      lotHtml = '<span class="muted">ไม่มีสต็อก</span>';
    } else {
      lotHtml = '<div class="lot-list">' + lots.map(function (l) {
        var exp = l.expiryLabel || (l.expiry ? ThDate.formatDateLong(l.expiry) : 'ไม่ระบุวันหมดอายุ');
        var pill = l.nearExpiry ? 'pill warn' : 'pill';
        return '<div class="lot-row"><b>' + l.qty + '</b>' +
          (l.packSize ? ' · ' + esc(l.packSize) : '') +
          ' · <span class="' + pill + '">' + esc(exp) + '</span></div>';
      }).join('') + '</div>';
    }
    var qty = Number(i.stockQty || 0);
    return '<tr><td>' + (i.code ? esc(i.code) : '<span class="muted">—</span>') +
      '</td><td>' + esc(i.name) +
      '</td><td>' + esc(i.category) + '</td><td>' + esc(formatItemPackLabel(i, lots)) +
      '</td><td class="right">' + money(i.unitPrice) +
      '</td><td class="right"><b>' + qty + '</b>' +
      (i.stockValue && qty > 0 ? '<div class="muted">' + money(i.stockValue) + ' ฿</div>' : '') +
      '</td><td>' + lotHtml +
      '</td><td><button class="btn ghost" onclick="openItem(\'' + i.id + '\')">แก้</button> ' +
      '<button class="btn ghost danger" onclick="deleteItem(\'' + i.id + '\')">ลบ</button></td></tr>';
  }).join('');
  document.getElementById('itemTable').innerHTML = html || '<tr><td>ยังไม่มีรายการ</td></tr>';
}
function openItem(id) {
  var it = id ? (STATE.items || []).filter(function (x) { return x.id === id; })[0] : {};
  document.getElementById('itId').value = it.id || '';
  document.getElementById('itName').value = it.name || '';
  document.getElementById('itCode').value = it.code || '';
  document.getElementById('itPrice').value = it.unitPrice || '';
  document.getElementById('itNotes').value = it.notes || '';
  document.getElementById('itemModalTitle').textContent = it.id ? 'แก้ไขรายการ' : 'รายการใหม่';
  refillItemModalSelects({
    category: it.category || 'ยาเม็ด',
    packSize: it.packSize || '',
    form: it.form || ''
  });
  renderItemStockLots(it);
  if (!it.id && !(STATE.itemLotDraft && STATE.itemLotDraft.length)) {
    addItemStockLotRow();
  }
  document.getElementById('itemModal').style.display = 'flex';
}
function closeModal() { document.getElementById('itemModal').style.display = 'none'; }

function deleteItem(id) {
  var it = (STATE.items || []).filter(function (x) { return x.id === id; })[0];
  if (!it) return;
  if (!confirm('ลบ ' + it.name + ' ออกจากทะเบียนหรือไม่?')) return;
  api('deleteItem', { id: id }).then(function () {
    toast('ลบรายการแล้ว');
    if (document.getElementById('itId').value === id) closeModal();
    loadItems();
    refreshAfterMutation();
  }).catch(function (e) { toast(e.message || String(e)); });
}

function renderItemStockLots(it) {
  var lots = (it && it.lots && it.lots.length) ? it.lots : [];
  STATE.editingItemLots = lots.map(function (l) {
    return { stockId: l.stockId || '', qty: Number(l.qty || 0), expiry: l.expiry || '', packSize: l.packSize || '' };
  });
  STATE.itemLotDraft = STATE.editingItemLots.map(function (l) {
    return { stockId: l.stockId, qty: l.qty, expiry: l.expiry, packSize: l.packSize || '' };
  });
  paintItemStockLots();
}

function itemLotRowHtml(i, l) {
  return '<div class="item-lot-row">' +
    '<div class="field"><label>คงเหลือ</label><input type="number" min="0" step="1" value="' + (l.qty || 0) +
    '" oninput="setItemLotField(' + i + ',\'qty\',this.value)"></div>' +
    '<div class="field"><label>บรรจุ</label><input value="' + esc(l.packSize || '') + '" placeholder="เช่น 100\'s" ' +
    'oninput="setItemLotField(' + i + ',\'packSize\',this.value)"></div>' +
    '<div class="field"><label>วันหมดอายุ</label>' +
    ThDate.fieldHtml('itLotExp_' + i, l.expiry || '', 'setItemLotField(' + i + ',\'expiry\',this.value)', true) +
    '</div>' +
    '<button type="button" class="btn ghost item-lot-del" onclick="removeItemLotRow(' + i + ')">ลบ</button>' +
    '</div>';
}

function paintItemStockLots() {
  var lots = STATE.itemLotDraft || [];
  var html = lots.length
    ? lots.map(function (l, i) { return itemLotRowHtml(i, l); }).join('')
    : '<p class="muted">ยังไม่มีสต็อก — กดเพิ่มล็อตด้านล่าง</p>';
  document.getElementById('itStockLots').innerHTML = html;
  ThDate.initFieldsIn(document.getElementById('itStockLots'));
}

function setItemLotField(i, key, val) {
  if (!STATE.itemLotDraft || !STATE.itemLotDraft[i]) return;
  STATE.itemLotDraft[i][key] = key === 'qty' ? Number(val || 0) : val;
}

function addItemStockLotRow() {
  STATE.itemLotDraft = STATE.itemLotDraft || [];
  var defPack = readOptionSelect('itPack') || '';
  STATE.itemLotDraft.push({ stockId: '', qty: 0, expiry: '', packSize: defPack });
  paintItemStockLots();
}

function removeItemLotRow(i) {
  if (!STATE.itemLotDraft) return;
  STATE.itemLotDraft.splice(i, 1);
  paintItemStockLots();
}

function saveItem() {
  var payload = {
    id: document.getElementById('itId').value,
    name: document.getElementById('itName').value,
    code: document.getElementById('itCode').value,
    category: document.getElementById('itCat').value,
    packSize: readOptionSelect('itPack'),
    form: readOptionSelect('itForm'),
    unitPrice: document.getElementById('itPrice').value,
    notes: document.getElementById('itNotes').value
  };
  var lots = (STATE.itemLotDraft || []).filter(function (l) {
    return l.stockId || Number(l.qty) > 0 || l.expiry || l.packSize;
  });
  var origIds = (STATE.editingItemLots || []).map(function (l) { return l.stockId; }).filter(Boolean);
  var currentIds = lots.filter(function (l) { return l.stockId; }).map(function (l) { return l.stockId; });
  var removeStockIds = origIds.filter(function (id) { return currentIds.indexOf(id) < 0; });
  ensureOptionOnSave('categories', payload.category)
    .then(function () { return ensureOptionOnSave('packSizes', payload.packSize); })
    .then(function () { return ensureOptionOnSave('forms', payload.form); })
    .then(function () { return api('saveItem', payload); })
    .then(function (r) {
      var itemId = r.item.id;
      if (lots.length || removeStockIds.length) {
        return api('saveStockLots', { itemId: itemId, lots: lots, removeStockIds: removeStockIds });
      }
    }).then(function () {
    closeModal();
    toast('บันทึกรายการแล้ว');
    loadItems();
    refreshStockCache();
  }).catch(function (e) { toast(e.message || String(e)); });
}

var LOW_STOCK_QTY = 10;

function getDefaultLowStock() {
  var s = STATE.boot && STATE.boot.settings;
  var n = Number(s && s.defaultLowStock);
  return n > 0 ? n : LOW_STOCK_QTY;
}

function getItemLowStockThreshold(itemId, itemRow) {
  if (itemRow && Number(itemRow.lowStock) > 0) return Number(itemRow.lowStock);
  var it = itemRow || (STATE.items || []).filter(function (i) { return i.id === itemId; })[0];
  if (it && Number(it.lowStock) > 0) return Number(it.lowStock);
  return getDefaultLowStock();
}

function isItemLowStock(itemId, totalQty, itemRow) {
  var threshold = getItemLowStockThreshold(itemId, itemRow);
  return Number(totalQty || 0) > 0 && Number(totalQty || 0) < threshold;
}

function buildItemStockTotals(stock) {
  var totals = {};
  (stock || []).forEach(function (s) {
    totals[s.itemId] = (totals[s.itemId] || 0) + Number(s.qty || 0);
  });
  return totals;
}

function isLowStock(s, itemTotals) {
  itemTotals = itemTotals || buildItemStockTotals(STATE.stock);
  var total = itemTotals[s.itemId] != null ? itemTotals[s.itemId] : Number(s.qty || 0);
  var threshold = s.lowStockThreshold != null ? Number(s.lowStockThreshold) : getItemLowStockThreshold(s.itemId);
  return total > 0 && total < threshold;
}

function isLowStockCritical(s, itemTotals) {
  itemTotals = itemTotals || buildItemStockTotals(STATE.stock);
  var total = itemTotals[s.itemId] != null ? itemTotals[s.itemId] : Number(s.qty || 0);
  var threshold = s.lowStockThreshold != null ? Number(s.lowStockThreshold) : getItemLowStockThreshold(s.itemId);
  var critical = Math.max(1, Math.floor(threshold * 0.3));
  return total > 0 && total <= critical;
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
  var totals = buildItemStockTotals(allRows);
  var byItem = {};
  (allRows || []).forEach(function (s) {
    if (!isLowStock(s, totals)) return;
    var key = s.itemId || s.name;
    if (!byItem[key]) {
      byItem[key] = {
        name: s.name,
        packSize: s.packSize,
        qty: totals[s.itemId] || 0,
        threshold: s.lowStockThreshold || getItemLowStockThreshold(s.itemId),
        nearExpiry: false
      };
    }
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
      ' / เกณฑ์ ' + x.threshold +
      (x.packSize ? ' · ' + esc(x.packSize) : '') +
      (x.nearExpiry ? ' <span class="pill warn">หมดอายุใกล้</span>' : '') +
      '</span>';
  }).join('');
  var more = lows.length > 8 ? '<span class="muted">และอีก ' + (lows.length - 8) + ' รายการ</span>' : '';
  box.innerHTML =
    '<div class="stock-alert-head">' +
    '<div><strong>เตือนใกล้หมด</strong> พบ <b>' + lows.length + '</b> รายการ ต่ำกว่าเกณฑ์ที่ตั้งไว้</div>' +
    '<button type="button" class="btn secondary" onclick="setStockFilter(\'low\')">ดูเฉพาะใกล้หมด</button>' +
    '</div>' +
    '<div class="stock-alert-list">' + chips + more + '</div>';
}

function renderStock() {
  var q = (document.getElementById('stockQ').value || '').toLowerCase();
  var filter = STATE.stockFilter || 'all';
  var all = STATE.stock || [];
  var totals = buildItemStockTotals(all);
  renderStockAlert(all);

  var rows = all.filter(function (s) {
    if (q && String(s.name).toLowerCase().indexOf(q) < 0) return false;
    if (filter === 'low' && !isLowStock(s, totals)) return false;
    if (filter === 'expiry' && !s.nearExpiry) return false;
    return true;
  });

  // ใกล้หมด / ใกล้หมดอายุ ขึ้นก่อน
  rows = rows.slice().sort(function (a, b) {
    var al = isLowStock(a, totals) ? 0 : 1;
    var bl = isLowStock(b, totals) ? 0 : 1;
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
      var low = isLowStock(s, totals);
      var rowClass = [];
      if (low) rowClass.push('stock-low-row');
      else if (s.fefoRecommend) rowClass.push('fefo-row');
      if (s.nearExpiry) rowClass.push('stock-expiry-row');

      var status = '';
      if (low && isLowStockCritical(s, totals)) status = '<span class="pill danger">วิกฤต</span>';
      else if (low) status = '<span class="pill warn">ใกล้หมด</span>';
      else if (s.nearExpiry) status = '<span class="pill warn">ใกล้หมดอายุ</span>';
      else status = '<span class="pill">ปกติ</span>';

      var itemTotal = totals[s.itemId] != null ? totals[s.itemId] : Number(s.qty || 0);
      var qtyCell = low
        ? '<span class="qty-low">' + s.qty + '</span><div class="muted">รวม ' + itemTotal + '</div>'
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
        var codePrefix = i.code ? esc(i.code) + ' · ' : '';
        return '<div onclick="chooseItem(\'' + kind + '\',\'' + i.id + '\')">' + codePrefix + esc(i.name) + ' <span class="muted">' + esc(i.packSize) + ' · ' + money(i.unitPrice) + '</span></div>';
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
  var amountEl = document.getElementById('rcAmount');
  if (amountEl) amountEl.value = '';
  fillSelectWithCustom('rcPack', 'rcPackCustom', Options.mergePackFromItems(STATE.items), it.packSize || '');
  document.getElementById(kind + 'Suggest').style.display = 'none';
}
function syncReceiveLinePricing(line) {
  if (!line) return;
  var qty = Number(line.qty || 0);
  var amount = Number(line.amount || 0);
  if (qty > 0 && amount > 0) {
    line.unitPrice = ocrRound2(amount / qty);
  } else if (qty > 0 && Number(line.unitPrice || 0) > 0) {
    line.amount = ocrRound2(line.unitPrice * qty);
  }
}
function addReceiveLine() {
  var nameBox = document.getElementById('rcSearch').value.trim();
  var qty = Number(document.getElementById('rcQty').value || 0);
  var pack = readSelectWithCustom('rcPack', 'rcPackCustom');
  if (!qty || qty <= 0) return toast('ใส่จำนวนก่อน');
  if (!pack) return toast('เลือกหน่วยบรรจุ');
  var it = STATE.receive.item;
  var amount = Number(document.getElementById('rcAmount').value || 0);
  var qtyText = qty + ' × ' + pack;
  var line = {
    itemId: it && it.id,
    code: it ? (it.code || '') : '',
    name: it ? it.name : nameBox,
    packSize: pack,
    category: it ? it.category : (document.getElementById('rcKind').value === 'เวชภัณฑ์' ? 'เวชภัณฑ์ที่มิใช่ยา' : 'ยาเม็ด'),
    qtyText: qtyText,
    qty: qty,
    approvedQty: qty,
    requestedQty: qty,
    unitPrice: 0,
    amount: amount,
    expiry: ThDate.get('rcExpiry') || document.getElementById('rcExpiry').value,
    notes: ''
  };
  syncReceiveLinePricing(line);
  STATE.receive.lines.push(line);
  STATE.receive.item = null;
  document.getElementById('rcSearch').value = '';
  document.getElementById('rcQty').value = '';
  document.getElementById('rcAmount').value = '';
  renderReceive();
}
function updateReceiveLine(i, key, value) {
  var line = STATE.receive.lines[i];
  if (!line) return;
  if (key === 'qty' || key === 'amount') line[key] = Number(value || 0);
  else line[key] = value;
  syncReceiveLinePricing(line);
  renderReceive();
}
function renderReceive() {
  var tot = 0;
  var html = '<tr><th>รหัสยา</th><th>รายการ</th><th>จำนวน</th><th>บรรจุ</th><th class="right">ราคารวม</th><th class="right">ราคา/หน่วย</th><th>หมดอายุ</th><th></th></tr>';
  html += STATE.receive.lines.map(function (l, i) {
    syncReceiveLinePricing(l);
    tot += Number(l.amount || 0);
    return '<tr><td>' + (l.code ? esc(l.code) : '<span class="muted">—</span>') +
      '</td><td>' + esc(l.name) +
      '</td><td class="right"><input type="number" min="0" step="1" value="' + esc(l.qty) + '" style="width:72px" onchange="updateReceiveLine(' + i + ',\'qty\',this.value)"></td>' +
      '<td>' + esc(l.packSize) + '</td>' +
      '<td class="right"><input type="number" min="0" step="0.01" value="' + (l.amount != null && l.amount !== '' ? l.amount : '') + '" style="width:96px" onchange="updateReceiveLine(' + i + ',\'amount\',this.value)"></td>' +
      '<td class="right">' + money(l.unitPrice) + '</td>' +
      '<td>' + ThDate.fieldHtml('rcLineExp_' + i, l.expiry || '', 'updateReceiveLine(' + i + ',\'expiry\',this.value)', true) + '</td>' +
      '<td><button class="btn ghost" onclick="STATE.receive.lines.splice(' + i + ',1);renderReceive()">ลบ</button></td></tr>';
  }).join('');
  document.getElementById('rcTable').innerHTML = html;
  ThDate.initFieldsIn(document.getElementById('rcTable'));
  document.getElementById('rcCalc').textContent = 'ยอดรวม ' + money(tot) + ' บาท · ' + STATE.receive.lines.length + ' รายการ';
}
function updateReceiptEditUI() {
  var banner = document.getElementById('rcEditBanner');
  var btn = document.getElementById('rcSaveBtn');
  if (!banner || !btn) return;
  if (STATE.editingReceiptId) {
    banner.style.display = 'flex';
    document.getElementById('rcEditBannerText').textContent = 'กำลังแก้ไขใบรับ ' + STATE.editingReceiptId;
    btn.textContent = 'บันทึกการแก้ไข';
  } else {
    banner.style.display = 'none';
    btn.textContent = 'บันทึกรับเข้าคลังหลัก';
  }
}
function cancelReceiptEdit() {
  STATE.editingReceiptId = null;
  STATE.receive.lines = [];
  STATE.receive.item = null;
  document.getElementById('rcNumber').value = '';
  document.getElementById('rcSource').value = 'โรงพยาบาลคลองท่อม';
  document.getElementById('rcKind').value = 'ยา';
  document.getElementById('rcNotes').value = '';
  document.getElementById('rcSearch').value = '';
  document.getElementById('rcQty').value = '';
  document.getElementById('rcAmount').value = '';
  ThDate.set('rcDate', todayInput());
  updateReceiptEditUI();
  renderReceive();
  toast('ยกเลิกการแก้ไข');
}
function editReceipt(id) {
  api('getReceipt', { id: id }).then(function (data) {
    var rec = data.receipt;
    var itemMap = {};
    (STATE.items || []).forEach(function (it) { itemMap[it.id] = it; });
    STATE.editingReceiptId = id;
    document.getElementById('rcNumber').value = rec.number || '';
    ThDate.set('rcDate', rec.date);
    document.getElementById('rcSource').value = rec.source || 'โรงพยาบาลคลองท่อม';
    document.getElementById('rcKind').value = rec.kind || 'ยา';
    document.getElementById('rcNotes').value = rec.notes || '';
    STATE.receive.lines = (data.lines || []).map(function (l) {
      var it = itemMap[l.itemId] || {};
      return {
        itemId: l.itemId,
        code: l.code || it.code || '',
        name: l.name || it.name || '',
        packSize: l.packSize || it.packSize || '',
        category: l.category || it.category || '',
        qtyText: l.qtyText || String(l.qty),
        qty: Number(l.qty || 0),
        approvedQty: Number(l.approvedQty != null ? l.approvedQty : l.qty),
        requestedQty: Number(l.requestedQty != null ? l.requestedQty : l.qty),
        unitPrice: Number(l.unitPrice || 0),
        amount: Number(l.amount || 0),
        expiry: l.expiry || '',
        notes: l.notes || ''
      };
    });
    updateReceiptEditUI();
    renderReceive();
    showPage('receive');
    toast('โหลดใบรับ ' + id + ' เพื่อแก้ไข');
  }).catch(function (e) { toast(e.message || String(e)); });
}
function saveReceipt() {
  if (!STATE.receive.lines.length) return toast('ยังไม่มีรายการ');
  var payload = {
    number: document.getElementById('rcNumber').value,
    date: document.getElementById('rcDate').value,
    source: document.getElementById('rcSource').value,
    kind: document.getElementById('rcKind').value,
    notes: document.getElementById('rcNotes').value,
    lines: STATE.receive.lines
  };
  if (STATE.editingReceiptId) payload.id = STATE.editingReceiptId;
  api('saveReceipt', payload).then(function (r) {
    var editing = !!STATE.editingReceiptId;
    toast((editing ? 'แก้ไข' : 'บันทึก') + 'ใบรับ ' + r.receipt.id + ' รวม ' + money(r.receipt.totalValue) + ' บาท');
    STATE.editingReceiptId = null;
    STATE.receive.lines = [];
    updateReceiptEditUI();
    renderReceive();
    loadReceipts();
    refreshAfterMutation();
  }).catch(function (e) { toast(e.message || String(e)); });
}
function loadReceipts() {
  api('listReceipts').then(function (r) {
    document.getElementById('rcHistory').innerHTML = (r.receipts || []).slice(0, 10).map(function (x) {
      return '<div class="user-row wd-history-row">' +
        '<span>' + esc(ThDate.formatDateLong(x.date)) + ' · ' + esc(x.number || x.id) + ' · ' + money(x.totalValue) + ' ฿ · ' + esc(x.source) + '</span>' +
        '<button type="button" class="btn ghost" onclick="editReceipt(\'' + x.id + '\')">แก้ไข</button></div>';
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
      var row = Object.assign({ _id: 'ocr' + i }, l, { keep: true });
      syncOcrLinePricing(row);
      return row;
    });
    if (parsed.receiptNumber && !document.getElementById('rcNumber').value) {
      document.getElementById('rcNumber').value = parsed.receiptNumber;
    }
    if (parsed.receiptDate) {
      ThDate.set('rcDate', parsed.receiptDate);
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

function activeRegistryItems() {
  return (STATE.items || []).filter(function (i) { return i.active !== '0'; })
    .slice()
    .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'th'); });
}

function ocrRegistrySelectHtml(i, row) {
  var items = activeRegistryItems();
  var q = String(row._filter || '').toLowerCase().trim();
  var html = '<div class="ocr-pick">';
  html += '<input class="ocr-pick-filter" type="search" placeholder="ค้นหาในทะเบียน…" value="' + esc(row._filter || '') + '" ' +
    'oninput="STATE.ocrReview[' + i + ']._filter=this.value;renderOcrReview()">' ;
  html += '<select class="ocr-item-select" onchange="pickOcrRegistryItem(' + i + ', this.value)">';
  html += '<option value="">— เลือกจากทะเบียน —</option>';
  var shown = 0;
  items.forEach(function (it) {
    var label = it.name + (it.packSize ? ' · ' + it.packSize : '');
    var isSel = row.itemId && String(row.itemId) === String(it.id);
    if (q && !isSel && (it.name + ' ' + (it.packSize || '') + ' ' + (it.code || '')).toLowerCase().indexOf(q) < 0) return;
    shown++;
    html += '<option value="' + esc(it.id) + '"' + (isSel ? ' selected' : '') + '>' + esc(label) + '</option>';
  });
  if (q && !shown) html += '<option value="" disabled>ไม่พบในทะเบียน</option>';
  html += '<option value="__custom__"' + (!row.itemId ? ' selected' : '') + '>อื่น ๆ (พิมพ์ชื่อเอง)</option>';
  html += '</select>';
  if (!row.itemId) {
    html += '<input class="ocr-name-input" value="' + esc(row.name || '') + '" placeholder="ชื่อรายการใหม่" ' +
      'onchange="updateOcrField(' + i + ',\'name\',this.value)">';
  }
  if (row.raw) html += '<div class="muted ocr-raw">จาก OCR: ' + esc(row.raw) + '</div>';
  html += '</div>';
  return html;
}

function ocrRound2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function syncOcrLinePricing(row) {
  if (!row) return;
  var qty = Number(row.qty || 0);
  var amount = Number(row.amount || 0);
  if (qty > 0 && amount > 0) {
    row.unitPrice = ocrRound2(amount / qty);
  } else if (qty > 0 && Number(row.unitPrice || 0) > 0) {
    row.amount = ocrRound2(row.unitPrice * qty);
  }
}

function pickOcrRegistryItem(i, itemId) {
  var row = STATE.ocrReview[i];
  if (!row) return;
  if (!itemId || itemId === '__custom__') {
    row.itemId = '';
    row.matched = false;
    if (!row.name && row.raw) row.name = row.raw;
    renderOcrReview();
    return;
  }
  var it = (STATE.items || []).filter(function (x) { return String(x.id) === String(itemId); })[0];
  if (!it) return toast('ไม่พบรายการในทะเบียน');
  row.itemId = it.id;
  row.name = it.name;
  row.code = it.code || '';
  row.packSize = it.packSize || row.packSize || '';
  row._packCustom = false;
  row.category = it.category || row.category || '';
  row.matched = true;
  if (!(Number(row.amount || 0) > 0 && Number(row.qty || 0) > 0)) {
    row.unitPrice = Number(it.unitPrice != null ? it.unitPrice : row.unitPrice) || 0;
    row.amount = ocrRound2(Number(row.qty || 0) * Number(row.unitPrice || 0));
  } else {
    syncOcrLinePricing(row);
  }
  row._filter = '';
  renderOcrReview();
}

function ocrPackSelectHtml(i, row) {
  var packs = Options.mergePackFromItems(STATE.items || []);
  var cur = String(row.packSize || '').trim();
  var matched = null;
  packs.forEach(function (p) {
    if (matched) return;
    if (p === cur || (Options.packKey && Options.packKey(p) === Options.packKey(cur))) matched = p;
  });
  var showCustom = !!row._packCustom || (!!cur && !matched);
  var html = '<div class="ocr-pack-pick">';
  html += '<select class="ocr-pack-select" onchange="pickOcrPack(' + i + ', this.value)">';
  html += '<option value="">— เลือกหน่วย —</option>';
  packs.forEach(function (p) {
    var sel = !showCustom && matched === p ? ' selected' : '';
    html += '<option value="' + esc(p) + '"' + sel + '>' + esc(p) + '</option>';
  });
  html += '<option value="__custom__"' + (showCustom ? ' selected' : '') + '>อื่น ๆ (พิมพ์เอง)</option>';
  html += '</select>';
  if (showCustom) {
    html += '<input class="ocr-pack-custom" value="' + esc(cur) + '" placeholder="เช่น 100\'s" ' +
      'onchange="STATE.ocrReview[' + i + ']._packCustom=true;updateOcrField(' + i + ',\'packSize\',this.value)">';
  }
  html += '</div>';
  return html;
}

function pickOcrPack(i, value) {
  var row = STATE.ocrReview[i];
  if (!row) return;
  if (value === '__custom__') {
    row._packCustom = true;
    renderOcrReview();
    return;
  }
  row._packCustom = false;
  row.packSize = value || '';
  renderOcrReview();
}

function renderOcrReview() {
  var rows = STATE.ocrReview || [];
  var card = document.getElementById('ocrReviewCard');
  if (card) card.style.display = rows.length ? 'block' : 'none';
  var html = '<tr><th></th><th>รายการ (เลือกจากทะเบียน)</th><th class="right">จำนวน</th><th>หน่วยบรรจุ</th><th>วันหมดอายุ</th><th class="right">ราคา/หน่วย</th><th class="right">เป็นเงิน</th><th>สถานะ</th></tr>';
  var tot = 0;
  var kept = 0;
  html += rows.map(function (l, i) {
    if (l.keep) {
      kept++;
      syncOcrLinePricing(l);
      tot += Number(l.amount || 0) || ocrRound2(Number(l.qty || 0) * Number(l.unitPrice || 0));
    }
    return '<tr class="' + (l.keep ? '' : 'ocr-skip') + '">' +
      '<td><input type="checkbox" ' + (l.keep ? 'checked' : '') + ' onchange="STATE.ocrReview[' + i + '].keep=this.checked;renderOcrReview()"></td>' +
      '<td>' + ocrRegistrySelectHtml(i, l) + '</td>' +
      '<td class="right"><input type="number" min="0" step="1" value="' + (l.qty || '') + '" style="width:80px" onchange="updateOcrField(' + i + ',\'qty\',this.value)"></td>' +
      '<td>' + ocrPackSelectHtml(i, l) + '</td>' +
      '<td>' + ThDate.fieldHtml('ocrExp_' + i, l.expiry || '', 'updateOcrField(' + i + ',\'expiry\',this.value)', true) + '</td>' +
      '<td class="right"><span class="ocr-unit-price" title="คำนวณจาก เป็นเงิน ÷ จำนวน">' + money(l.unitPrice || 0) + '</span></td>' +
      '<td class="right"><input type="number" min="0" step="0.01" class="ocr-amount-input" value="' + (l.amount != null && l.amount !== '' ? l.amount : '') + '" style="width:100px" onchange="updateOcrField(' + i + ',\'amount\',this.value)"></td>' +
      '<td>' + (l.itemId ? '<span class="pill">ตรงทะเบียน</span>' : '<span class="pill warn">รายการใหม่</span>') + '</td>' +
      '</tr>';
  }).join('');
  document.getElementById('ocrReviewTable').innerHTML = html || '<tr><td>ไม่มีรายการ</td></tr>';
  document.getElementById('ocrReviewCalc').textContent = kept + ' รายการที่เลือก · ' + money(tot) + ' บาท';
  ThDate.initFieldsIn(document.getElementById('ocrReviewTable'));
}

function updateOcrField(i, key, value) {
  var row = STATE.ocrReview[i];
  if (!row) return;
  if (key === 'qty' || key === 'amount') row[key] = Number(value || 0);
  else row[key] = value;
  syncOcrLinePricing(row);
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
    syncOcrLinePricing(l);
    var pack = String(l.packSize || '').trim() || 'กล่อง';
    var qty = Number(l.qty || 0);
    var price = Number(l.unitPrice || 0);
    var amount = Number(l.amount || 0) || ocrRound2(qty * price);
    var it = l.itemId ? (STATE.items || []).filter(function (x) { return String(x.id) === String(l.itemId); })[0] : null;
    STATE.receive.lines.push({
      itemId: l.itemId || '',
      code: (it && it.code) || l.code || '',
      name: String(l.name).trim(),
      packSize: pack,
      category: l.category || (kind === 'เวชภัณฑ์' ? 'เวชภัณฑ์ที่มิใช่ยา' : 'ยาเม็ด'),
      qtyText: qty + ' × ' + pack,
      qty: qty,
      approvedQty: qty,
      requestedQty: qty,
      unitPrice: price,
      amount: amount,
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
  updateWithdrawEditUI();
}
function withdrawStockMax(stockId, stockQty) {
  var max = Number(stockQty || 0);
  if (STATE.editingWithdrawId && STATE.editWithdrawOrig) {
    max += Number(STATE.editWithdrawOrig[stockId] || 0);
  }
  return max;
}
function updateWithdrawEditUI() {
  var banner = document.getElementById('wdEditBanner');
  var btn = document.getElementById('wdSaveBtn');
  if (!banner || !btn) return;
  if (STATE.editingWithdrawId) {
    banner.style.display = 'flex';
    document.getElementById('wdEditBannerText').textContent = 'กำลังแก้ไขใบเบิก ' + STATE.editingWithdrawId;
    btn.textContent = 'บันทึกการแก้ไข';
  } else {
    banner.style.display = 'none';
    btn.textContent = 'บันทึกใบเบิก';
  }
}
function cancelWithdrawEdit() {
  STATE.editingWithdrawId = null;
  STATE.editWithdrawOrig = {};
  STATE.withdrawCart = [];
  ThDate.set('wdDate', todayInput());
  document.getElementById('wdNotes').value = '';
  updateWithdrawEditUI();
  renderWithdrawSummary();
  filterWithdrawStock();
  toast('ยกเลิกการแก้ไข');
}
function editWithdraw(id) {
  Promise.all([
    api('getTransfer', { id: id }),
    api('listStock', { location: 'MAIN' })
  ]).then(function (res) {
    var data = res[0];
    var stock = res[1].stock || [];
    STATE.stockCache.MAIN = stock;
    STATE.pickStock = stock;
    var stockById = {};
    stock.forEach(function (s) { stockById[s.id] = s; });
    var orig = {};
    STATE.withdrawCart = (data.lines || []).map(function (l) {
      var s = stockById[l.stockId] || {};
      var origQty = Number(l.qty || 0);
      orig[l.stockId] = origQty;
      var maxQty = withdrawStockMax(l.stockId, s.qty);
      return {
        stockId: l.stockId,
        itemId: l.itemId,
        name: l.name || s.name || '',
        category: s.category || '',
        packSize: l.packSize || s.packSize || '',
        expiry: l.expiry || s.expiry || '',
        expiryLabel: l.expiryLabel || s.expiryLabel || '-',
        unitPrice: Number(l.unitPrice != null ? l.unitPrice : s.unitPrice || 0),
        qty: origQty,
        maxQty: maxQty,
        amount: origQty * Number(l.unitPrice != null ? l.unitPrice : s.unitPrice || 0),
        fefoRecommend: !!s.fefoRecommend
      };
    });
    STATE.editingWithdrawId = id;
    STATE.editWithdrawOrig = orig;
    ThDate.set('wdDate', data.transfer.date);
    document.getElementById('wdNotes').value = data.transfer.notes || '';
    showPage('withdraw');
    updateWithdrawEditUI();
    renderWithdrawSummary();
    filterWithdrawStock();
    toast('โหลดใบเบิก ' + id + ' เพื่อแก้ไข');
  }).catch(function (e) { toast(e.message || String(e)); });
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
      var maxQ = withdrawStockMax(s.id, s.qty);
      return '<tr class="' + (s.fefoRecommend ? 'fefo-row' : '') + '">' +
        '<td>' + tip + '</td>' +
        '<td>' + esc(s.name) + '</td>' +
        '<td>' + esc(s.category) + '</td>' +
        '<td>' + esc(s.packSize) + '</td>' +
        '<td class="right">' + s.qty + '</td>' +
        '<td class="right">' + money(s.unitPrice) + '</td>' +
        '<td>' + (s.expiryLabel || '-') + '</td>' +
        '<td class="right"><input id="wdQty_' + s.id + '" type="number" min="1" step="1" max="' + maxQ + '" value="' + defQty + '" style="width:80px"></td>' +
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
  var maxAllowed = withdrawStockMax(stockId, s.qty);
  if (qty > maxAllowed + 1e-9) return toast('จำนวนเกินคงเหลือ (' + maxAllowed + ')');
  var cart = STATE.withdrawCart || [];
  var existing = cart.filter(function (c) { return c.stockId === stockId; })[0];
  if (existing) {
    existing.qty = qty;
    existing.maxQty = maxAllowed;
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
      maxQty: maxAllowed,
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
  var removed = (STATE.withdrawCart || []).filter(function (c) { return c.stockId === stockId; })[0];
  STATE.withdrawCart = (STATE.withdrawCart || []).filter(function (c) { return c.stockId !== stockId; });
  renderWithdrawSummary();
  filterWithdrawStock();
  if (STATE.editingWithdrawId && removed) {
    toast('ลบ ' + removed.name + ' — จะคืน ' + removed.qty + ' เข้าคลังเมื่อบันทึก');
  }
}
function clearWithdrawCart() {
  STATE.withdrawCart = [];
  if (STATE.editingWithdrawId) {
    STATE.editingWithdrawId = null;
    STATE.editWithdrawOrig = {};
    ThDate.set('wdDate', todayInput());
    document.getElementById('wdNotes').value = '';
    updateWithdrawEditUI();
  }
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
  if (!lines.length && !STATE.editingWithdrawId) return toast('เพิ่มรายการที่ต้องการเบิกก่อน');
  if (!lines.length && STATE.editingWithdrawId) {
    if (!confirm('ไม่มีรายการเหลือ — จะคืนยาทั้งหมดเข้าคลัง ต้องการบันทึก?')) return;
  }
  var payload = {
    date: document.getElementById('wdDate').value,
    notes: document.getElementById('wdNotes').value,
    lines: lines
  };
  if (STATE.editingWithdrawId) payload.id = STATE.editingWithdrawId;
  api('saveTransfer', payload).then(function (r) {
    var editing = !!STATE.editingWithdrawId;
    var msg = (editing ? 'แก้ไข' : 'บันทึก') + 'ใบเบิก ' + r.transfer.id + ' · ' + money(r.transfer.totalValue) + ' บาท';
    if (editing && r.returnedCount > 0) {
      msg += ' · คืนคลัง ' + r.returnedCount + ' รายการ (' + r.returnedQty + ' หน่วย)';
    }
    toast(msg);
    STATE.lastWithdrawId = r.transfer.id;
    STATE.editingWithdrawId = null;
    STATE.editWithdrawOrig = {};
    STATE.withdrawCart = [];
    updateWithdrawEditUI();
    renderWithdrawSummary();
    loadWithdrawPick();
    loadWithdrawHistory();
    showWithdrawPrint(r.transfer.id);
    refreshAfterMutation();
  }).catch(function (e) { toast(e.message || String(e)); });
}
function withdrawHistoryTime(x) {
  return ThDate.formatTimeShort(x.createdAt || '') || '';
}
function loadWithdrawHistory() {
  api('listTransfers').then(function (r) {
    document.getElementById('wdHistory').innerHTML = (r.transfers || []).slice(0, 10).map(function (x) {
      var time = withdrawHistoryTime(x);
      return '<div class="user-row wd-history-row">' +
        '<span>' + esc(ThDate.formatDateLong(x.date)) + ' · ' + esc(x.id) + ' · ' + money(x.totalValue) + ' ฿' +
        (time ? ' · <span class="wd-history-time">' + esc(time) + '</span>' : '') + '</span>' +
        '<span class="row" style="gap:6px;margin:0">' +
        '<button type="button" class="btn ghost" onclick="editWithdraw(\'' + x.id + '\')">แก้ไข</button>' +
        '<button type="button" class="btn ghost" onclick="showWithdrawPrint(\'' + x.id + '\')">พิมพ์</button>' +
        '<button type="button" class="btn ghost danger" onclick="deleteWithdraw(\'' + x.id + '\')">ลบ</button></span></div>';
    }).join('') || 'ยังไม่มี';
  });
}
function deleteWithdraw(id) {
  if (!confirm('ลบใบเบิก ' + id + ' และคืนยาทั้งหมดเข้าคลัง?')) return;
  api('deleteTransfer', { id: id }).then(function (r) {
    var msg = 'ลบใบเบิก ' + id + ' แล้ว';
    if (r.returnedCount > 0) msg += ' · คืนคลัง ' + r.returnedCount + ' รายการ (' + r.returnedQty + ' หน่วย)';
    toast(msg);
    if (STATE.editingWithdrawId === id) cancelWithdrawEdit();
    if (STATE.lastWithdrawId === id) {
      document.getElementById('wdPrintCard').style.display = 'none';
      STATE.lastWithdrawId = null;
    }
    loadWithdrawHistory();
    loadWithdrawPick();
    refreshAfterMutation();
  }).catch(function (e) { toast(e.message || String(e)); });
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
    html += signBlock4(s, true);
    document.getElementById('wdPrintOut').innerHTML = html;
    initWithdrawSignDates(t.date);
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
    kpi('รับเข้าเดือนนี้', money(sm.receivedValue) + ' ฿', (sm.receivedQty || 0) + ' หน่วย', 'sky') +
    kpi('เบิกออกเดือนนี้', money(sm.issuedValue) + ' ฿', (sm.issuedQty || 0) + ' หน่วย', 'sand') +
    kpi('คงเหลือสิ้นเดือน', money(sm.remainValue) + ' ฿', (sm.remainQty || 0) + ' หน่วย', 'teal') +
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
    kpi('รับเข้า', money(t.receive) + ' ฿', 'เดือนนี้', 'sky') +
    kpi('เบิกออก', money(t.used) + ' ฿', 'เดือนนี้', 'sand') +
    kpi('คงเหลือ', money(t.remain) + ' ฿', 'สิ้นเดือน', 'teal') +
    '</div>';
  html += '<table><tr><th>หมวด</th><th class="right">ยอดยกมา</th><th class="right">รับเข้า</th><th class="right">เบิกออก</th><th class="right">คงเหลือ</th></tr>';
  (d.rows || []).forEach(function (r) {
    html += '<tr><td>' + esc(r.category) + '</td><td class="right">' + money(r.opening) + '</td><td class="right">' + money(r.receive) + '</td><td class="right">' + money(r.used) + '</td><td class="right"><b>' + money(r.remain) + '</b></td></tr>';
  });
  html += '</table>' + signBlock4(d.settings);
  document.getElementById('reportOut').innerHTML = html;
}
function signDateLineHtml(editable) {
  if (editable) {
    return '<div class="sign-date-line">' +
      'วันที่ <input type="text" class="sign-date-inp sign-date-day" maxlength="2" inputmode="numeric" placeholder="..">' +
      ' เดือน <input type="text" class="sign-date-inp sign-date-month" maxlength="24" placeholder="................">' +
      ' พ.ศ. <input type="text" class="sign-date-inp sign-date-year" maxlength="4" inputmode="numeric" placeholder="....">' +
      '</div>';
  }
  return '<div class="sign-date-line sign-date-static">วันที่...... เดือน.......................... พ.ศ..............</div>';
}

function signBlock4(s, editable) {
  function box(role, nameKey, posKey) {
    var name = s[nameKey] || '';
    var pos = s[posKey] || '';
    return '<div class="sign-box">' +
      '<div class="sign-role-line">ลงชื่อ ................................ ' + role + '</div>' +
      '<div class="sign-name">(' + esc(name || '................................') + ')</div>' +
      '<div class="sign-pos">ตำแหน่ง ' + esc(pos || '................................') + '</div>' +
      signDateLineHtml(!!editable) +
      '</div>';
  }
  return '<div class="sign-grid">' +
    box('ผู้อนุมัติ', 'approverName', 'approverPosition') +
    box('ผู้เบิก', 'requesterName', 'requesterPosition') +
    box('ผู้รับ', 'receiverName', 'receiverPosition') +
    box('ผู้จ่าย', 'issuerName', 'issuerPosition') +
    '</div>';
}

function isoToThaiSignParts(iso) {
  var TH_MONTHS = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var p = String(iso || '').slice(0, 10).split('-');
  if (p.length !== 3) return null;
  var m = Number(p[1]);
  if (!m || m < 1 || m > 12) return null;
  return {
    day: String(Number(p[2])),
    month: TH_MONTHS[m],
    year: String(Number(p[0]) + 543)
  };
}

function initWithdrawSignDates(isoDate) {
  var parts = isoToThaiSignParts(isoDate);
  if (!parts) return;
  document.querySelectorAll('#wdPrintOut .sign-box').forEach(function (box) {
    var d = box.querySelector('.sign-date-day');
    var m = box.querySelector('.sign-date-month');
    var y = box.querySelector('.sign-date-year');
    if (d) d.value = parts.day;
    if (m) m.value = parts.month;
    if (y) y.value = parts.year;
  });
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
function loadLowStockSettings() {
  api('listItems').then(function (r) {
    STATE.lowStockItems = (r.items || []).filter(function (i) { return i.active !== '0'; });
    renderLowStockSettings();
  }).catch(function (e) { toast(e.message || String(e)); });
}

function renderLowStockSettings() {
  var el = document.getElementById('lowStockTable');
  if (!el) return;
  var q = (document.getElementById('lowStockQ') && document.getElementById('lowStockQ').value || '').toLowerCase().trim();
  var def = getDefaultLowStock();
  var rows = (STATE.lowStockItems || []).filter(function (i) {
    if (!q) return true;
    return (String(i.name) + ' ' + String(i.code || '') + ' ' + String(i.category || '')).toLowerCase().indexOf(q) >= 0;
  }).sort(function (a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''), 'th');
  });
  var html = '<tr><th>รายการ</th><th>หมวด</th><th class="right">คงเหลือ</th><th class="right">เตือนเมื่อ &lt;</th></tr>';
  if (!rows.length) {
    html += '<tr><td colspan="4" class="muted">ไม่พบรายการ</td></tr>';
  } else {
    html += rows.map(function (i) {
      var custom = Number(i.lowStock || 0);
      var val = custom > 0 ? custom : '';
      var low = isItemLowStock(i.id, i.stockQty, i);
      return '<tr class="' + (low ? 'stock-low-row' : '') + '">' +
        '<td>' + esc(i.name) + (i.code ? '<div class="muted">' + esc(i.code) + '</div>' : '') + '</td>' +
        '<td>' + esc(i.category) + '</td>' +
        '<td class="right"><b>' + Number(i.stockQty || 0) + '</b></td>' +
        '<td class="right"><input type="number" min="1" step="1" class="low-stock-input" data-low-id="' + esc(i.id) + '" value="' + val + '" placeholder="' + def + '" style="width:88px"></td>' +
        '</tr>';
    }).join('');
  }
  el.innerHTML = html;
}

function saveLowStockSettings() {
  var defaultLow = Number(document.getElementById('stDefaultLowStock').value || 10);
  var items = [];
  document.querySelectorAll('.low-stock-input').forEach(function (inp) {
    items.push({ id: inp.getAttribute('data-low-id'), lowStock: inp.value === '' ? 0 : Number(inp.value) });
  });
  api('saveLowStockSettings', { defaultLowStock: defaultLow, items: items }).then(function (r) {
    if (STATE.boot) {
      STATE.boot.settings = r.settings || STATE.boot.settings;
      if (STATE.boot.settings) STATE.boot.settings.defaultLowStock = String(r.defaultLowStock);
    }
    toast('บันทึกการเตือนใกล้หมดแล้ว');
    loadLowStockSettings();
    loadItems();
    refreshStockCache().then(function () {
      if (document.getElementById('page-stock').classList.contains('active')) renderStock();
    });
  }).catch(function (e) { toast(e.message || String(e)); });
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
