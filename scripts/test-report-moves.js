/**
 * September 4 slips must stay on 4 September in the monthly summary.
 * Slips that already match must not be counted twice.
 * Run: node scripts/test-report-moves.js
 */
var fs = require('fs');
var path = require('path');
var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8');

function extract(name) {
  var re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}');
  var m = src.match(re);
  if (!m) throw new Error('missing ' + name);
  return m[0];
}

var LOC_MAIN = 'MAIN';
var LOC_EXT = 'EXT';
eval(extract('num_'));
eval(extract('round2_'));
eval(extract('round4_'));
eval(extract('pad2_'));
eval(extract('thaiCalendarIsoFromMs_'));
eval(extract('toIsoDate_'));
eval(extract('normalizeLoc_'));
eval(extract('indexById_'));
eval(extract('slipDay_'));
eval(extract('alignSlipIssues_'));

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

var stamp = '2026-09-04T17:00:00.000Z';
eq('stamp shifts off 4 Sep', toIsoDate_(stamp), '2026-09-05');
eq('slip day stays 4 Sep', slipDay_(stamp), '2026-09-04');

var pinned = alignSlipIssues_(
  [{ id: 'M4', date: stamp, type: 'ISSUE', location: 'MAIN', itemId: 'I1', stockId: 'S1', qtyChange: -6, unitPrice: 10, amount: 60, refId: 'T4', notes: '' }],
  [{ id: 'T4', date: '2026-09-04', location: 'MAIN' }],
  [{ id: 'TL4', transferId: 'T4', itemId: 'I1', stockId: 'S1', qty: 6, unitPrice: 10, amount: 60 }]
);
eq('4 Sep stays on the slip day', pinned.map(function (m) { return m.date + ':' + m.qtyChange; }), ['2026-09-04:-6']);

var other = alignSlipIssues_(
  [{ id: 'M1', date: '2026-09-02', type: 'ISSUE', location: 'MAIN', itemId: 'I1', stockId: 'S1', qtyChange: -3, unitPrice: 10, amount: 30, refId: 'T1', notes: '' }],
  [{ id: 'T1', date: '2026-09-02', location: 'MAIN' }],
  [{ id: 'TL1', transferId: 'T1', itemId: 'I1', stockId: 'S1', qty: 3, unitPrice: 10, amount: 30 }]
);
eq('matching day is not duplicated', other.length, 1);
eq('matching qty unchanged', other[0].qtyChange, -3);

var edited = alignSlipIssues_(
  [{ id: 'M2', date: '2026-09-04', type: 'RETURN', location: 'MAIN', itemId: 'I1', stockId: 'S1', qtyChange: 3, unitPrice: 10, amount: 30, refId: 'T2', notes: '' }],
  [{ id: 'T2', date: '2026-09-04', location: 'MAIN' }],
  [{ id: 'TL2', transferId: 'T2', itemId: 'I1', stockId: 'S1', qty: 7, unitPrice: 10, amount: 70 }]
);
eq('edited slip uses the slip qty once', edited.map(function (m) { return m.type + m.qtyChange; }), ['ISSUE-7']);

var unlinked = alignSlipIssues_(
  [{ id: 'M3', date: '2026-09-10', type: 'ISSUE', location: 'MAIN', itemId: 'I9', stockId: 'S9', qtyChange: -4, unitPrice: 2, amount: 8, refId: '', notes: '' }],
  [{ id: 'T9', date: '2026-09-10', location: 'MAIN' }],
  [{ id: 'TL9', transferId: 'T9', itemId: 'I9', stockId: 'S9', qty: 4, unitPrice: 2, amount: 8 }]
);
eq('unlinked issue is not added again', unlinked.length, 1);

if (fail) {
  console.log(fail + ' failed');
  process.exit(1);
}
console.log('all ok');
