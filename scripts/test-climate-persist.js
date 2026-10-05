/**
 * A temperature log must stay after save when a newer Google Sheet
 * snapshot arrives before that log has been written to the sheet.
 * Run: node scripts/test-climate-persist.js
 */
var fs = require('fs');
var path = require('path');
var store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
global.navigator = { onLine: true, userAgent: 'node' };
global.window = { addEventListener: function () {} };
global.document = {
  addEventListener: function () {},
  hidden: false,
  createElement: function () { return { style: {}, appendChild: function () {}, submit: function () {} }; },
  body: { appendChild: function () {}, removeChild: function () {} }
};

function resetStore() {
  Object.keys(store).forEach(function (k) { delete store[k]; });
  store['pharma:gasUrl'] = 'https://script.google.com/macros/s/TEST/exec';
  store['pharma:syncRevision'] = '5';
}

resetStore();
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'remote.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8'));
// The race under test is the sheet pull, not the upload itself.
RemoteDB.sync = function () { return Promise.resolve(); };

var fail = 0;
function eq(name, got, want) {
  var a = JSON.stringify(got);
  var b = JSON.stringify(want);
  if (a !== b) {
    fail++;
    console.log('FAIL', name);
    console.log(' got ', a);
    console.log(' want', b);
  } else {
    console.log('OK', name);
  }
}

function sheetWithoutClimate() {
  var data = DB.exportAll();
  data.ClimateLogs = (data.ClimateLogs || []).filter(function () { return false; });
  return data;
}

global.fetch = function (url) {
  var u = String(url);
  var body;
  if (u.indexOf('action=meta') >= 0) {
    body = { ok: true, revision: 8 };
  } else if (u.indexOf('action=export') >= 0) {
    body = { ok: true, revision: 8, updatedAt: '2026-10-05T10:00:00.000Z', data: sheetWithoutClimate() };
  } else {
    return Promise.reject(new Error('unexpected ' + u));
  }
  return Promise.resolve({
    ok: true,
    text: function () { return Promise.resolve(JSON.stringify(body)); }
  });
};

function logs() {
  return DrugAPI.api('listClimateLogs', {}).then(function (r) {
    return (r.logs || []).map(function (row) {
      return { date: row.date, slot: row.slot, temperature: row.temperature };
    });
  });
}

function seedBase() {
  resetStore();
  DB.clearCache();
  DrugAPI.resetCaches();
  if (RemoteDB.resetSession) RemoteDB.resetSession();
  DB.writeObjects('Items', [
    { id: 'I1', code: 'P500', name: 'para', form: 'TAB', category: 'ยาเม็ด', packSize: "500's", unitPrice: 100, active: '1' }
  ]);
  DB.writeSettingsObj({ imported: '1', unitName: 'test' });
  localStorage.setItem('pharma:syncRevision', '5');
}

seedBase();
Promise.resolve()
  .then(function () {
    return DrugAPI.api('saveClimateLog', {
      date: '2026-10-05', slot: 'am', temperature: 25.5, humidity: 60, recordedBy: 'nurse'
    });
  })
  .then(function () {
    return RemoteDB.refreshIfNewer();
  })
  .then(function () { return logs(); })
  .then(function (rows) {
    eq('saved temperature survives a newer sheet that does not have it yet', rows, [
      { date: '2026-10-05', slot: 'am', temperature: '25.5' }
    ]);
  })
  .then(function () {
    seedBase();
    return DrugAPI.api('saveClimateLog', {
      date: '2026-10-05', slot: 'pm', temperature: 27, humidity: 55, recordedBy: 'nurse'
    });
  })
  .then(function (saved) {
    return DrugAPI.api('deleteClimateLog', { id: saved.log.id }).then(function () { return saved.log; });
  })
  .then(function (log) {
    global.fetch = function (url) {
      var u = String(url);
      var kept = {
        id: log.id,
        date: log.date,
        slot: log.slot,
        temperature: log.temperature,
        humidity: log.humidity,
        recordedBy: log.recordedBy,
        recordedAt: log.recordedAt,
        notes: log.notes || ''
      };
      var data = DB.exportAll();
      data.ClimateLogs = [kept];
      var body = u.indexOf('action=meta') >= 0
        ? { ok: true, revision: 9 }
        : { ok: true, revision: 9, data: data };
      return Promise.resolve({
        ok: true,
        text: function () { return Promise.resolve(JSON.stringify(body)); }
      });
    };
    return RemoteDB.refreshIfNewer();
  })
  .then(function () { return logs(); })
  .then(function (rows) {
    eq('deleted temperature stays deleted when the sheet still has the old row', rows, []);
  })
  .then(function () {
    if (fail) process.exit(1);
    process.exit(0);
  })
  .catch(function (err) {
    console.log('FAIL', err && err.stack ? err.stack : err);
    process.exit(1);
  });
