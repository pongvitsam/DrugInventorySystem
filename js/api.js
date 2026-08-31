var DrugAPI = (function () {
var LOC_MAIN = 'MAIN';
var LOC_LABEL = { MAIN: 'คลังหลัก' };

var CATEGORIES = [
  'ยาเม็ด',
  'ยาสมุนไพร',
  'ยาน้ำ',
  'ยาฉีด',
  'ยาใช้ภายนอก',
  'ยาฉุกเฉิน',
  'ยาส่งต่อผู้ป่วยต่อเนื่อง',
  'เวชภัณฑ์ที่มิใช่ยา',
  'ยาแพทย์ออกหน่วย',
  'วัสดุทางการแพทย์',
  'วัคซีน'
];

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
    packSize: it.packSize || '',
    amount: round2_(num_(s.qty) * num_(s.unitPrice)),
    locationLabel: LOC_LABEL[s.location] || s.location,
    expiryLabel: formatDate_(s.expiry),
    nearExpiry: isNearExpiry_(s.expiry)
  });
}

function sortStockRows_(rows) {
  rows.sort(function (a, b) {
    var ae = a.expiry || '9999-99-99';
    var be = b.expiry || '9999-99-99';
    return String(a.name).localeCompare(String(b.name), 'th') ||
      ae.localeCompare(be) ||
      String(a.category).localeCompare(String(b.category), 'th');
  });
  return rows;
}

function markFefoRecommend_(rows) {
  var earliest = {};
  rows.forEach(function (s) {
    if (!s.expiry) return;
    if (!earliest[s.itemId] || s.expiry < earliest[s.itemId]) earliest[s.itemId] = s.expiry;
  });
  rows.forEach(function (s) {
    s.fefoRecommend = !!(s.expiry && earliest[s.itemId] === s.expiry);
  });
  return rows;
}

