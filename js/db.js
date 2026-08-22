var DB_PREFIX = 'pharma:';

var DB = {
  readObjects: function (name) {
    try {
      var raw = localStorage.getItem(DB_PREFIX + name);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },
  writeObjects: function (name, rows) {
    localStorage.setItem(DB_PREFIX + name, JSON.stringify(rows || []));
  },
  readSettingsObj: function () {
    try {
      var raw = localStorage.getItem(DB_PREFIX + 'SettingsObj');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },
  writeSettingsObj: function (obj) {
    localStorage.setItem(DB_PREFIX + 'SettingsObj', JSON.stringify(obj || {}));
  },
  readSeqObj: function () {
    try {
      var raw = localStorage.getItem(DB_PREFIX + 'SeqObj');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },
  writeSeqObj: function (obj) {
    localStorage.setItem(DB_PREFIX + 'SeqObj', JSON.stringify(obj || {}));
  },
  exportAll: function () {
    var keys = ['SettingsObj', 'SeqObj', 'Items', 'Stock', 'Receipts', 'ReceiptLines', 'Transfers', 'TransferLines', 'Adjustments', 'AdjustmentLines', 'Movements', 'MonthlyRequests'];
    var out = {};
    keys.forEach(function (k) {
      var raw = localStorage.getItem(DB_PREFIX + k);
      if (raw) out[k] = JSON.parse(raw);
    });
    return out;
  }
};
