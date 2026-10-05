/**
 * An external opening saved in this browser must survive a newer Google
 * Sheet snapshot that does not contain it yet, so another browser can
 * receive it on the next sync.
 * Run: node scripts/test-ext-opening-sync.js
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

function sheetWithoutOpening() {
  var data = DB.exportAll();
  data.Movements = (data.Movements || []).filter(function (m) { return m.type !== 'EXT_OPENING'; });
  data.Stock = (data.Stock || []).filter(function (s) { return s.location !== 'EXT'; });
  return data;
}

global.fetch = function (url) {
  var u = String(url);
  var body = u.indexOf('action=meta') >= 0
    ? { ok: true, revision: 8 }
    : { ok: true, revision: 8, data: sheetWithoutOpening() };
  return Promise.resolve({
    ok: true,
    text: function () { return Promise.resolve(JSON.stringify(body)); }
  });
};

function extQty() {
  return DB.readObjects('Stock').filter(function (s) {
    return s.location === 'EXT' && Number(s.qty) > 0;
  }).reduce(function (n, s) { return n + Number(s.qty); }, 0);
}

resetStore();
DB.clearCache();
DrugAPI.resetCaches();
if (RemoteDB.resetSession) RemoteDB.resetSession();
DB.writeObjects('Items', [
  { id: 'I2', code: 'CR', name: 'cream', form: 'CREAM', category: 'ยาใช้ภายนอก', packSize: '1 หลอด', unitPrice: 40, active: '1' }
]);
DB.writeSettingsObj({ imported: '1', unitName: 'test' });
localStorage.setItem('pharma:syncRevision', '5');

Promise.resolve()
  .then(function () {
    return DrugAPI.api('saveExtOpening', {
      date: '2026-10-05',
      lines: [{ itemId: 'I2', qty: 2, expiry: '2027-01-15' }]
    });
  })
  .then(function () { return RemoteDB.refreshIfNewer(); })
  .then(function () { return DrugAPI.api('listExtOpenings', {}); })
  .then(function (r) {
    var rows = (r.openings || []).map(function (x) {
      return { qty: x.totalQty, lines: x.lines };
    });
    eq('opening still listed after a sheet snapshot that missed it', rows, [{ qty: 2, lines: 1 }]);
    eq('external stock still has the opening quantity', extQty(), 2);
  })
  .then(function () {
    if (fail) process.exit(1);
    process.exit(0);
  })
  .catch(function (err) {
    console.log('FAIL', err && err.stack ? err.stack : err);
    process.exit(1);
  });
