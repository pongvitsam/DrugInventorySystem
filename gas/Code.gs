/**
 * คลังยา รพ.สต.บ้านทรายขาว — Google Apps Script backend
 * Deploy as Web App: Execute as Me, Anyone can access
 *
 * First run: set Script Property SPREADSHEET_ID (or run setupSpreadsheet_)
 */

var SHEET_DEFS = {
  Items: ['id', 'code', 'name', 'form', 'category', 'valueCategory', 'packSize', 'unit', 'unitPrice', 'yearQuota', 'lowStock', 'active', 'notes'],
  Stock: ['id', 'itemId', 'location', 'qty', 'unitPrice', 'packSize', 'expiry', 'lotNote'],
  Receipts: ['id', 'number', 'date', 'source', 'kind', 'notes', 'totalValue', 'createdAt'],
  ReceiptLines: ['id', 'receiptId', 'itemId', 'qtyText', 'qty', 'unitPrice', 'amount', 'packSize', 'expiry', 'requestedQty', 'approvedQty', 'notes'],
  Transfers: ['id', 'date', 'notes', 'totalQty', 'totalValue', 'createdAt'],
  TransferLines: ['id', 'transferId', 'itemId', 'stockId', 'qty', 'unitPrice', 'amount', 'expiry'],
  Adjustments: ['id', 'date', 'type', 'location', 'notes', 'totalValue', 'createdAt'],
  AdjustmentLines: ['id', 'adjustmentId', 'itemId', 'stockId', 'qty', 'unitPrice', 'amount', 'expiry'],
  Movements: ['id', 'date', 'type', 'location', 'itemId', 'stockId', 'qtyChange', 'unitPrice', 'amount', 'refId', 'notes'],
  MonthlyRequests: ['monthKey', 'itemId', 'qty'],
  Settings: ['key', 'value'],
  Seq: ['name', 'n']
};

var DATA_KEYS_ = ['Items', 'Stock', 'Receipts', 'ReceiptLines', 'Transfers', 'TransferLines',
  'Adjustments', 'AdjustmentLines', 'Movements', 'MonthlyRequests'];

function doGet(e) {
  try {
    var action = String((e && e.parameter && e.parameter.action) || 'ping').toLowerCase();
    if (action === 'ping') {
      return json_({ ok: true, service: 'DrugInventoryGAS', version: 3 });
    }
    if (action === 'meta') {
      return json_(getMeta_());
    }
    if (action === 'export') {
      return json_(exportAll_());
    }
    return json_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = String(body.action || '').toLowerCase();
    if (action === 'import') {
      var result = importAll_(body.data || {}, body.expectedRevision, body.force);
      if (result.conflict) {
        return json_({
          ok: false,
          conflict: true,
          revision: result.revision,
          updatedAt: result.updatedAt || ''
        });
      }
      return json_({ ok: true, revision: result.revision, updatedAt: result.updatedAt });
    }
    return json_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create('คลังยา รพ.สต.บ้านทรายขาว');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  ensureSheets_(ss);
  return ss;
}

function ensureSheets_(ss) {
  Object.keys(SHEET_DEFS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    var headers = SHEET_DEFS[name];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
}

function getSheet_(ss, name) {
  ensureSheets_(ss);
  return ss.getSheetByName(name);
}

function readSheetObjects_(sheet, columns) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, columns.length).getValues();
  return values.map(function (row) {
    var o = {};
    columns.forEach(function (col, i) {
      o[col] = row[i] != null ? row[i] : '';
    });
    return o;
  });
}

function writeSheetObjects_(sheet, columns, objects) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, columns.length).clearContent();
  }
  if (!objects || !objects.length) return;
  var rows = objects.map(function (obj) {
    return columns.map(function (col) {
      return obj[col] != null ? obj[col] : '';
    });
  });
  sheet.getRange(2, 1, rows.length, columns.length).setValues(rows);
}

function readSettingsObj_(ss) {
  var sheet = getSheet_(ss, 'Settings');
  var rows = readSheetObjects_(sheet, SHEET_DEFS.Settings);
  var o = {};
  rows.forEach(function (r) {
    if (r.key) o[String(r.key)] = r.value;
  });
  return o;
}

function writeSettingsObj_(ss, obj) {
  var rows = Object.keys(obj || {}).map(function (k) {
    return { key: k, value: obj[k] };
  });
  writeSheetObjects_(getSheet_(ss, 'Settings'), SHEET_DEFS.Settings, rows);
}

function readSeqObj_(ss) {
  var sheet = getSheet_(ss, 'Seq');
  var rows = readSheetObjects_(sheet, SHEET_DEFS.Seq);
  var o = {};
  rows.forEach(function (r) {
    if (r.name) o[String(r.name)] = Number(r.n) || 0;
  });
  return o;
}

function writeSeqObj_(ss, obj) {
  var rows = Object.keys(obj || {}).map(function (k) {
    return { name: k, n: obj[k] };
  });
  writeSheetObjects_(getSheet_(ss, 'Seq'), SHEET_DEFS.Seq, rows);
}

function getMeta_() {
  var ss = getSpreadsheet_();
  var settings = readSettingsObj_(ss);
  return {
    ok: true,
    revision: Number(settings.syncRevision) || 0,
    updatedAt: settings.syncUpdatedAt || ''
  };
}

function exportAll_() {
  var ss = getSpreadsheet_();
  var settings = readSettingsObj_(ss);
  var data = {
    SettingsObj: settings,
    SeqObj: readSeqObj_(ss)
  };
  DATA_KEYS_.forEach(function (name) {
    data[name] = readSheetObjects_(getSheet_(ss, name), SHEET_DEFS[name]);
  });
  return {
    ok: true,
    revision: Number(settings.syncRevision) || 0,
    updatedAt: settings.syncUpdatedAt || '',
    data: data
  };
}

function importAll_(data, expectedRevision, force) {
  var ss = getSpreadsheet_();
  var current = readSettingsObj_(ss);
  var settings = data.SettingsObj || {};
  var rev = Number(current.syncRevision) || 0;
  if (!force && expectedRevision != null && expectedRevision !== '') {
    var expected = Number(expectedRevision);
    if (!isNaN(expected) && expected !== rev) {
      return { conflict: true, revision: rev, updatedAt: current.syncUpdatedAt || '' };
    }
  }
  settings.syncRevision = String(rev + 1);
  settings.syncUpdatedAt = new Date().toISOString();
  data.SettingsObj = settings;
  writeSettingsObj_(ss, settings);
  if (data.SeqObj) writeSeqObj_(ss, data.SeqObj);
  DATA_KEYS_.forEach(function (name) {
    if (data[name]) {
      writeSheetObjects_(getSheet_(ss, name), SHEET_DEFS[name], data[name]);
    }
  });
  return { revision: rev + 1, updatedAt: settings.syncUpdatedAt };
}

/** Run once from Apps Script editor to create spreadsheet */
function setupSpreadsheet_() {
  var ss = getSpreadsheet_();
  Logger.log('Spreadsheet ID: ' + ss.getId());
  Logger.log('URL: ' + ss.getUrl());
}
