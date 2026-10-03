var DB_PREFIX = 'pharma:';
var DB_MEM = {};

function dbRound4_(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 10000) / 10000;
}

function dbUnionById_(primary, extra) {
  var seen = {};
  var out = [];
  (primary || []).concat(extra || []).forEach(function (row) {
    if (!row) return;
    var id = row.id != null && row.id !== '' ? String(row.id) : '';
    if (!id) { out.push(row); return; }
    if (seen[id]) return;
    seen[id] = 1;
    out.push(row);
  });
  return out;
}

function dbExtMainPacks_(line) {
  if (String(line.qtyUnit || '') === 'tablet') {
    if (line.packQty != null && line.packQty !== '') return Number(line.packQty);
    var units = Number(line.unitsPerPack) || 1;
    if (!(units > 0)) units = 1;
    return dbRound4_(Number(line.qty || 0) / units);
  }
  return Number(line.qty || 0);
}

function dbRestoreExtTransfer_(stock, line, deduct) {
  var need = Number(line.qty) || 0;
  if (!(need > 0)) return;
  var ext = null;
  stock.forEach(function (s) {
    if (!ext && s && s.id === line.toStockId) ext = s;
  });
  if (ext && ext.location === 'EXT' && Number(ext.qty) + 1e-9 >= need) return;
  if (deduct) {
    var packQty = dbExtMainPacks_(line);
    stock.forEach(function (s) {
      if (!s || s.id !== line.fromStockId || s.location !== 'MAIN') return;
      var have = Number(s.qty) || 0;
      if (have + 1e-9 >= packQty) s.qty = dbRound4_(have - packQty);
    });
  }
  var asTablet = String(line.qtyUnit || '') === 'tablet';
  var price = asTablet && need ? Number(line.amount || 0) / need : Number(line.unitPrice || 0);
  if (!ext) {
    stock.push({
      id: line.toStockId || '',
      itemId: line.itemId || '',
      location: 'EXT',
      qty: need,
      unitPrice: price,
      packSize: asTablet ? 'เม็ด' : (line.packSize || ''),
      expiry: line.expiry || '',
      lotNote: asTablet && line.packSize ? ('โอนจากคลังหลัก ' + line.packSize) : 'โอนจากคลังหลัก'
    });
    return;
  }
  ext.location = 'EXT';
  ext.qty = need;
  if (asTablet) ext.packSize = 'เม็ด';
  if (!(Number(ext.unitPrice) > 0)) ext.unitPrice = price;
}

