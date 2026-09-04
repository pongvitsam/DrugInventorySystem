var DB_PREFIX = 'pharma:';
var DB_MEM = {};

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
    var keys = ['SettingsObj', 'SeqObj', 'Items', 'Stock', 'Receipts', 'ReceiptLines', 'Transfers', 'TransferLines', 'Adjustments', 'AdjustmentLines', 'Movements', 'MonthlyRequests', 'ClimateLogs'];
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
      'Adjustments', 'AdjustmentLines', 'Movements', 'MonthlyRequests', 'ClimateLogs'].forEach(function (k) {
      DB.writeObjects(k, DB.dedupeRows(k, d[k] || []));
    });
  }
};
