/**
 * Opening balance on the external store keeps an expiry.
 * Withdrawing 1 box of a 500-tablet pack from the main store
 * adds those tablets to the external store.
 * Run: node scripts/test-ext-inbound.js
 */
var fs = require('fs');
var path = require('path');
var store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8'));

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

function extQty(itemId) {
  return DB.readObjects('Stock').filter(function (s) {
    return s.itemId === itemId && s.location === 'EXT' && Number(s.qty) > 0;
  }).reduce(function (n, s) { return n + Number(s.qty); }, 0);
}

function extLots(itemId) {
  return DB.readObjects('Stock').filter(function (s) {
    return s.itemId === itemId && s.location === 'EXT' && Number(s.qty) > 0;
  }).map(function (s) {
    return { qty: s.qty, expiry: s.expiry || '', pack: s.packSize, price: s.unitPrice };
  });
}

function mainQty(stockId) {
  var row = DB.readObjects('Stock').filter(function (s) { return s.id === stockId; })[0];
  return row ? Number(row.qty) : null;
}

function seed() {
  store = {};
  DB.clearCache();
  DrugAPI.resetCaches();
  DB.writeObjects('Items', [
    { id: 'I1', code: 'P500', name: 'para 500 mg', form: 'TAB', category: 'ยาเม็ด', packSize: "500's", unitPrice: 100, active: '1' },
    { id: 'I2', code: 'CR', name: 'cream', form: 'CREAM', category: 'ยาใช้ภายนอก', packSize: '1 หลอด', unitPrice: 40, active: '1' }
  ]);
  DB.writeObjects('Stock', [
    { id: 'S1', itemId: 'I1', location: 'MAIN', qty: 2, unitPrice: 100, packSize: "500's", expiry: '2027-06-01', lotNote: '' },
    { id: 'S2', itemId: 'I2', location: 'MAIN', qty: 3, unitPrice: 40, packSize: '1 หลอด', expiry: '2027-01-15', lotNote: '' }
  ]);
  DB.writeObjects('Movements', []);
  DB.writeObjects('Transfers', []);
  DB.writeObjects('TransferLines', []);
}

function run(name, payload) {
  return DrugAPI.api(name, payload);
}