function callApi(name, payload) {
  ensureDb_();
  var fns = {
    bootstrap: apiBootstrap_,
    saveSettings: apiSaveSettings_,
    saveOptionLists: apiSaveOptionLists_,
    saveItem: apiSaveItem_,
    saveStockLots: apiSaveStockLots_,
    listItems: apiListItems_,
    listStock: apiListStock_,
    listStockAll: apiListStockAll_,
    saveReceipt: apiSaveReceipt_,
    listReceipts: apiListReceipts_,
    getReceipt: apiGetReceipt_,
    saveTransfer: apiSaveTransfer_,
    listTransfers: apiListTransfers_,
    getTransfer: apiGetTransfer_,
    monthReport: apiMonthReport_,
    moneyReport: apiMoneyReport_,
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

function parseJsonList_(raw) {
  try {
    if (!raw) return null;
    var arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.map(function (x) { return String(x || '').trim(); }).filter(Boolean) : null;
  } catch (e) {
    return null;
  }
}

function listCategories_() {
  var custom = parseJsonList_(readSettings_().listCategories);
  return custom && custom.length ? custom : CATEGORIES.slice();
}

function apiSaveOptionLists_(p) {
  if (p.categories) setSetting_('listCategories', JSON.stringify(p.categories));
  if (p.packSizes) setSetting_('listPackSizes', JSON.stringify(p.packSizes));
  if (p.forms) setSetting_('listForms', JSON.stringify(p.forms));
  return {
    ok: true,
    categories: listCategories_(),
    packSizes: parseJsonList_(readSettings_().listPackSizes) || [],
    forms: parseJsonList_(readSettings_().listForms) || []
  };
}

function apiBootstrap_() {
  var settings = readSettings_();
  var items = normalizeItemPacks_(readObjects_('Items'));
  var stock = readObjects_('Stock').filter(function (s) { return s.location === LOC_MAIN; });
  var receipts = readObjects_('Receipts');
  var transfers = readObjects_('Transfers');
  var dash = buildDashboard_(items, stock, receipts, transfers);
  return {
    settings: settings,
    categories: listCategories_(),
    packSizes: parseJsonList_(settings.listPackSizes) || [],
    forms: parseJsonList_(settings.listForms) || [],
    locations: LOC_LABEL,
    itemCount: items.filter(function (i) { return i.active !== '0'; }).length,
    imported: String(settings.imported) === '1',
    storageMode: 'local',
    dashboard: dash,
    recentReceipts: receipts.slice(-8).reverse(),
    recentTransfers: transfers.slice(-8).reverse()
  };
}

function apiSaveSettings_(p) {
  var keys = [
    'unitName', 'unitSub',
    'approverName', 'approverPosition',
    'requesterName', 'requesterPosition',
    'receiverName', 'receiverPosition',
    'issuerName', 'issuerPosition'
  ];
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
  var items = normalizeItemPacks_(readObjects_('Items'));
  var stock = readObjects_('Stock').filter(function (s) {
    return s.location === LOC_MAIN && num_(s.qty) > 0;
  });
  var byItem = {};
  stock.forEach(function (s) {
    if (!byItem[s.itemId]) byItem[s.itemId] = [];
    byItem[s.itemId].push({
      stockId: s.id,
      qty: round4_(num_(s.qty)),
      unitPrice: num_(s.unitPrice),
      expiry: s.expiry || '',
      expiryLabel: formatDate_(s.expiry),
      nearExpiry: isNearExpiry_(s.expiry),
      amount: round2_(num_(s.qty) * num_(s.unitPrice))
    });
  });
  Object.keys(byItem).forEach(function (id) {
    byItem[id].sort(function (a, b) {
      return String(a.expiry || '9999-99-99').localeCompare(String(b.expiry || '9999-99-99'));
    });
  });
  var enriched = items.map(function (it) {
    var lots = byItem[it.id] || [];
    var stockQty = round4_(lots.reduce(function (s, l) { return s + num_(l.qty); }, 0));
    var stockValue = round2_(lots.reduce(function (s, l) { return s + num_(l.amount); }, 0));
    return Object.assign({}, it, {
      lots: lots,
      stockQty: stockQty,
      stockValue: stockValue
    });
  });
  return { items: enriched };
}

function apiSearchItems_(p) {
  var q = String(p.q || '').toLowerCase().trim();
  var items = normalizeItemPacks_(readObjects_('Items')).filter(function (i) { return i.active !== '0'; });
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
    item = { id: nextId_('I'), active: '1', lowStock: 0, yearQuota: 0, unitPrice: 0, code: '', form: '', notes: '', unit: '' };
    rows.push(item);
  }
  item.name = String(p.name || '').trim();
  if (!item.name) throw new Error('กรุณาใส่ชื่อรายการ');
  item.code = String(p.code || '').trim();
  item.form = String(p.form || '').trim();
  item.category = p.category || 'ยาเม็ด';
  item.valueCategory = valueCategoryOf_(item.category);
  item.packSize = preferSpacedPack_(String(p.packSize || '').trim());
  item.unit = String(p.unit || item.packSize || '').trim();
  item.unitPrice = num_(p.unitPrice);
  item.yearQuota = 0;
  item.lowStock = 0;
  item.active = p.active === false || p.active === '0' ? '0' : '1';
  item.notes = String(p.notes || '');
  writeObjects_('Items', rows);
  return { ok: true, item: item };
}

function apiSaveStockLots_(p) {
  var itemId = String(p.itemId || '');
  if (!itemId) throw new Error('ไม่พบรายการ');
  var items = readObjects_('Items');
  var item = findById_(items, itemId);
  if (!item) throw new Error('ไม่พบรายการ');
  var stock = readObjects_('Stock');
  var moves = readObjects_('Movements');
  var todayIso = new Date().toISOString().slice(0, 10);
  var defaultPrice = num_(item.unitPrice);
  var lots = p.lots || [];
  (p.removeStockIds || []).forEach(function (sid) {
    var row = findById_(stock, sid);
    if (!row || row.itemId !== itemId) return;
    var oldQty = num_(row.qty);
    if (oldQty > 0) {
      moves.push(movement_('COUNT', todayIso, LOC_MAIN, itemId, row.id, -oldQty, num_(row.unitPrice),
        round2_(-oldQty * num_(row.unitPrice)), '', 'ลบล็อตจากทะเบียน'));
    }
    row.qty = 0;
  });
  lots.forEach(function (lot) {
    var qty = num_(lot.qty);
    var expiry = toIsoDate_(lot.expiry);
    var stockId = String(lot.stockId || '');
    if (stockId) {
      var row = findById_(stock, stockId);
      if (!row || row.itemId !== itemId) throw new Error('ไม่พบล็อตสต็อก');
      var oldQty = num_(row.qty);
      row.expiry = expiry;
      if (qty <= 0) {
        if (oldQty > 0) {
          moves.push(movement_('COUNT', todayIso, LOC_MAIN, itemId, row.id, -oldQty, num_(row.unitPrice),
            round2_(-oldQty * num_(row.unitPrice)), '', 'ลบล็อตจากทะเบียน'));
        }
        row.qty = 0;
      } else {
        var delta = round4_(qty - oldQty);
        row.qty = round4_(qty);
        if (Math.abs(delta) > 1e-9) {
          moves.push(movement_('COUNT', todayIso, LOC_MAIN, itemId, row.id, delta, num_(row.unitPrice),
            round2_(delta * num_(row.unitPrice)), '', 'แก้ไขยอดจากทะเบียน'));
        }
      }
      return;
    }
    if (qty <= 0) return;
    var unitPrice = num_(lot.unitPrice != null ? lot.unitPrice : defaultPrice);
    var added = addStock_(stock, itemId, LOC_MAIN, qty, unitPrice, expiry, 'ทะเบียน');
    moves.push(movement_('COUNT', todayIso, LOC_MAIN, itemId, added.id, qty, unitPrice,
      round2_(qty * unitPrice), '', 'เพิ่มล็อตจากทะเบียน'));
  });
  stock = stock.filter(function (s) { return num_(s.qty) > 0; });
  writeObjects_('Stock', stock);
  writeObjects_('Movements', moves);
  return { ok: true };
}

function apiListStock_(p) {
  var loc = p.location || LOC_MAIN;
  var cacheKey = loc || '__ALL__';
  if (STOCK_VIEW_CACHE_[cacheKey]) return { stock: STOCK_VIEW_CACHE_[cacheKey] };
  var items = getItemsIndex_();
  var stock = readObjects_('Stock').filter(function (s) {
    return num_(s.qty) > 0 && s.location === (loc || LOC_MAIN);
  });
  var rows = markFefoRecommend_(sortStockRows_(stock.map(function (s) { return enrichStockRow_(s, items); })));
  STOCK_VIEW_CACHE_[cacheKey] = rows;
  return { stock: rows };
}

function apiListStockAll_() {
  if (STOCK_VIEW_CACHE_.MAIN) return { MAIN: STOCK_VIEW_CACHE_.MAIN };
  var r = apiListStock_({ location: LOC_MAIN });
  return { MAIN: r.stock };
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
        packSize: preferSpacedPack_(String(line.packSize || '')),
        unit: String(line.unit || line.packSize || ''),
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
  if (!lines.length && !p.id) throw new Error('กรุณาเลือกรายการจากคลังหลัก');
  var stock = readObjects_('Stock');
  var items = indexById_(readObjects_('Items'));
  var heads = readObjects_('Transfers');
  var tLines = readObjects_('TransferLines');
  var moves = readObjects_('Movements');

  if (p.id) {
    var upd = apiUpdateTransfer_(p, lines, stock, items, heads, tLines, moves);
    writeObjects_('Stock', stock);
    writeObjects_('Transfers', heads);
    writeObjects_('TransferLines', upd.tLines);
    writeObjects_('Movements', upd.moves);
    return { ok: true, transfer: upd.transfer, returnedQty: upd.returnedQty, returnedCount: upd.returnedCount };
  }

  var tr = {
    id: nextId_('T'),
    date: toIsoDate_(p.date),
    notes: String(p.notes || ''),
    totalQty: 0,
    totalValue: 0,
    createdAt: nowIso_()
  };
  applyTransferLines_(tr, lines, stock, items, tLines, moves);
  heads.push(tr);
  writeObjects_('Stock', stock);
  writeObjects_('Transfers', heads);
  writeObjects_('TransferLines', tLines);
  writeObjects_('Movements', moves);
  return { ok: true, transfer: tr };
}

function returnStockQty_(stock, line, qty) {
  qty = round4_(num_(qty));
  if (qty <= 0) return null;
  var st = findById_(stock, line.stockId);
  if (st) {
    st.qty = round4_(num_(st.qty) + qty);
    return st;
  }
  st = {
    id: line.stockId || nextId_('S'),
    itemId: line.itemId,
    location: LOC_MAIN,
    qty: qty,
    unitPrice: num_(line.unitPrice),
    expiry: line.expiry || '',
    lotNote: ''
  };
  stock.push(st);
  return st;
}

function pushTransferLineRecord_(tr, line, stock, items, tLines) {
  var from = findById_(stock, line.stockId);
  if (!from || from.location !== LOC_MAIN) throw new Error('ไม่พบสต็อกคลังหลัก');
  var qty = num_(line.qty);
  var price = num_(from.unitPrice);
  var amount = round2_(qty * price);
  tLines.push({
    id: nextId_('TL'),
    transferId: tr.id,
    itemId: from.itemId,
    stockId: from.id,
    qty: qty,
    approvedQty: qty,
    unitPrice: price,
    amount: amount,
    expiry: from.expiry || '',
    packSize: (items[from.itemId] || {}).packSize || '',
    name: (items[from.itemId] || {}).name || line.name || ''
  });
  tr.totalQty = round4_(num_(tr.totalQty) + qty);
  tr.totalValue = round2_(num_(tr.totalValue) + amount);
}

function apiUpdateTransfer_(p, lines, stock, items, heads, tLines, moves) {
  var tr = findById_(heads, p.id);
  if (!tr) throw new Error('ไม่พบใบเบิก');
  var oldLines = tLines.filter(function (l) { return l.transferId === tr.id; });
  var editDate = toIsoDate_(p.date);
  var returnedQty = 0;
  var returnedCount = 0;
  var newMoves = [];

  oldLines.forEach(function (old) {
    var oldQty = num_(old.qty);
    var newLine = lines.filter(function (l) { return l.stockId === old.stockId; })[0];
    var newQty = newLine ? num_(newLine.qty) : 0;
    var returnQty = round4_(oldQty - newQty);
    if (returnQty > 1e-9) {
      returnStockQty_(stock, old, returnQty);
      returnedQty = round4_(returnedQty + returnQty);
      returnedCount += 1;
      newMoves.push(movement_('RETURN', editDate, LOC_MAIN, old.itemId, old.stockId, returnQty,
        num_(old.unitPrice), round2_(returnQty * num_(old.unitPrice)), tr.id, 'คืนจากแก้ไขใบเบิก'));
    }
  });

  lines.forEach(function (line) {
    var old = oldLines.filter(function (o) { return o.stockId === line.stockId; })[0];
    var oldQty = old ? num_(old.qty) : 0;
    var issueQty = round4_(num_(line.qty) - oldQty);
    if (issueQty <= 1e-9) return;
    var from = findById_(stock, line.stockId);
    if (!from || from.location !== LOC_MAIN) throw new Error('ไม่พบสต็อกคลังหลัก');
    if (issueQty > num_(from.qty) + 1e-9) {
      throw new Error('จำนวนเกินคงเหลือ: ' + ((items[from.itemId] || {}).name || from.itemId));
    }
    var price = num_(from.unitPrice);
    var amount = round2_(issueQty * price);
    from.qty = round4_(num_(from.qty) - issueQty);
    newMoves.push(movement_('ISSUE', editDate, LOC_MAIN, from.itemId, from.id, -issueQty, price, amount, tr.id, ''));
  });

  tLines = tLines.filter(function (l) { return l.transferId !== tr.id; });
  moves = moves.filter(function (m) {
    return !(m.refId === tr.id && (m.type === 'ISSUE' || m.type === 'RETURN'));
  }).concat(newMoves);

  tr.date = editDate;
  tr.notes = String(p.notes || '');
  tr.totalQty = 0;
  tr.totalValue = 0;
  lines.forEach(function (line) {
    pushTransferLineRecord_(tr, line, stock, items, tLines);
  });
  return { transfer: tr, tLines: tLines, moves: moves, returnedQty: returnedQty, returnedCount: returnedCount };
}

function applyTransferLines_(tr, lines, stock, items, tLines, moves) {
  lines.forEach(function (line) {
    var from = findById_(stock, line.stockId);
    if (!from || from.location !== LOC_MAIN) throw new Error('ไม่พบสต็อกคลังหลัก');
    var qty = num_(line.qty);
    if (qty > num_(from.qty) + 1e-9) throw new Error('จำนวนเกินคงเหลือ: ' + ((items[from.itemId] || {}).name || from.itemId));
    var price = num_(from.unitPrice);
    var amount = round2_(qty * price);
    from.qty = round4_(num_(from.qty) - qty);
    tLines.push({
      id: nextId_('TL'),
      transferId: tr.id,
      itemId: from.itemId,
      stockId: from.id,
      qty: qty,
      approvedQty: qty,
      unitPrice: price,
      amount: amount,
      expiry: from.expiry || '',
      packSize: (items[from.itemId] || {}).packSize || '',
      name: (items[from.itemId] || {}).name || ''
    });
    moves.push(movement_('ISSUE', tr.date, LOC_MAIN, from.itemId, from.id, -qty, price, amount, tr.id, ''));
    tr.totalQty = round4_(num_(tr.totalQty) + qty);
    tr.totalValue = round2_(num_(tr.totalValue) + amount);
  });
}

function apiListTransfers_() {
  return { transfers: readObjects_('Transfers').slice().reverse() };
}

function apiGetTransfer_(p) {
  var tr = findById_(readObjects_('Transfers'), p.id);
  if (!tr) throw new Error('ไม่พบใบเบิก');
  var items = indexById_(readObjects_('Items'));
  var lines = readObjects_('TransferLines').filter(function (l) { return l.transferId === tr.id; }).map(function (l, idx) {
    var it = items[l.itemId] || {};
    return Object.assign({}, l, {
      no: idx + 1,
      name: l.name || it.name || '',
      packSize: l.packSize || it.packSize || '',
      approvedQty: num_(l.approvedQty != null ? l.approvedQty : l.qty),
      expiryLabel: formatDate_(l.expiry)
    });
  });
  return { transfer: tr, lines: lines, settings: readSettings_() };
}

function apiMonthReport_(p) {
  var monthKey = p.monthKey || currentMonthKey_();
  var range = monthRange_(monthKey);
  var items = normalizeItemPacks_(readObjects_('Items')).filter(function (i) { return i.active !== '0'; });
  var stock = readObjects_('Stock');
  var moves = readObjects_('Movements');
  var byItem = {};
  items.forEach(function (it) {
    byItem[it.id] = {
      item: it,
      opening: 0,
      received: 0,
      issued: 0,
      remain: 0,
      receivedValue: 0,
      issuedValue: 0,
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
    var amt = Math.abs(ch) * num_(m.unitPrice);
    if (d > range.end) {
      row.remain -= ch;
      row.remainValue -= ch * num_(m.unitPrice);
    } else if (d >= range.start && d <= range.end) {
      if (m.type === 'RECEIVE' || m.type === 'OPENING') {
        row.received += Math.max(ch, 0);
        row.receivedValue += Math.max(ch, 0) * num_(m.unitPrice);
      }
      if (ch < 0) {
        row.issued += -ch;
        row.issuedValue += (-ch) * num_(m.unitPrice);
      }
    }
  });
  Object.keys(byItem).forEach(function (id) {
    var r = byItem[id];
    r.opening = round4_(r.remain - r.received + r.issued);
    r.remain = round4_(r.remain);
    r.received = round4_(r.received);
    r.issued = round4_(r.issued);
    r.receivedValue = round2_(r.receivedValue);
    r.issuedValue = round2_(r.issuedValue);
    r.remainValue = round2_(r.remainValue);
  });
  var groups = [];
  CATEGORIES.forEach(function (cat) {
    var rows = items.filter(function (i) { return i.category === cat; }).map(function (i) { return byItem[i.id]; })
      .filter(function (r) { return r.opening || r.received || r.issued || r.remain; });
    if (rows.length) {
      groups.push({
        category: cat,
        rows: rows,
        totalValue: round2_(rows.reduce(function (s, r) { return s + r.remainValue; }, 0)),
        receivedValue: round2_(rows.reduce(function (s, r) { return s + r.receivedValue; }, 0)),
        issuedValue: round2_(rows.reduce(function (s, r) { return s + r.issuedValue; }, 0))
      });
    }
  });
  var extra = items.filter(function (i) { return CATEGORIES.indexOf(i.category) < 0; });
  if (extra.length) {
    var erows = extra.map(function (i) { return byItem[i.id]; })
      .filter(function (r) { return r.opening || r.received || r.issued || r.remain; });
    if (erows.length) {
      groups.push({
        category: 'อื่น ๆ',
        rows: erows,
        totalValue: round2_(erows.reduce(function (s, r) { return s + r.remainValue; }, 0)),
        receivedValue: round2_(erows.reduce(function (s, r) { return s + r.receivedValue; }, 0)),
        issuedValue: round2_(erows.reduce(function (s, r) { return s + r.issuedValue; }, 0))
      });
    }
  }
  var summary = {
    receivedValue: round2_(groups.reduce(function (s, g) { return s + g.receivedValue; }, 0)),
    issuedValue: round2_(groups.reduce(function (s, g) { return s + g.issuedValue; }, 0)),
    remainValue: round2_(groups.reduce(function (s, g) { return s + g.totalValue; }, 0)),
    receivedQty: round4_(Object.keys(byItem).reduce(function (s, id) { return s + byItem[id].received; }, 0)),
    issuedQty: round4_(Object.keys(byItem).reduce(function (s, id) { return s + byItem[id].issued; }, 0)),
    remainQty: round4_(Object.keys(byItem).reduce(function (s, id) { return s + byItem[id].remain; }, 0))
  };
  return {
    monthKey: monthKey,
    label: monthLabel_(monthKey),
    range: range,
    settings: readSettings_(),
    summary: summary,
    groups: groups,
    grandTotal: summary.remainValue
  };
}

function apiMoneyReport_(p) {
  var monthKey = p.monthKey || currentMonthKey_();
  var range = monthRange_(monthKey);
  var items = indexById_(normalizeItemPacks_(readObjects_('Items')));
  var stock = readObjects_('Stock');
  var moves = readObjects_('Movements');
  var map = {};
  CATEGORIES.forEach(function (c) {
    map[c] = { category: c, opening: 0, receive: 0, used: 0, remain: 0 };
  });
  stock.forEach(function (s) {
    if (s.location !== LOC_MAIN) return;
    var it = items[s.itemId] || {};
    var cat = it.category || 'อื่น ๆ';
    if (!map[cat]) map[cat] = { category: cat, opening: 0, receive: 0, used: 0, remain: 0 };
    map[cat].remain += num_(s.qty) * num_(s.unitPrice);
  });
  moves.forEach(function (m) {
    if (m.location !== LOC_MAIN) return;
    var it = items[m.itemId] || {};
    var cat = it.category || 'อื่น ๆ';
    if (!map[cat]) map[cat] = { category: cat, opening: 0, receive: 0, used: 0, remain: 0 };
    var d = m.date;
    var amt = num_(m.qtyChange) * num_(m.unitPrice);
    if (d > range.end) {
      map[cat].remain -= amt;
    } else if (d >= range.start && d <= range.end) {
      if (m.type === 'RECEIVE' || m.type === 'OPENING') map[cat].receive += Math.max(amt, 0);
      if (m.type === 'ISSUE' || m.type === 'TRANSFER_OUT' || m.type === 'USAGE' || (m.type === 'COUNT' && num_(m.qtyChange) < 0)) {
        map[cat].used += Math.max(-amt, 0);
      }
    }
  });
  var rows = Object.keys(map).map(function (c) {
    var r = map[c];
    r.remain = round2_(r.remain);
    r.receive = round2_(r.receive);
    r.used = round2_(r.used);
    r.opening = round2_(r.remain - r.receive + r.used);
    return r;
  }).filter(function (r) { return r.opening || r.receive || r.used || r.remain; });
  return {
    monthKey: monthKey,
    label: monthLabel_(monthKey),
    settings: readSettings_(),
    rows: rows,
    totals: {
      receive: round2_(rows.reduce(function (s, r) { return s + r.receive; }, 0)),
      used: round2_(rows.reduce(function (s, r) { return s + r.used; }, 0)),
      remain: round2_(rows.reduce(function (s, r) { return s + r.remain; }, 0))
    }
  };
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
        valueCategory: valueCategoryOf_(row.category),
        packSize: preferSpacedPack_(row.packSize || ''),
        unit: extra.unit || preferSpacedPack_(row.packSize || ''),
        unitPrice: num_(row.unitPrice),
        yearQuota: 0,
        lowStock: 0,
        active: '1',
        notes: ''
      };
      items.push(item);
      itemMap[key] = item;
    } else {
      if (num_(row.unitPrice) && !num_(item.unitPrice)) item.unitPrice = num_(row.unitPrice);
      if (row.packSize) item.packSize = preferSpacedPack_(row.packSize);
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
  quarter.forEach(function (r) { upsert(r, {}); });
  items = normalizeItemPacks_(items);
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
  var byCat = {};
  CATEGORIES.forEach(function (c) { byCat[c] = 0; });
  var expiry = [];
  stock.forEach(function (s) {
    if (s.location !== LOC_MAIN) return;
    var q = num_(s.qty);
    if (q <= 0) return;
    var amt = q * num_(s.unitPrice);
    mainVal += amt;
    var it = itemMap[s.itemId] || {};
    var cat = it.category || 'อื่น ๆ';
    byCat[cat] = (byCat[cat] || 0) + amt;
    if (isNearExpiry_(s.expiry)) {
      expiry.push({ name: it.name, expiry: formatDate_(s.expiry), qty: q, location: 'คลังหลัก' });
    }
  });
  var byValue = Object.keys(byCat).map(function (c) {
    return { category: c, value: round2_(byCat[c] || 0) };
  }).filter(function (x) { return x.value > 0; });
  return {
    mainValue: round2_(mainVal),
    totalValue: round2_(mainVal),
    byValue: byValue,
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

function preferSpacedPack_(v) {
  return String(v || '').trim();
}

function packKey_(v) {
  return String(v || '').replace(/\s+/g, '').toLowerCase();
}

function normalizeItemPacks_(items) {
  var bestByKey = {};
  items.forEach(function (it) {
    var p = String(it.packSize || '').trim();
    if (!p) return;
    var k = packKey_(p);
    if (!bestByKey[k]) {
      bestByKey[k] = p;
      return;
    }
    var cur = bestByKey[k];
    var scNew = (p.match(/\s/g) || []).length;
    var scCur = (cur.match(/\s/g) || []).length;
    if (scNew > scCur) bestByKey[k] = p;
  });
  var changed = false;
  items.forEach(function (it) {
    var p = String(it.packSize || '').trim();
    if (!p) return;
    var pref = bestByKey[packKey_(p)];
    if (pref && pref !== p) {
      it.packSize = pref;
      changed = true;
    }
  });
  if (changed) writeObjects_('Items', items);
  return items;
}

function valueCategoryOf_(cat) {
  if (cat === 'เวชภัณฑ์ที่มิใช่ยา') return 'เวชภัณฑ์ที่มิใช่ยา';
  if (String(cat).indexOf('วัคซีน') >= 0) return 'วัคซีน';
  if (String(cat).indexOf('วัสดุ') >= 0) return 'วัสดุทางการแพทย์';
  return cat || 'ยาเม็ด';
}

function ensureDb_() {
  var def = {
    unitName: 'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านทรายขาว',
    unitSub: 'ต.ทรายขาว อ.คลองท่อม จ.กระบี่',
    approverName: '',
    approverPosition: 'ผู้อำนวยการโรงพยาบาลส่งเสริมสุขภาพตำบล',
    requesterName: 'นายอรรถพร พิรุณรัตน์',
    requesterPosition: 'นักวิชาการสาธารณสุขชำนาญการ',
    receiverName: '',
    receiverPosition: '',
    issuerName: 'นางสาวสุภารัตน์ จงรักษ์',
    issuerPosition: '',
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
  if (typeof ThDate !== 'undefined' && ThDate.formatDateLong) {
    var label = ThDate.formatDateLong(iso);
    if (label && label !== 'เลือกวันที่') return label;
  }
  var p = iso.split('-');
  if (p.length !== 3) return iso;
  return p[2] + '/' + p[1] + '/' + (Number(p[0]) + 543) + ' (ค.ศ. ' + p[0] + ')';
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
