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
  exportAll: function () {
    var keys = ['SettingsObj', 'SeqObj', 'Items', 'Stock', 'Receipts', 'ReceiptLines', 'Transfers', 'TransferLines', 'Adjustments', 'AdjustmentLines', 'Movements', 'MonthlyRequests'];
    var out = {};
    keys.forEach(function (k) {
      if (k === 'SettingsObj') out[k] = DB.readSettingsObj();
      else if (k === 'SeqObj') out[k] = DB.readSeqObj();
      else out[k] = DB.readObjects(k);
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
    ['Items', 'Stock', 'Receipts', 'ReceiptLines', 'Transfers', 'TransferLines',
      'Adjustments', 'AdjustmentLines', 'Movements', 'MonthlyRequests'].forEach(function (k) {
      DB.writeObjects(k, DB.dedupeRows(k, d[k] || []));
    });
  }
};