seed();
Promise.resolve()
  .then(function () {
    return run('saveExtOpening', {
      date: '2026-10-05',
      lines: [{ itemId: 'I1', qty: 500, expiry: '2027-06-01' }]
    });
  })
  .then(function () {
    eq('opening keeps expiry and 500 tablets', extLots('I1'), [
      { qty: 500, expiry: '2027-06-01', pack: 'เม็ด', price: 0.2 }
    ]);
    return run('saveTransfer', {
      date: '2026-10-05',
      location: 'MAIN',
      lines: [{ stockId: 'S1', qty: 1 }]
    });
  })
  .then(function (saved) {
    eq('one box leaves the main store', mainQty('S1'), 1);
    eq('external store shows 1000 tablets', extQty('I1'), 1000);
    eq('same expiry merges into one lot', extLots('I1'), [
      { qty: 1000, expiry: '2027-06-01', pack: 'เม็ด', price: 0.2 }
    ]);
    eq('inbound quantity is the tablets from that box', saved.extInbound, 500);
    return run('saveTransfer', {
      id: saved.transfer.id,
      date: '2026-10-05',
      location: 'MAIN',
      lines: [{ stockId: 'S1', qty: 2 }]
    });
  })
  .then(function (edited) {
    eq('editing to 2 boxes empties the main store', mainQty('S1'), 0);
    eq('editing to 2 boxes shows 1500 tablets', extQty('I1'), 1500);
    eq('edited slip carries both boxes', edited.extInbound, 1000);
    return run('deleteTransfer', { id: edited.transfer.id });
  })
  .then(function () {
    eq('deleting the withdrawal restores the main box', mainQty('S1'), 2);
    eq('deleting the withdrawal leaves the opening tablets', extQty('I1'), 500);
    return run('saveTransfer', {
      date: '2026-10-05',
      location: 'MAIN',
      lines: [{ stockId: 'S2', qty: 1 }]
    });
  })
  .then(function () {
    eq('a tube moves into the external store as one tube', extLots('I2'), [
      { qty: 1, expiry: '2027-01-15', pack: '1 หลอด', price: 40 }
    ]);
    return run('saveTransfer', {
      date: '2026-10-05',
      location: 'EXT',
      lines: [{ stockId: extLots('I1') && DB.readObjects('Stock').filter(function (s) {
        return s.itemId === 'I1' && s.location === 'EXT';
      })[0].id, qty: 100 }]
    });
  })
  .then(function () {
    eq('issuing from the external store does not add stock back', extQty('I1'), 400);
    seed();
    return run('saveExtOpening', {
      date: '2026-10-05',
      lines: [{ itemId: 'I1', qty: 500, expiry: '2028-01-01' }]
    });
  })
  .then(function () {
    return run('saveTransfer', {
      date: '2026-10-05',
      location: 'MAIN',
      lines: [{ stockId: 'S1', qty: 1 }]
    });
  })
  .then(function (saved) {
    eq('different expiry still totals 1000', extQty('I1'), 1000);
    eq('different expiry stays two lots', extLots('I1').length, 2);
    var inbound = DB.readObjects('Stock').filter(function (s) {
      return s.itemId === 'I1' && s.location === 'EXT' && s.expiry === '2027-06-01';
    })[0];
    return run('saveTransfer', {
      date: '2026-10-05',
      location: 'EXT',
      lines: [{ stockId: inbound.id, qty: 500 }]
    }).then(function () { return saved.transfer.id; });
  })
  .then(function (transferId) {
    return run('deleteTransfer', { id: transferId }).then(function () {
      eq('delete should have been blocked', false, true);
    }, function (err) {
      eq('cannot delete after those tablets were issued', /คลังภายนอก/.test(String(err && err.message)), true);
      eq('opening tablets remain after the blocked delete', extQty('I1'), 500);
      eq('main box stays withdrawn when delete is blocked', mainQty('S1'), 1);
    });
  })
  .then(function () {
    seed();
    return run('saveExtReceipt', {
      date: '2026-10-05',
      lines: [{ stockId: 'S1', qty: 500 }]
    });
  })
  .then(function () {
    eq('receiving 500 tablets takes one box from main', mainQty('S1'), 1);
    eq('receiving 500 tablets lands in the external store', extQty('I1'), 500);
    return run('monthReport', { location: 'MAIN', rangeStart: '2026-10-01', rangeEnd: '2026-10-31' });
  })
  .then(function (rep) {
    var row = null;
    (rep.groups || []).forEach(function (g) {
      (g.rows || []).forEach(function (r) {
        if (r.item && r.item.name === 'para 500 mg') row = r;
      });
    });
    eq('main report counts that receipt as issued', row && row.issued, 1);
    eq('main report does not hide it as an adjustment', row && row.adjusted, 0);
    return run('monthReport', { location: 'EXT', rangeStart: '2026-10-01', rangeEnd: '2026-10-31' });
  })
  .then(function (rep) {
    var row = null;
    (rep.groups || []).forEach(function (g) {
      (g.rows || []).forEach(function (r) {
        if (r.item && r.item.name === 'para 500 mg') row = r;
      });
    });
    eq('external report receives the tablets', row && row.received, 500);
    eq('external report has not issued them', row && row.issued, 0);
    return run('listStock', { location: 'EXT' });
  })
  .then(function (listed) {
    var lot = (listed.stock || []).filter(function (s) { return s.itemId === 'I1'; })[0];
    eq('tablet warning uses boxes times tablets per box', lot && lot.lowStockThreshold, 5000);
    seed();
    var stock = DB.readObjects('Stock');
    stock[0].qty = 1;
    DB.writeObjects('Stock', stock);
    DB.writeObjects('Transfers', [{
      id: 'T-OLD', date: '2026-10-05', location: 'MAIN', totalQty: 1, totalValue: 100, notes: '', createdAt: '2026-10-05 10:00:00'
    }]);
    DB.writeObjects('TransferLines', [{
      id: 'TL-OLD', transferId: 'T-OLD', itemId: 'I1', stockId: 'S1', qty: 1, approvedQty: 1,
      unitPrice: 100, amount: 100, expiry: '2027-06-01', packSize: "500's", name: 'para 500 mg'
    }]);
    DB.writeObjects('Movements', [{
      id: 'M-OLD', date: '2026-10-05', type: 'ISSUE', location: 'MAIN', itemId: 'I1', stockId: 'S1',
      qtyChange: -1, unitPrice: 100, amount: 100, refId: 'T-OLD', notes: ''
    }]);
    return run('saveTransfer', {
      id: 'T-OLD', date: '2026-10-05', location: 'MAIN', notes: 'แก้หมายเหตุ',
      lines: [{ stockId: 'S1', qty: 1 }]
    });
  })
  .then(function () {
    eq('editing an old slip does not invent external stock', extQty('I1'), 0);
    eq('editing an old slip keeps the withdrawn box out', mainQty('S1'), 1);
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
