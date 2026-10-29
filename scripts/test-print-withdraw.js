/**
 * Print from "ใบเบิกล่าสุด" must open the print dialog with the slip on screen.
 * Run: node scripts/test-print-withdraw.js
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
      classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      scrollIntoView: function () { this._scrolled = true; }
    };
  }
  return els[id];
}
var htmlClass = {};
global.window = global;
global.document = {
  documentElement: {
    classList: {
      add: function (c) { htmlClass[c] = true; },
      remove: function (c) { delete htmlClass[c]; }
    }
  },
  querySelectorAll: function () { return []; },
  querySelector: function () { return null; },
  getElementById: el,
  addEventListener: function () {},
  createElement: function () { return el('_'); }
};
global.confirm = function () { return true; };
var printed = 0;
global.window.print = function () { printed += 1; };
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8'));
global.ThDate = {
  set: function (id, v) { el(id).value = v; },
  formatDateLong: function (s) { return s; },
  formatTimeShort: function () { return ''; }
};
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8'));
toast = function () {};

var fail = 0;
function ok(name, cond) {
  if (!cond) {
    fail++;
    console.log('FAIL', name);
  } else {
    console.log('OK', name);
  }
}

DB.writeObjects('Items', [{ id: 'I1', name: 'para', form: 'TAB', category: 'ยาเม็ด', packSize: "500's", unitPrice: 100, active: '1' }]);
DB.writeObjects('Stock', [{ id: 'S1', itemId: 'I1', location: 'MAIN', qty: 5, unitPrice: 100, packSize: "500's", expiry: '2027-06-01' }]);
['Movements', 'Transfers', 'TransferLines'].forEach(function (t) { DB.writeObjects(t, []); });

DrugAPI.api('saveTransfer', { date: '2026-10-29', location: 'MAIN', notes: 'ใช้ประจำ', lines: [{ stockId: 'S1', qty: 2 }] })
  .then(function (r) {
    printed = 0;
    htmlClass = {};
    return showWithdrawPrint(r.transfer.id);
  })
  .then(function () {
    ok('print dialog opens', printed === 1);
    ok('print-withdraw class on', !!htmlClass['print-withdraw']);
    ok('preview card shown', el('wdPrintCard').style.display === 'block');
    ok('slip html has drug name', String(el('wdPrintOut').innerHTML).indexOf('para') >= 0);
    ok('scrolled to card', !!el('wdPrintCard')._scrolled);
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