var DB = {
  readObjects: function (name) {
    if (DB_MEM[name]) return DB_MEM[name];
    try {
      var raw = localStorage.getItem(DB_PREFIX + name);
      var data = raw ? JSON.parse(raw) : [];
      DB_MEM[name] = data;
      return data;
    } catch (e) {
      DB_MEM[name] = [];
      return DB_MEM[name];
    }
  },
  writeObjects: function (name, rows) {
    DB_MEM[name] = rows || [];
    localStorage.setItem(DB_PREFIX + name, JSON.stringify(DB_MEM[name]));
  },
  clearCache: function (name) {
    if (name) delete DB_MEM[name];
    else DB_MEM = {};
  },
  readSettingsObj: function () {
    if (DB_MEM.SettingsObj) return DB_MEM.SettingsObj;
    try {
      var raw = localStorage.getItem(DB_PREFIX + 'SettingsObj');
      DB_MEM.SettingsObj = raw ? JSON.parse(raw) : {};
      return DB_MEM.SettingsObj;
    } catch (e) {
      DB_MEM.SettingsObj = {};
      return DB_MEM.SettingsObj;
    }
  },
  writeSettingsObj: function (obj) {
    DB_MEM.SettingsObj = obj || {};
    localStorage.setItem(DB_PREFIX + 'SettingsObj', JSON.stringify(DB_MEM.SettingsObj));
  },
  readSeqObj: function () {
    if (DB_MEM.SeqObj) return DB_MEM.SeqObj;
    try {
      var raw = localStorage.getItem(DB_PREFIX + 'SeqObj');
      DB_MEM.SeqObj = raw ? JSON.parse(raw) : {};
      return DB_MEM.SeqObj;
    } catch (e) {
      DB_MEM.SeqObj = {};
      return DB_MEM.SeqObj;
    }
  },
  writeSeqObj: function (obj) {
    DB_MEM.SeqObj = obj || {};
    localStorage.setItem(DB_PREFIX + 'SeqObj', JSON.stringify(DB_MEM.SeqObj));
  },
  readReceiptImages: function () {
    if (DB_MEM.ReceiptImages) return DB_MEM.ReceiptImages;
    try {
      var raw = localStorage.getItem(DB_PREFIX + 'ReceiptImages');
      DB_MEM.ReceiptImages = raw ? JSON.parse(raw) : {};
    } catch (e) {
      DB_MEM.ReceiptImages = {};
    }
    return DB_MEM.ReceiptImages;
  },
  writeReceiptImages: function (obj) {
    DB_MEM.ReceiptImages = obj || {};
    try {
      localStorage.setItem(DB_PREFIX + 'ReceiptImages', JSON.stringify(DB_MEM.ReceiptImages));
    } catch (e) {
      // quota: keep newest ~15 images
      try {
        var keys = Object.keys(DB_MEM.ReceiptImages);
        if (keys.length > 15) {
          keys.slice(0, keys.length - 15).forEach(function (k) { delete DB_MEM.ReceiptImages[k]; });
          localStorage.setItem(DB_PREFIX + 'ReceiptImages', JSON.stringify(DB_MEM.ReceiptImages));
        }
      } catch (e2) { /* ignore */ }
    }
  },
  setReceiptImage: function (id, dataUrl) {
    if (!id || !dataUrl) return;
    var o = DB.readReceiptImages();
    o[String(id)] = String(dataUrl);
    DB.writeReceiptImages(o);
  },
  getReceiptImage: function (id) {
    if (!id) return '';
    var o = DB.readReceiptImages();
    return o[String(id)] || '';
  },
  exportAll: function (opts) {
    opts = opts || {};
    var keys = ['SettingsObj', 'SeqObj', 'Items', 'Stock', 'Receipts', 'ReceiptLines', 'Transfers', 'TransferLines', 'ExtReceipts', 'ExtReceiptLines', 'Adjustments', 'AdjustmentLines', 'Movements', 'MonthlyRequests', 'ClimateLogs'];
    var out = {};
    var imgs = opts.skipImages ? {} : DB.readReceiptImages();
    keys.forEach(function (k) {
      if (k === 'SettingsObj') out[k] = DB.readSettingsObj();
      else if (k === 'SeqObj') out[k] = DB.readSeqObj();
      else if (k === 'Receipts') {
        var rows = (DB.readObjects('Receipts') || []).map(function (r) {
          var copy = Object.assign({}, r);
          delete copy.billImage;
          if (!opts.skipImages) {
            var img = imgs[String(r.id)] || r.billImage || '';
            if (img) copy.billImage = img;
          }
          return copy;
        });
        // จำกัดจำนวนรูปที่ส่งซิงก์ เพื่อไม่ให้ payload ใหญ่เกินไป
        if (!opts.skipImages && !opts.includeAllImages) {
          var withImg = rows.filter(function (r) { return r.billImage; })
            .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
          var keep = {};
          withImg.slice(0, 12).forEach(function (r) { keep[String(r.id)] = 1; });
          rows.forEach(function (r) {
            if (r.billImage && !keep[String(r.id)]) delete r.billImage;
          });
        }
        out[k] = rows;
      } else out[k] = DB.readObjects(k);
    });
    return out;
  },
  /** ทับทั้งชุด — ไม่ merge/append; รายการซ้ำ id เก็บตัวท้าย */
  dedupeRows: function (name, rows) {
    rows = rows || [];
    if (!rows.length) return [];
    var seen = {};
    var out = [];
    for (var i = rows.length - 1; i >= 0; i--) {
      var row = rows[i] || {};
      var key;
      if (name === 'MonthlyRequests') {
        key = String(row.monthKey || '') + '|' + String(row.itemId || '');
      } else if (name === 'ClimateLogs') {
        key = String(row.date || '') + '|' + String(row.slot || '');
      } else if (row.id != null && row.id !== '') {
        key = String(row.id);
      } else {
        out.unshift(row);
        continue;
      }
      if (seen[key]) continue;
      seen[key] = true;
      out.unshift(row);
    }
    return out;
  },
  importAll: function (data) {
    var priorHeads = (DB.readObjects('ExtReceipts') || []).slice();
    var priorLines = (DB.readObjects('ExtReceiptLines') || []).slice();
    var priorMoves = (DB.readObjects('Movements') || []).slice();
    DB.clearCache();
    var d = data || {};
    DB.writeSettingsObj(d.SettingsObj || {});
    DB.writeSeqObj(d.SeqObj || {});
    var imgs = {};
    try { imgs = JSON.parse(localStorage.getItem(DB_PREFIX + 'ReceiptImages') || '{}') || {}; } catch (e) { imgs = {}; }
    (d.Receipts || []).forEach(function (r) {
      if (r && r.id && r.billImage) imgs[String(r.id)] = r.billImage;
      if (r) delete r.billImage;
    });
    DB.writeReceiptImages(imgs);
    ['Items', 'Stock', 'Receipts', 'ReceiptLines', 'Transfers', 'TransferLines',
      'ExtReceipts', 'ExtReceiptLines',
      'Adjustments', 'AdjustmentLines', 'Movements', 'MonthlyRequests', 'ClimateLogs'].forEach(function (k) {
      if ((k === 'ExtReceipts' || k === 'ExtReceiptLines') && d[k] == null) return;
      var rows = d[k] || [];
      if (k === 'Transfers') {
        var moves = (d.Movements && d.Movements.length) ? d.Movements : DB.readObjects('Movements');
        var extRefs = {};
        (moves || []).forEach(function (m) {
          if (m && m.type === 'ISSUE' && m.location === 'EXT' && m.refId) extRefs[m.refId] = 1;
        });
        rows.forEach(function (t) {
          if (t && !t.location && extRefs[t.id]) t.location = 'EXT';
        });
      }
      DB.writeObjects(k, DB.dedupeRows(k, rows));
    });
    var heads = dbUnionById_(DB.readObjects('ExtReceipts'), priorHeads);
    var lines = dbUnionById_(DB.readObjects('ExtReceiptLines'), priorLines);
    var receiptIds = {};
    heads.forEach(function (h) { if (h && h.id) receiptIds[h.id] = 1; });
    var remoteApplied = {};
    (d.Movements || []).forEach(function (m) {
      if (m && m.type === 'TRANSFER_OUT' && m.refId && receiptIds[m.refId]) remoteApplied[m.refId] = 1;
    });
    var keptMoves = priorMoves.filter(function (m) {
      return m && m.refId && receiptIds[m.refId];
    });
    var moves = dbUnionById_(DB.readObjects('Movements'), keptMoves);
    var stock = (DB.readObjects('Stock') || []).slice();
    lines.forEach(function (line) {
      if (!line || !receiptIds[line.extReceiptId]) return;
      dbRestoreExtTransfer_(stock, line, !remoteApplied[line.extReceiptId]);
    });
    DB.writeObjects('ExtReceipts', heads);
    DB.writeObjects('ExtReceiptLines', lines);
    DB.writeObjects('Movements', moves);
    DB.writeObjects('Stock', stock);
  }
};
