var DrugAPI = (function () {
var LOC_MAIN = 'MAIN';
var LOC_CABINET = 'CABINET';
var LOC_LABEL = { MAIN: 'คลังหลัก', CABINET: 'ตู้ข้างนอก' };

var CATEGORIES = [
  'ยาเม็ด',
  'ยาสมุนไพร',
  'ยาน้ำ',
  'ยาฉีด',
  'ยาใช้ภายนอก',
  'ยาฉุกเฉิน',
  'ยาส่งต่อผู้ป่วยต่อเนื่อง',
  'เวชภัณฑ์ที่มิใช่ยา',
  'ยาแพทย์ออกหน่วย'
];

var VALUE_CATEGORIES = ['ยา', 'เวชภัณฑ์ที่ไม่ใช่ยา', 'วัสดุทางการแพทย์', 'วัคซีน'];

var SHEET_DEFS = {
  Settings: ['key', 'value'],
  Items: ['id', 'code', 'name', 'form', 'category', 'valueCategory', 'packSize', 'unit', 'unitPrice', 'yearQuota', 'lowStock', 'active', 'notes'],
  Stock: ['id', 'itemId', 'location', 'qty', 'unitPrice', 'expiry', 'lotNote'],
  Receipts: ['id', 'number', 'date', 'source', 'kind', 'notes', 'totalValue', 'createdAt'],
  ReceiptLines: ['id', 'receiptId', 'itemId', 'qtyText', 'qty', 'unitPrice', 'amount', 'expiry', 'requestedQty', 'approvedQty', 'notes'],
  Transfers: ['id', 'date', 'notes', 'totalQty', 'totalValue', 'createdAt'],
  TransferLines: ['id', 'transferId', 'itemId', 'stockId', 'qty', 'unitPrice', 'amount', 'expiry'],
  Adjustments: ['id', 'date', 'type', 'location', 'notes', 'totalValue', 'createdAt'],
  AdjustmentLines: ['id', 'adjustmentId', 'itemId', 'stockId', 'qty', 'unitPrice', 'amount', 'expiry'],
  Movements: ['id', 'date', 'type', 'location', 'itemId', 'stockId', 'qtyChange', 'unitPrice', 'amount', 'refId', 'notes'],
  MonthlyRequests: ['monthKey', 'itemId', 'qty'],
  Seq: ['name', 'n']
};

var SEQ_CACHE_ = null;
var SETTINGS_CACHE_ = null;
var SETTINGS_DIRTY_ = false;
var ITEMS_INDEX_CACHE_ = null;
var STOCK_VIEW_CACHE_ = {};

function invalidateStockCaches_() {
  ITEMS_INDEX_CACHE_ = null;
  STOCK_VIEW_CACHE_ = {};
}

function getItemsIndex_() {
  if (!ITEMS_INDEX_CACHE_) ITEMS_INDEX_CACHE_ = indexById_(readObjects_('Items'));
  return ITEMS_INDEX_CACHE_;
}

function enrichStockRow_(s, items) {
  var it = items[s.itemId] || {};
  return Object.assign({}, s, {
    name: it.name || '',
    category: it.category || '',
    valueCategory: it.valueCategory || '',
    packSize: it.packSize || '',
    amount: round2_(num_(s.qty) * num_(s.unitPrice)),
    locationLabel: LOC_LABEL[s.location] || s.location,
    expiryLabel: formatDate_(s.expiry),
    nearExpiry: isNearExpiry_(s.expiry)
  });
}

function sortStockRows_(rows) {
  rows.sort(function (a, b) {
    return String(a.category).localeCompare(String(b.category), 'th') || String(a.name).localeCompare(String(b.name), 'th');
  });
  return rows;
}

function callApi(name, payload) {
  ensureDb_();
  var fns = {
    bootstrap: apiBootstrap_,
    saveSettings: apiSaveSettings_,
    saveItem: apiSaveItem_,
    listItems: apiListItems_,
    listStock: apiListStock_,
    listStockAll: apiListStockAll_,
    saveReceipt: apiSaveReceipt_,
    listReceipts: apiListReceipts_,
    getReceipt: apiGetReceipt_,
    saveTransfer: apiSaveTransfer_,
    listTransfers: apiListTransfers_,
    saveAdjustment: apiSaveAdjustment_,
    listAdjustments: apiListAdjustments_,
    saveRequests: apiSaveRequests_,
    monthReport: apiMonthReport_,
    moneyReport: apiMoneyReport_,
    quarterReport: apiQuarterReport_,
    yearReport: apiYearReport_,
    importSeed: apiImportSeed_,
    parseQty: function (p) { return parseQty_(p && p.text); },
    searchItems: apiSearchItems_,
    login: apiLogin_,
    listUsers: apiListUsers_,
    addUser: apiAddUser_,
    removeUser: apiRemoveUser_
  };
  if (!fns[name]) throw new Error('ไม่พบคำสั่ง: ' + name);
  var result = fns[name](payload || {});
  flushSeq_();
  flushSettings_();
  return result;
}

function apiBootstrap_() {
  var settings = readSettings_();
  var items = readObjects_('Items');
  var stock = readObjects_('Stock');
  var receipts = readObjects_('Receipts');
  var transfers = readObjects_('Transfers');
  var adjustments = readObjects_('Adjustments');
  var dash = buildDashboard_(items, stock, receipts, transfers);
  return {
    settings: settings,
    categories: CATEGORIES,
    valueCategories: VALUE_CATEGORIES,
    locations: LOC_LABEL,
    itemCount: items.filter(function (i) { return i.active !== '0'; }).length,
    imported: String(settings.imported) === '1',
    storageMode: 'local',
    dashboard: dash,
    recentReceipts: receipts.slice(-8).reverse(),
    recentTransfers: transfers.slice(-8).reverse(),
    recentAdjustments: adjustments.slice(-8).reverse()
  };
}

function apiSaveSettings_(p) {
  var keys = ['unitName', 'unitSub', 'requesterName', 'requesterPosition', 'approverName', 'issuerName'];
  keys.forEach(function (k) {
    if (p[k] !== undefined) setSetting_(k, String(p[k]));
  });
  return { ok: true, settings: readSettings_() };
}

function parseUsers_(settings) {
  try {
    var raw = settings.loginUsers;
    if (!raw) return ['Napatsorn'];
    var arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) && arr.length ? arr : ['Napatsorn'];
  } catch (e) {
    return ['Napatsorn'];
  }
}

function apiListUsers_() {
  return { users: parseUsers_(readSettings_()) };
}

function apiLogin_(p) {
  var name = String(p.username || '').trim();
  if (!name) throw new Error('กรุณาใส่ Username');
  var users = parseUsers_(readSettings_());
  var ok = users.some(function (u) { return String(u).toLowerCase() === name.toLowerCase(); });
  if (!ok) throw new Error('Username ไม่ถูกต้อง');
  var matched = users.filter(function (u) { return String(u).toLowerCase() === name.toLowerCase(); })[0];
  setSetting_('lastLoginUser', matched);
  return { ok: true, username: matched };
}

function apiAddUser_(p) {
  var name = String(p.username || '').trim();
  if (!name) throw new Error('กรุณาใส่ Username');
  if (name.length < 2) throw new Error('Username สั้นเกินไป');
  var users = parseUsers_(readSettings_());
  if (users.some(function (u) { return String(u).toLowerCase() === name.toLowerCase(); })) {
    throw new Error('มี Username นี้แล้ว');
  }
  users.push(name);
  setSetting_('loginUsers', JSON.stringify(users));
  return { ok: true, users: users };
}

function apiRemoveUser_(p) {
  var name = String(p.username || '').trim();
  var users = parseUsers_(readSettings_()).filter(function (u) {
    return String(u).toLowerCase() !== name.toLowerCase();
  });
  if (!users.length) throw new Error('ต้องมีผู้ใช้อย่างน้อย 1 คน');
  setSetting_('loginUsers', JSON.stringify(users));
  return { ok: true, users: users };
}

function apiListItems_() {
  return { items: readObjects_('Items') };
}

function apiSearchItems_(p) {
  var q = String(p.q || '').toLowerCase().trim();
  var items = readObjects_('Items').filter(function (i) { return i.active !== '0'; });
  if (!q) return { items: items.slice(0, 40) };
  return {
    items: items.filter(function (i) {
      return (i.name + ' ' + i.code + ' ' + i.packSize + ' ' + i.category).toLowerCase().indexOf(q) >= 0;
    }).slice(0, 40)
  };
}

function apiSaveItem_(p) {
  var rows = readObjects_('Items');
  var item;
  if (p.id) {
    item = findById_(rows, p.id);
    if (!item) throw new Error('ไม่พบรายการ');
  } else {
    item = { id: nextId_('I'), active: '1', lowStock: '0', yearQuota: 0, unitPrice: 0, code: '', form: '', notes: '', unit: '' };
    rows.push(item);
  }
  item.name = String(p.name || '').trim();
  if (!item.name) throw new Error('กรุณาใส่ชื่อรายการ');
  item.code = String(p.code || '').trim();
  item.form = String(p.form || '').trim();
  item.category = p.category || 'ยาเม็ด';
  item.valueCategory = p.valueCategory || valueCategoryOf_(item.category);
  item.packSize = String(p.packSize || '').trim();
  item.unit = String(p.unit || '').trim();
  item.unitPrice = num_(p.unitPrice);
  item.yearQuota = num_(p.yearQuota);
  item.lowStock = num_(p.lowStock);
  item.active = p.active === false || p.active === '0' ? '0' : '1';
  item.notes = String(p.notes || '');
  writeObjects_('Items', rows);
  return { ok: true, item: item };
}

function apiListStock_(p) {
  var loc = p.location || '';
  var cacheKey = loc || '__ALL__';
  if (STOCK_VIEW_CACHE_[cacheKey]) return { stock: STOCK_VIEW_CACHE_[cacheKey] };
  var items = getItemsIndex_();
  var stock = readObjects_('Stock').filter(function (s) { return num_(s.qty) > 0 && (!loc || s.location === loc); });
  var rows = sortStockRows_(stock.map(function (s) { return enrichStockRow_(s, items); }));
  STOCK_VIEW_CACHE_[cacheKey] = rows;
  return { stock: rows };
}

function apiListStockAll_() {
  if (STOCK_VIEW_CACHE_.MAIN && STOCK_VIEW_CACHE_.CABINET) {
    return { MAIN: STOCK_VIEW_CACHE_.MAIN, CABINET: STOCK_VIEW_CACHE_.CABINET };
  }
  var items = getItemsIndex_();
  var out = { MAIN: [], CABINET: [] };
  readObjects_('Stock').forEach(function (s) {
    if (num_(s.qty) <= 0 || !out[s.location]) return;
    out[s.location].push(enrichStockRow_(s, items));
  });
  sortStockRows_(out.MAIN);
  sortStockRows_(out.CABINET);
  STOCK_VIEW_CACHE_.MAIN = out.MAIN;
  STOCK_VIEW_CACHE_.CABINET = out.CABINET;
  return out;
}

function apiSaveReceipt_(p) {
  if (!p.date) throw new Error('กรุณาใส่วันที่รับ');
  var lines = (p.lines || []).filter(function (l) { return l.itemId || l.name; });
  if (!lines.length) throw new Error('กรุณาเพิ่มอย่างน้อย 1 รายการ');
  var items = readObjects_('Items');
  var stock = readObjects_('Stock');
  var receipts = readObjects_('Receipts');
  var rLines = readObjects_('ReceiptLines');
  var moves = readObjects_('Movements');
  var rec = {
    id: nextId_('R'),
    number: String(p.number || '').trim(),
    date: toIsoDate_(p.date),
    source: String(p.source || 'โรงพยาบาลคลองท่อม'),
    kind: p.kind || 'ยา',
    notes: String(p.notes || ''),
    totalValue: 0,
    createdAt: nowIso_()
  };
  lines.forEach(function (line) {
    var item = line.itemId ? findById_(items, line.itemId) : null;
    if (!item && line.name) {
      item = {
        id: nextId_('I'),
        code: String(line.code || ''),
        name: String(line.name).trim(),
        form: String(line.form || ''),
        category: line.category || (rec.kind === 'เวชภัณฑ์' ? 'เวชภัณฑ์ที่มิใช่ยา' : 'ยาเม็ด'),
        valueCategory: line.valueCategory || (rec.kind === 'เวชภัณฑ์' ? 'เวชภัณฑ์ที่ไม่ใช่ยา' : 'ยา'),
        packSize: String(line.packSize || ''),
        unit: String(line.unit || ''),
        unitPrice: num_(line.unitPrice),
        yearQuota: 0,
        lowStock: 0,
        active: '1',
        notes: ''
      };
      items.push(item);
    }
    if (!item) throw new Error('ไม่พบรายการยา');
    var parsed = parseQty_(line.qtyText || line.qty);
    var qty = num_(line.approvedQty != null && line.approvedQty !== '' ? line.approvedQty : parsed.packs);
    if (qty <= 0) return;
    var price = num_(line.unitPrice != null ? line.unitPrice : item.unitPrice);
    var amount = round2_(qty * price);
    rec.totalValue = round2_(num_(rec.totalValue) + amount);
    var lid = nextId_('RL');
    rLines.push({
      id: lid,
      receiptId: rec.id,
      itemId: item.id,
      qtyText: parsed.raw || String(qty),
      qty: qty,
      unitPrice: price,
      amount: amount,
      expiry: toIsoDate_(line.expiry),
      requestedQty: num_(line.requestedQty != null ? line.requestedQty : qty),
      approvedQty: qty,
      notes: String(line.notes || '')
    });
    item.unitPrice = price;
    if (line.packSize) item.packSize = String(line.packSize);
    var lot = addStock_(stock, item.id, LOC_MAIN, qty, price, toIsoDate_(line.expiry), rec.number);
    moves.push(movement_('RECEIVE', rec.date, LOC_MAIN, item.id, lot.id, qty, price, amount, rec.id, rec.number));
  });
  rec.totalValue = round2_(rec.totalValue);
  receipts.push(rec);
  writeObjects_('Items', items);
  writeObjects_('Stock', stock);
  writeObjects_('Receipts', receipts);
  writeObjects_('ReceiptLines', rLines);
  writeObjects_('Movements', moves);
  return { ok: true, receipt: rec };
}

function apiListReceipts_() {
  return { receipts: readObjects_('Receipts').slice().reverse() };
}

function apiGetReceipt_(p) {
  var rec = findById_(readObjects_('Receipts'), p.id);
  if (!rec) throw new Error('ไม่พบใบรับ');
  var items = indexById_(readObjects_('Items'));
  var lines = readObjects_('ReceiptLines').filter(function (l) { return l.receiptId === rec.id; }).map(function (l) {
    var it = items[l.itemId] || {};
    return Object.assign({}, l, { name: it.name || '', packSize: it.packSize || '', category: it.category || '' });
  });
  return { receipt: rec, lines: lines };
}

function apiSaveTransfer_(p) {
  if (!p.date) throw new Error('กรุณาใส่วันที่เบิก');
  var lines = (p.lines || []).filter(function (l) { return l.stockId && num_(l.qty) > 0; });
  if (!lines.length) throw new Error('กรุณาเลือกรายการจากคลังหลัก');
  var stock = readObjects_('Stock');
  var items = indexById_(readObjects_('Items'));
  var heads = readObjects_('Transfers');
  var tLines = readObjects_('TransferLines');
  var moves = readObjects_('Movements');
  var tr = {
    id: nextId_('T'),
    date: toIsoDate_(p.date),
    notes: String(p.notes || ''),
    totalQty: 0,
    totalValue: 0,
    createdAt: nowIso_()
  };
  lines.forEach(function (line) {
    var from = findById_(stock, line.stockId);
    if (!from || from.location !== LOC_MAIN) throw new Error('ไม่พบสต็อกคลังหลัก');
    var qty = num_(line.qty);
    if (qty > num_(from.qty) + 1e-9) throw new Error('จำนวนเกินคงเหลือ: ' + ((items[from.itemId] || {}).name || from.itemId));
    var price = num_(from.unitPrice);
    var amount = round2_(qty * price);
    from.qty = round4_(num_(from.qty) - qty);
    var to = addStock_(stock, from.itemId, LOC_CABINET, qty, price, from.expiry, 'จากคลังหลัก');
    tLines.push({
      id: nextId_('TL'),
      transferId: tr.id,
      itemId: from.itemId,
      stockId: from.id,
      qty: qty,
      unitPrice: price,
      amount: amount,
      expiry: from.expiry || ''
    });
    moves.push(movement_('TRANSFER_OUT', tr.date, LOC_MAIN, from.itemId, from.id, -qty, price, amount, tr.id, ''));
    moves.push(movement_('TRANSFER_IN', tr.date, LOC_CABINET, from.itemId, to.id, qty, price, amount, tr.id, ''));
    tr.totalQty = round4_(num_(tr.totalQty) + qty);
    tr.totalValue = round2_(num_(tr.totalValue) + amount);
  });
  heads.push(tr);
  writeObjects_('Stock', stock);
  writeObjects_('Transfers', heads);
  writeObjects_('TransferLines', tLines);
  writeObjects_('Movements', moves);
  return { ok: true, transfer: tr };
}

function apiListTransfers_() {
  return { transfers: readObjects_('Transfers').slice().reverse() };
}

function apiSaveAdjustment_(p) {
  var type = p.type || 'USAGE';
  var location = p.location || LOC_CABINET;
  if (!p.date) throw new Error('กรุณาใส่วันที่');
  var lines = (p.lines || []).filter(function (l) { return l.stockId && (num_(l.qty) > 0 || type === 'COUNT'); });
  if (!lines.length) throw new Error('กรุณาเลือกรายการ');
  var stock = readObjects_('Stock');
  var items = indexById_(readObjects_('Items'));
  var heads = readObjects_('Adjustments');
  var aLines = readObjects_('AdjustmentLines');
  var moves = readObjects_('Movements');
  var adj = {
    id: nextId_('A'),
    date: toIsoDate_(p.date),
    type: type,
    location: location,
    notes: String(p.notes || ''),
    totalValue: 0,
    createdAt: nowIso_()
  };
  lines.forEach(function (line) {
    var lot = findById_(stock, line.stockId);
    if (!lot) throw new Error('ไม่พบสต็อก');
    var price = num_(lot.unitPrice);
    var qty;
    var change;
    if (type === 'COUNT') {
      var counted = num_(line.counted);
      change = round4_(counted - num_(lot.qty));
      qty = Math.abs(change);
      lot.qty = counted;
    } else {
      qty = num_(line.qty);
      if (qty > num_(lot.qty) + 1e-9) throw new Error('จำนวนเกินคงเหลือ: ' + ((items[lot.itemId] || {}).name || ''));
      change = -qty;
      lot.qty = round4_(num_(lot.qty) - qty);
    }
    var amount = round2_(Math.abs(change) * price);
    aLines.push({
      id: nextId_('AL'),
      adjustmentId: adj.id,
      itemId: lot.itemId,
      stockId: lot.id,
      qty: change,
      unitPrice: price,
      amount: amount,
      expiry: lot.expiry || ''
    });
    moves.push(movement_(type, adj.date, lot.location, lot.itemId, lot.id, change, price, amount, adj.id, adj.notes));
    if (change < 0) adj.totalValue = round2_(num_(adj.totalValue) + amount);
  });
  heads.push(adj);
  writeObjects_('Stock', stock);
  writeObjects_('Adjustments', heads);
  writeObjects_('AdjustmentLines', aLines);
  writeObjects_('Movements', moves);
  return { ok: true, adjustment: adj };
}

function apiListAdjustments_() {
  return { adjustments: readObjects_('Adjustments').slice().reverse() };
}

function apiSaveRequests_(p) {
  var monthKey = p.monthKey;
  if (!monthKey) throw new Error('ระบุเดือน');
  var all = readObjects_('MonthlyRequests').filter(function (r) { return r.monthKey !== monthKey; });
  (p.rows || []).forEach(function (r) {
    if (num_(r.qty) > 0) all.push({ monthKey: monthKey, itemId: r.itemId, qty: num_(r.qty) });
  });
  writeObjects_('MonthlyRequests', all);
  return { ok: true };
}

function apiMonthReport_(p) {
  var monthKey = p.monthKey || currentMonthKey_();
  var range = monthRange_(monthKey);
  var items = readObjects_('Items').filter(function (i) { return i.active !== '0'; });
  var stock = readObjects_('Stock');
  var moves = readObjects_('Movements');
  var reqs = {};
  readObjects_('MonthlyRequests').forEach(function (r) {
    if (r.monthKey === monthKey) reqs[r.itemId] = num_(r.qty);
  });
  var byItem = {};
  items.forEach(function (it) {
    byItem[it.id] = {
      item: it,
      opening: 0,
      received: 0,
      issued: 0,
      remain: 0,
      request: reqs[it.id] || 0,
      remainValue: 0
    };
  });
  stock.forEach(function (s) {
    if (s.location !== LOC_MAIN || !byItem[s.itemId]) return;
    byItem[s.itemId].remain += num_(s.qty);
    byItem[s.itemId].remainValue += num_(s.qty) * num_(s.unitPrice);
  });
  moves.forEach(function (m) {
    var row = byItem[m.itemId];
    if (!row || m.location !== LOC_MAIN) return;
    var d = m.date;
    var ch = num_(m.qtyChange);
    if (d > range.end) {
      row.remain -= ch;
    } else if (d >= range.start && d <= range.end) {
      if (m.type === 'RECEIVE') row.received += Math.max(ch, 0);
      if (ch < 0) row.issued += -ch;
    }
  });
  Object.keys(byItem).forEach(function (id) {
    var r = byItem[id];
    r.opening = round4_(r.remain - r.received + r.issued);
    r.remain = round4_(r.remain);
    r.received = round4_(r.received);
    r.issued = round4_(r.issued);
    r.remainValue = round2_(r.remainValue);
  });
  var groups = [];
  CATEGORIES.forEach(function (cat) {
    var rows = items.filter(function (i) { return i.category === cat; }).map(function (i) { return byItem[i.id]; });
    if (rows.length) groups.push({ category: cat, rows: rows, totalValue: round2_(rows.reduce(function (s, r) { return s + r.remainValue; }, 0)) });
  });
  var extra = items.filter(function (i) { return CATEGORIES.indexOf(i.category) < 0; });
  if (extra.length) {
    var rows = extra.map(function (i) { return byItem[i.id]; });
    groups.push({ category: 'อื่น ๆ', rows: rows, totalValue: round2_(rows.reduce(function (s, r) { return s + r.remainValue; }, 0)) });
  }
  return {
    monthKey: monthKey,
    label: monthLabel_(monthKey),
    range: range,
    settings: readSettings_(),
    groups: groups,
    grandTotal: round2_(groups.reduce(function (s, g) { return s + g.totalValue; }, 0))
  };
}

function apiMoneyReport_(p) {
  var monthKey = p.monthKey || currentMonthKey_();
  var range = monthRange_(monthKey);
  var items = indexById_(readObjects_('Items'));
  var stock = readObjects_('Stock');
  var moves = readObjects_('Movements');
  var seed = getSeedMoney();
  var map = {};
  VALUE_CATEGORIES.forEach(function (c) {
    map[c] = { category: c, opening: 0, buy: 0, receive: 0, used: 0, remain: 0 };
  });
  stock.forEach(function (s) {
    var it = items[s.itemId] || {};
    var cat = it.valueCategory || 'ยา';
    if (!map[cat]) map[cat] = { category: cat, opening: 0, buy: 0, receive: 0, used: 0, remain: 0 };
    map[cat].remain += num_(s.qty) * num_(s.unitPrice);
  });
  moves.forEach(function (m) {
    var it = items[m.itemId] || {};
    var cat = it.valueCategory || 'ยา';
    if (!map[cat]) return;
    var d = m.date;
    var amt = num_(m.qtyChange) * num_(m.unitPrice);
    if (d > range.end) {
      map[cat].remain -= amt;
    } else if (d >= range.start && d <= range.end) {
      if (m.type === 'RECEIVE') map[cat].receive += Math.max(amt, 0);
      if (m.type === 'USAGE' || (m.type === 'COUNT' && num_(m.qtyChange) < 0)) map[cat].used += Math.max(-amt, 0);
    }
  });
  var rows = VALUE_CATEGORIES.map(function (c) {
    var r = map[c];
    r.remain = round2_(r.remain);
    r.receive = round2_(r.receive);
    r.used = round2_(r.used);
    r.opening = round2_(r.remain - r.receive + r.used);
    return r;
  });
  var settings = readSettings_();
  if (settings.imported === '1' && monthKey <= seed.asOf) {
    /* keep computed */
  }
  return {
    monthKey: monthKey,
    label: monthLabel_(monthKey),
    settings: settings,
    rows: rows,
    seedHint: seed
  };
}

function apiQuarterReport_(p) {
  var items = readObjects_('Items').filter(function (i) {
    return i.active !== '0' && (i.category === 'เวชภัณฑ์ที่มิใช่ยา' || i.valueCategory === 'เวชภัณฑ์ที่ไม่ใช่ยา');
  });
  var stock = readObjects_('Stock');
  var remain = {};
  stock.forEach(function (s) {
    remain[s.itemId] = (remain[s.itemId] || 0) + num_(s.qty);
  });
  var monthKey = p.monthKey || currentMonthKey_();
  var reqs = {};
  readObjects_('MonthlyRequests').forEach(function (r) {
    if (r.monthKey === monthKey) reqs[r.itemId] = num_(r.qty);
  });
  var rows = items.map(function (it, idx) {
    var qtyReq = reqs[it.id] || 0;
    return {
      no: idx + 1,
      item: it,
      remain: remain[it.id] || 0,
      yearQuota: num_(it.yearQuota),
      request: qtyReq,
      amount: round2_(qtyReq * num_(it.unitPrice))
    };
  });
  return {
    monthKey: monthKey,
    label: monthLabel_(monthKey),
    settings: readSettings_(),
    rows: rows,
    total: round2_(rows.reduce(function (s, r) { return s + r.amount; }, 0))
  };
}

function apiYearReport_(p) {
  var monthKey = p.monthKey || currentMonthKey_();
  var data = apiMonthReport_({ monthKey: monthKey });
  return data;
}

function apiImportSeed_(p) {
  if (typeof getSeedMedicine !== 'function') {
    throw new Error('ไม่พบชุดข้อมูลตั้งต้นในสคริปต์');
  }
  if (String(readSettings_().imported) === '1' && !p.force) {
    return { ok: false, message: 'นำเข้าไปแล้ว หากต้องการนำเข้าใหม่ให้ยืนยันทับข้อมูล' };
  }
  var med = getSeedMedicine();
  var quarter = getSeedQuarter();
  var money = getSeedMoney();
  var items = [];
  var stock = [];
  var moves = [];
  var reqs = [];
  var itemMap = {};
  function upsert(row, extra) {
    extra = extra || {};
    if (!row.name || row.name === 'วัสดุทางการแพทย์' || row.name === 'รายการยา') return;
    var key = [row.name, row.packSize || '', row.category || ''].join('|').toLowerCase();
    var item = itemMap[key];
    if (!item) {
      item = {
        id: nextId_('I'),
        code: '',
        name: row.name,
        form: '',
        category: row.category,
        valueCategory: row.valueCategory || valueCategoryOf_(row.category),
        packSize: row.packSize || '',
        unit: extra.unit || row.packSize || '',
        unitPrice: num_(row.unitPrice),
        yearQuota: num_(row.yearQuota || extra.yearQuota),
        lowStock: 0,
        active: '1',
        notes: ''
      };
      items.push(item);
      itemMap[key] = item;
    } else {
      if (num_(row.yearQuota)) item.yearQuota = num_(row.yearQuota);
      if (num_(row.unitPrice) && !num_(item.unitPrice)) item.unitPrice = num_(row.unitPrice);
    }
    var remain = num_(row.remain);
    var price = num_(row.unitPrice) || num_(item.unitPrice);
    if (remain > 0) {
      var lot = addStock_(stock, item.id, LOC_MAIN, remain, price, '', 'ยอดยกมา พ.ค.69');
      var amt = round2_(remain * price);
      moves.push(movement_('OPENING', '2026-05-31', LOC_MAIN, item.id, lot.id, remain, price, amt, 'SEED', 'เปิดระบบ'));
    }
    if (num_(row.request) > 0) reqs.push({ monthKey: '2569-05', itemId: item.id, qty: num_(row.request) });
    return item;
  }
  med.forEach(function (r) { upsert(r); });
  quarter.forEach(function (r) { upsert(r, { yearQuota: r.yearQuota }); });
  writeObjects_('Items', items);
  writeObjects_('Stock', stock);
  writeObjects_('Movements', moves);
  writeObjects_('MonthlyRequests', reqs);
  writeObjects_('Receipts', []);
  writeObjects_('ReceiptLines', []);
  writeObjects_('Transfers', []);
  writeObjects_('TransferLines', []);
  writeObjects_('Adjustments', []);
  writeObjects_('AdjustmentLines', []);
  setSetting_('imported', '1');
  setSetting_('moneyOpenMonth', money.asOf);
  VALUE_CATEGORIES.forEach(function (c) {
    setSetting_('moneyOpen_' + c, String(money[c] || 0));
  });
  return {
    ok: true,
    itemCount: items.length,
    stockLots: stock.length,
    message: 'นำเข้า ' + items.length + ' รายการ จากไฟล์เดิมแล้ว'
  };
}

function buildDashboard_(items, stock, receipts, transfers) {
  var itemMap = indexById_(items);
  var mainVal = 0;
  var cabVal = 0;
  var byVal = {};
  VALUE_CATEGORIES.forEach(function (c) { byVal[c] = 0; });
  var low = [];
  var expiry = [];
  stock.forEach(function (s) {
    var q = num_(s.qty);
    if (q <= 0) return;
    var amt = q * num_(s.unitPrice);
    if (s.location === LOC_MAIN) mainVal += amt;
    else cabVal += amt;
    var it = itemMap[s.itemId] || {};
    var vc = it.valueCategory || 'ยา';
    byVal[vc] = (byVal[vc] || 0) + amt;
    if (num_(it.lowStock) > 0 && q <= num_(it.lowStock)) {
      low.push({ name: it.name, qty: q, location: LOC_LABEL[s.location] });
    }
    if (isNearExpiry_(s.expiry)) {
      expiry.push({ name: it.name, expiry: formatDate_(s.expiry), qty: q, location: LOC_LABEL[s.location] });
    }
  });
  return {
    mainValue: round2_(mainVal),
    cabinetValue: round2_(cabVal),
    totalValue: round2_(mainVal + cabVal),
    byValue: VALUE_CATEGORIES.map(function (c) { return { category: c, value: round2_(byVal[c] || 0) }; }),
    low: low.slice(0, 12),
    expiry: expiry.slice(0, 12),
    receiptCount: receipts.length,
    transferCount: transfers.length
  };
}

function addStock_(stock, itemId, location, qty, price, expiry, lotNote) {
  expiry = expiry || '';
  price = num_(price);
  var found = stock.filter(function (s) {
    return s.itemId === itemId && s.location === location && num_(s.unitPrice) === price && String(s.expiry || '') === expiry;
  })[0];
  if (found) {
    found.qty = round4_(num_(found.qty) + num_(qty));
    return found;
  }
  var row = {
    id: nextId_('S'),
    itemId: itemId,
    location: location,
    qty: round4_(num_(qty)),
    unitPrice: price,
    expiry: expiry,
    lotNote: lotNote || ''
  };
  stock.push(row);
  return row;
}

function movement_(type, date, location, itemId, stockId, qtyChange, price, amount, refId, notes) {
  return {
    id: nextId_('M'),
    date: toIsoDate_(date),
    type: type,
    location: location,
    itemId: itemId,
    stockId: stockId || '',
    qtyChange: num_(qtyChange),
    unitPrice: num_(price),
    amount: num_(amount),
    refId: refId || '',
    notes: notes || ''
  };
}

function parseQty_(text) {
  var raw = String(text == null ? '' : text).trim();
  if (!raw) return { packs: 0, size: 1, raw: '' };
  var m = raw.replace(/,/g, '').match(/^\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)?/ );
  if (m) {
    return { packs: Number(m[1]), size: m[2] ? Number(m[2]) : 1, raw: raw };
  }
  var n = Number(raw.replace(/[^\d.]/g, ''));
  return { packs: isNaN(n) ? 0 : n, size: 1, raw: raw };
}

