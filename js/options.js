var Options = (function () {
  var PACK_SIZES = [
    "28's", "30's", "50's", "60's", "100's", "500's", "1000's",
    "6's", "20 ซอง", "ซอง", "ขวด", "หลอด", "ถุง", "kg",
    "5g", "10 ml", "15 ml", "20g", "25 g", "30g", "30ml",
    "50 ml", "60ml", "100ml", "120ml", "180 ml",
    "240ml", "450ml", "450g", "1000ml",
    "0.5ml", "1 ml", "3ml", "10ml", "68 mg",
    "ชิ้น", "คู่", "กล่อง", "แพค", "ม้วน", "เส้น", "ใบ", "ลูก", "ตัว", "แกลอน",
    "100ชิ้น/กล่อง", "100ชิ้น/แพค", "100ใบ/แพค", "12ชิ้น/กล่อง",
    "12ม้วน/กล่อง", "12ม้วน/แพค", "1ชิ้น/แพค", "200ชิ้น/กล่อง",
    "24ม้วน/กล่อง", "30ชิ้น/กล่อง", "4ม้วน/กล่อง", "50ชิ้น/กล่อง",
    "50ชิ้น/แพค", "5ก้อน/แพค", "5ชิ้น/แพค"
  ];

  var FORMS = [
    'TAB', 'CAP', 'SYR', 'SUSP', 'INJ', 'OINT', 'CREAM', 'GEL', 'DROP',
    'SOL', 'SUPP', 'PATCH', 'POWDER', 'INH', 'SPRAY', 'LOTION', 'VAG',
    'TAB (เม็ด)', 'CAP (แคปซูล)', 'SYR (น้ำ)', 'INJ (ฉีด)', 'EXT (ใช้ภายนอก)'
  ];

  function packKey(v) {
    return String(v || '').replace(/\s+/g, '').toLowerCase();
  }

  function spaceCount(v) {
    return (String(v || '').match(/\s/g) || []).length;
  }

  /** Prefer version with spaces when same ignoring whitespace (e.g. keep "15 ml", drop "15ml"). */
  function uniqPreferSpaced(arr) {
    var best = {};
    arr.forEach(function (v) {
      v = String(v || '').trim();
      if (!v) return;
      var k = packKey(v);
      if (!best[k]) {
        best[k] = v;
        return;
      }
      var cur = best[k];
      var scNew = spaceCount(v);
      var scCur = spaceCount(cur);
      if (scNew > scCur) best[k] = v;
      else if (scNew === scCur && v.length > cur.length) best[k] = v;
    });
    return Object.keys(best).map(function (k) { return best[k]; })
      .sort(function (a, b) { return a.localeCompare(b, 'th'); });
  }

  function uniq(arr) {
    return uniqPreferSpaced(arr);
  }

  function mergePackFromItems(items) {
    var extra = (items || []).map(function (i) { return i.packSize; }).filter(Boolean);
    return uniqPreferSpaced(PACK_SIZES.concat(extra));
  }

  function mergeFormFromItems(items) {
    var extra = (items || []).map(function (i) { return i.form; }).filter(Boolean);
    var seen = {};
    var out = [];
    FORMS.concat(extra).forEach(function (v) {
      v = String(v || '').trim();
      if (!v || seen[v.toLowerCase()]) return;
      seen[v.toLowerCase()] = true;
      out.push(v);
    });
    return out.sort(function (a, b) { return a.localeCompare(b, 'th'); });
  }

  return {
    packSizes: uniqPreferSpaced(PACK_SIZES),
    forms: FORMS.slice(),
    mergePackFromItems: mergePackFromItems,
    mergeFormFromItems: mergeFormFromItems,
    packKey: packKey
  };
})();

function fillSelectWithCustom(selectId, customId, values, selected) {
  var sel = document.getElementById(selectId);
  var custom = document.getElementById(customId);
  if (!sel) return;
  sel.innerHTML = '<option value="">— เลือก —</option>';
  values.forEach(function (v) {
    var o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  });
  var oCustom = document.createElement('option');
  oCustom.value = '__custom__';
  oCustom.textContent = 'อื่น ๆ (พิมพ์เอง)';
  sel.appendChild(oCustom);

  sel.onchange = function () {
    if (!custom) return;
    var show = sel.value === '__custom__';
    custom.style.display = show ? 'block' : 'none';
    if (!show) custom.value = '';
  };

  selected = String(selected || '').trim();
  if (!selected) {
    sel.value = '';
    if (custom) { custom.style.display = 'none'; custom.value = ''; }
    return;
  }
  var match = values.filter(function (v) {
    return v === selected || Options.packKey(v) === Options.packKey(selected);
  })[0];
  if (match) {
    sel.value = match;
    if (custom) { custom.style.display = 'none'; custom.value = ''; }
  } else {
    sel.value = '__custom__';
    if (custom) { custom.style.display = 'block'; custom.value = selected; }
  }
}

function readSelectWithCustom(selectId, customId) {
  var sel = document.getElementById(selectId);
  if (!sel) return '';
  if (sel.value === '__custom__') {
    var custom = document.getElementById(customId);
    return custom ? String(custom.value || '').trim() : '';
  }
  return String(sel.value || '').trim();
}

function initItemOptionSelects(items) {
  refreshOptionLists();
  var packs = STATE.optionLists.packSizes;
  var forms = STATE.optionLists.forms;
  fillSelectWithCustom('itPack', 'itPackCustom', packs, '');
  fillSelectWithCustom('itForm', 'itFormCustom', forms, '');
  fillSelectWithCustom('rcPack', 'rcPackCustom', packs, '');
  renderOptionTags();
}
