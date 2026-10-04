/**
 * Edited withdrawal slips must still count the full line qty in the monthly report.
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
eval(extract('pad2_'));
eval(extract('thaiCalendarIsoFromMs_'));
eval(extract('toIsoDate_'));
eval(extract('normalizeLoc_'));
eval(extract('resolveTransferLocation_'));
eval(extract('indexById_'));
eval(extract('reconcileIssueMoves_'));

var fail = 0;
function eq(name, got, want) {
  var a = JSON.stringify(got);
  var b = JSON.stringify(want);
  if (a !== b) {
    fail++;
    console.log('FAIL', name, 'got', a, 'want', b);
  } else {
    console.log('OK', name);
  }
}

// Edited 10 → 7: original ISSUE was deleted, only RETURN +3 remains, line qty is 7.
var edited = reconcileIssueMoves_(
  [{ id: 'M1', date: '2026-10-02', type: 'RETURN', location: 'MAIN', itemId: 'I1', stockId: 'S1', qtyChange: 3, unitPrice: 10, amount: 30, refId: 'T1', notes: 'คืนจากแก้ไขใบเบิก' }],
  [{ id: 'T1', date: '2026-10-02', location: 'MAIN' }],
  [{ id: 'TL1', transferId: 'T1', itemId: 'I1', stockId: 'S1', qty: 7, unitPrice: 10, amount: 70 }],
  [{ id: 'S1', itemId: 'I1', location: 'MAIN', qty: 93, unitPrice: 10 }]
);
eq('edited slip keeps full qty', edited.map(function (m) { return { type: m.type, qty: m.qtyChange, ref: m.refId }; }), [
  { type: 'ISSUE', qty: -7, ref: 'T1' }
]);

// Deleted slip left a phantom RETURN and no ISSUE.
var deleted = reconcileIssueMoves_(
  [{ id: 'M2', date: '2026-10-03', type: 'RETURN', location: 'MAIN', itemId: 'I1', stockId: 'S1', qtyChange: 10, unitPrice: 10, amount: 100, refId: 'T9', notes: 'ลบใบเบิก' }],
  [],
  [],
  []
);
eq('orphan return dropped', deleted, []);

// Unedited slip is rebuilt from the line, same qty.
var plain = reconcileIssueMoves_(
  [{ id: 'M3', date: '2026-10-01', type: 'ISSUE', location: 'EXT', itemId: 'I2', stockId: 'S2', qtyChange: -4, unitPrice: 5, amount: 20, refId: 'T2', notes: '' }],
  [{ id: 'T2', date: '2026-10-01' }],
  [{ id: 'TL2', transferId: 'T2', itemId: 'I2', stockId: 'S2', qty: 4, unitPrice: 5, amount: 20 }],
  [{ id: 'S2', itemId: 'I2', location: 'EXT', qty: 6, unitPrice: 5 }]
);
eq('ext slip location', plain.map(function (m) { return m.location + ':' + m.qtyChange; }), ['EXT:-4']);

// Receipt movement is left alone.
var recv = reconcileIssueMoves_(
  [{ id: 'M4', date: '2026-10-01', type: 'RECEIVE', location: 'MAIN', itemId: 'I1', stockId: 'S1', qtyChange: 20, unitPrice: 10, amount: 200, refId: 'R1', notes: '' }],
  [],
  [],
  []
);
eq('receive kept', recv.length, 1);

if (fail) {
  console.log(fail + ' failed');
  process.exit(1);
}
console.log('all ok');