function valueCategoryOf_(cat) {
  if (cat === 'เวชภัณฑ์ที่มิใช่ยา') return 'เวชภัณฑ์ที่ไม่ใช่ยา';
  if (String(cat).indexOf('วัคซีน') >= 0) return 'วัคซีน';
  if (String(cat).indexOf('วัสดุ') >= 0) return 'วัสดุทางการแพทย์';
  return 'ยา';
}

function ensureDb_() {
  var def = {
    unitName: 'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านทรายขาว',
    unitSub: 'ต.ทรายขาว อ.คลองท่อม จ.กระบี่',
    requesterName: 'นายอรรถพร พิรุณรัตน์',
    requesterPosition: 'นักวิชาการสาธารณสุขชำนาญการ',
    approverName: '',
    issuerName: 'นางสาวสุภารัตน์ จงรักษ์',
    imported: '0',
    loginUsers: '["Napatsorn"]'
  };
  var cur = readSettings_();
  var changed = false;
  Object.keys(def).forEach(function (k) {
    if (cur[k] == null || cur[k] === '') {
      cur[k] = def[k];
      changed = true;
    }
  });
  if (!cur.loginUsers) {
    cur.loginUsers = '["Napatsorn"]';
    changed = true;
  }
  if (changed) {
    SETTINGS_CACHE_ = cur;
    SETTINGS_DIRTY_ = true;
    flushSettings_();
  }
}

