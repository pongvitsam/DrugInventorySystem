/**
 * Password hash + legacy username migration.
 * Run: node scripts/test-login-users.js
 */
var fs = require('fs');
var path = require('path');
var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8');

function extract(name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  var brace = src.indexOf('{', start);
  var depth = 0;
  for (var i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

/* eslint-disable no-eval */
eval(extract('sha256hex_'));
eval(extract('utf8Bytes_'));
eval(extract('hashPassword_'));
eval(extract('parseUserRecords_'));
eval(extract('parseUsers_'));

var fail = 0;
function assert(cond, msg) {
  if (!cond) {
    fail++;
    console.log('FAIL', msg);
  } else {
    console.log('OK', msg);
  }
}

assert(sha256hex_('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'sha256 empty');
assert(sha256hex_('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256 abc');

var h1 = hashPassword_('secret', 'salt1');
var h2 = hashPassword_('secret', 'salt1');
var h3 = hashPassword_('secret', 'salt2');
assert(h1 === h2, 'same salt same hash');
assert(h1 !== h3, 'different salt different hash');

var recs = parseUserRecords_({ loginUsers: '["Napatsorn"]' });
assert(recs.length === 1 && recs[0].username === 'Napatsorn' && !recs[0].passHash, 'legacy string users');
assert(parseUsers_({ loginUsers: '["Napatsorn"]' })[0] === 'Napatsorn', 'parseUsers names');

var recs2 = parseUserRecords_({
  loginUsers: JSON.stringify([{ username: 'Ann', salt: 'aa', passHash: 'hh' }])
});
assert(recs2[0].username === 'Ann' && recs2[0].passHash === 'hh', 'object users');

if (fail) {
  console.log('RED', fail);
  process.exit(1);
}
console.log('GREEN all pass');
