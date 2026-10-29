/**
 * Opening a main-store slip for editing allows up to the qty already on the slip.
 * Lowering a line whose lot is now empty must keep it on the slip and in the monthly summary.
 * Run: node scripts/test-edit-withdraw-max.js
 */
var fs = require('fs');
var path = require('path');
var store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
var els = {};
function el(id) {
  if (!els[id]) {
    els[id] = {
      id: id, value: '', style: {}, innerHTML: '', textContent: '',
      classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } }
    };
  }
  return els[id];
}
global.window = global;
global.document = {
  querySelectorAll: function () { return []; },
  getElementById: el,
  addEventListener: function () {},
  createElement: function () { return el('_'); }
};
global.confirm = function () { return true; };
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8'));
global.ThDate = {
  set: function (id, v) { el(id).value = v; },
  formatDateLong: function (s) { return s; },
  formatTimeShort: function () { return ''; }
};
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8'));
toast = function () {};
showPage = function () {};
showWithdrawPrint = function () {};
refreshAfterMutation = function () {};

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
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

DB.writeObjects('Items', [{ id: 'I1', name: 'para', form: 'TAB', category: 'ยาเม็ด', packSize: "500's", unitPrice: 100, active: '1' }]);
DB.writeObjects('Stock', [{ id: 'S1', itemId: 'I1', location: 'MAIN', qty: 2, unitPrice: 100, packSize: "500's", expiry: '2027-06-01' }]);
['Movements', 'Transfers', 'TransferLines'].forEach(function (t) { DB.writeObjects(t, []); });

var tid;
DrugAPI.api('saveTransfer', { date: '2026-10-05', location: 'MAIN', lines: [{ stockId: 'S1', qty: 2 }] })
  .then(function (r) {
    tid = r.transfer.id;
    editWithdraw(tid);
    return wait(30);
  })
  .then(function () {
    eq('edit allows the qty already on the slip', STATE.withdrawCart[0].maxQty, 2);
    updateWithdrawCartQty('S1', 1);
    eq('lowering to 1 keeps 1', STATE.withdrawCart[0].qty, 1);
    saveWithdraw();
    return wait(30);
  })
  .then(function () {
    var lines = DB.readObjects('TransferLines').filter(function (l) { return l.transferId === tid; });
    eq('slip keeps the line', lines.map(function (l) { return l.qty; }), [1]);
    return DrugAPI.api('monthReport', { location: 'MAIN', rangeStart: '2026-10-01', rangeEnd: '2026-10-31' });
  })
  .then(function (rep) {
    eq('monthly summary keeps the issue', rep.summary.issuedValue, 100);
    if (fail) {
      console.log(fail + ' failed');
      process.exit(1);
    }
    console.log('all ok');
  })
  .catch(function (err) {
    console.log('FAIL threw', err && err.message ? err.message : err);
    process.exit(1);
  });