function readSettings_() {
  if (SETTINGS_CACHE_) return SETTINGS_CACHE_;
  SETTINGS_CACHE_ = DB.readSettingsObj();
  return SETTINGS_CACHE_;
}

function getSetting_(key, fallback) {
  var v = readSettings_()[key];
  return v == null || v === '' ? fallback : v;
}

function setSetting_(key, value) {
  var o = readSettings_();
  o[key] = value;
  SETTINGS_CACHE_ = o;
  SETTINGS_DIRTY_ = true;
}

function flushSettings_() {
  if (!SETTINGS_DIRTY_ || !SETTINGS_CACHE_) return;
  DB.writeSettingsObj(SETTINGS_CACHE_);
  SETTINGS_DIRTY_ = false;
}

function nextId_(prefix) {
  if (!SEQ_CACHE_) {
    SEQ_CACHE_ = DB.readSeqObj();
  }
  SEQ_CACHE_[prefix] = (SEQ_CACHE_[prefix] || 0) + 1;
  var n = String(SEQ_CACHE_[prefix]);
  return prefix + '-' + (n.length >= 4 ? n : ('0000' + n).slice(-4));
}

function flushSeq_() {
  if (!SEQ_CACHE_) return;
  DB.writeSeqObj(SEQ_CACHE_);
}

