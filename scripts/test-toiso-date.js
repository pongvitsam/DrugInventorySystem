/**
 * Regression: Sheets UTC midnight must map to Thai calendar date.
 * Run: node scripts/test-toiso-date.js
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

/* eslint-disable no-eval */
eval(extract('pad2_'));
eval(extract('thaiCalendarIsoFromMs_'));
eval(extract('toIsoDate_'));

var cases = [
  ['2026-09-23', '2026-09-23'],
  ['2026-09-22T17:00:00.000Z', '2026-09-23'],
  ['2026-08-31T17:00:00.000Z', '2026-09-01'],
  ['2026-09-14T00:00:00+07:00', '2026-09-14'],
  [new Date('2026-09-23T00:00:00+07:00'), '2026-09-23'],
  ['14/09/2569', '2026-09-14']
];

var fail = 0;
cases.forEach(function (c) {
  var got = toIsoDate_(c[0]);
  if (got !== c[1]) {
    fail++;
    console.log('FAIL', c[0], '->', got, 'want', c[1]);
  } else {
    console.log('OK', String(c[0]).slice(0, 36), '->', got);
  }
});

if (fail) {
  console.log('RED', fail);
  process.exit(1);
}
console.log('GREEN all pass');