function readObjects_(name) {
  if (name === 'Settings') {
    var o = DB.readSettingsObj();
    return Object.keys(o).map(function (k) { return { key: k, value: o[k] }; });
  }
  if (name === 'Seq') {
    var seq = DB.readSeqObj();
    return Object.keys(seq).map(function (k) { return { name: k, n: seq[k] }; });
  }
  return DB.readObjects(name);
}

function writeObjects_(name, rows) {
  if (name === 'Settings') {
    var o = {};
    rows.forEach(function (r) { o[r.key] = r.value; });
    DB.writeSettingsObj(o);
    SETTINGS_CACHE_ = o;
    SETTINGS_DIRTY_ = false;
    return;
  }
  if (name === 'Seq') {
    var seq = {};
    rows.forEach(function (r) { seq[r.name] = r.n; });
    DB.writeSeqObj(seq);
    return;
  }
  DB.writeObjects(name, rows);
  if (name === 'Items' || name === 'Stock') invalidateStockCaches_();
}

function findById_(rows, id) {
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) return rows[i];
  return null;
}

function indexById_(rows) {
  var o = {};
  rows.forEach(function (r) { o[r.id] = r; });
  return o;
}

function num_(v) {
  if (v === '' || v == null) return 0;
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

function round2_(n) { return Math.round((num_(n) + Number.EPSILON) * 100) / 100; }
function round4_(n) { return Math.round((num_(n) + Number.EPSILON) * 10000) / 10000; }

function pad2_(n) { return ('0' + n).slice(-2); }

function nowIso_() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate()) + ' ' + pad2_(d.getHours()) + ':' + pad2_(d.getMinutes()) + ':' + pad2_(d.getSeconds());
}

function toIsoDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
    return v.getFullYear() + '-' + pad2_(v.getMonth() + 1) + '-' + pad2_(v.getDate());
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    var y = Number(m[3]);
    if (y > 2400) y -= 543;
    if (y < 100) y += 2500 - 543;
    return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function formatDate_(v) {
  var iso = toIsoDate_(v);
  if (!iso) return '';
  var p = iso.split('-');
  if (p.length !== 3) return iso;
  return p[2] + '/' + p[1] + '/' + (Number(p[0]) + 543);
}

function isNearExpiry_(v) {
  var iso = toIsoDate_(v);
  if (!iso) return false;
  var d = new Date(iso + 'T00:00:00+07:00');
  var limit = new Date();
  limit.setMonth(limit.getMonth() + 6);
  return d.getTime() <= limit.getTime();
}

function currentMonthKey_() {
  var now = new Date();
  var y = now.getFullYear() + 543;
  var m = now.getMonth() + 1;
  return y + '-' + ('0' + m).slice(-2);
}

function monthRange_(monthKey) {
  var p = String(monthKey).split('-');
  var be = Number(p[0]);
  var m = Number(p[1]);
  var y = be - 543;
  var start = y + '-' + ('0' + m).slice(-2) + '-01';
  var endDate = new Date(y, m, 0);
  var end = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + endDate.getDate()).slice(-2);
  return { start: start, end: end };
}

function monthLabel_(monthKey) {
  var months = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var p = String(monthKey).split('-');
  return months[Number(p[1])] + ' ' + p[0];
}

return {
  api: function (name, payload) {
    return Promise.resolve().then(function () {
      try {
        return callApi(name, payload || {});
      } catch (err) {
        throw new Error(err && err.message ? err.message : String(err));
      }
    });
  },
  exportData: function () {
    return DB.exportAll();
  }
};
})();
