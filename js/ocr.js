/**
 * Free browser OCR for printed pharmacy bills (Tesseract.js tha+eng).
 * Optimized for ใบอนุมัติเบิก รพ.คลองท่อม (qty NxM · มูลค่าเบิก · วันหมดอายu พ.ศ.)
 */
var BillOcr = (function () {
  var SKIP = /^(ลำดับ|รายการ|ปริมาณ|จำนวน|มูลค่า|หมายเหตุ|รวม|ยอด|วันที่|ใบเบิก|โรงพยาบาล|ลงชื่อ|ผู้อนุมัติ|ผู้เบิก|ผู้รับ|ผู้จ่าย|หน้า|page|total|no\.?|item|ใบอนุมัติ|หน่วยงาน|รหัสยา|ชื่อเวช|รูปแบบ|หน่วย|จำนวนเบิก|จำนวนอนุมัติ|มูลค่าเบิก|วันหมดอายu|เบิกปกติ|หน้าที่|เลขที่)/i;
  var FORM_WORDS = /^(SOLUTION|TABLET|TABLETS|SYR|SUSP|SUSPENSION|CREAM|CAPSULE|CAP|TAB|OINT|GEL|PATCH|INJ|DROP|POWDER|POWD|SACHET|LOTION|SPRAY|SHAMPOO|SOAP)$/i;
  var UNIT_WORDS = /^(BOT|TAB|CAP|BOX|BAG|AMP|VIAL|ขวด|หลอด|ซอง|แผง|กล่อง|ลัง|SET|ROLL|TUBE|SYR|BOTTLE|BOTTL)$/i;

  function pad2(n) { return ('0' + n).slice(-2); }

  function progressEl(msg, pct) {
    var el = document.getElementById('ocrStatus');
    if (!el) return;
    el.style.display = 'block';
    el.textContent = msg + (pct != null ? ' (' + Math.round(pct) + '%)' : '');
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('ไม่พบไฟล์'));
      if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name || '')) {
        return reject(new Error('กรุณาอัปโหลดไฟล์รูปภาพ'));
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          var maxW = 2000;
          var scale = img.width > maxW ? maxW / img.width : 1;
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(canvas);
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('เปิดรูปไม่สำเร็จ'));
      };
      img.src = url;
    });
  }

  function recognize(canvas) {
    if (typeof Tesseract === 'undefined') {
      return Promise.reject(new Error('ยังโหลด OCR ไม่เสร็จ รอสักครู่แล้วลองใหม่'));
    }
    progressEl('กำลังอ่านตัวอักษรจากบิล…', 0);
    return Tesseract.recognize(canvas, 'tha+eng', {
      logger: function (m) {
        if (m.status === 'recognizing text' && m.progress != null) {
          progressEl('กำลังอ่านตัวอักษรจากบิล…', m.progress * 100);
        } else if (m.status) {
          progressEl(m.status, m.progress != null ? m.progress * 100 : null);
        }
      }
    }).then(function (res) {
      return (res && res.data && res.data.text) || '';
    });
  }

  function normalizeLine(s) {
    return String(s || '')
      .replace(/[|\[\]]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseBeDateToIso(raw) {
    var m = String(raw || '').trim().match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (!m) return '';
    var y = Number(m[3]);
    if (y > 2400) y -= 543;
    if (y < 100) y += 2500 - 543;
    return y + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[1]));
  }

  function parseReceiptMeta(text) {
    var receiptNumber = '';
    var receiptDate = '';
    var numHit = String(text).match(/\b(S\d{5,})\b/i);
    if (numHit) receiptNumber = numHit[1].toUpperCase();
    var dateHit = String(text).match(/(?:วันที่เบิก|วันที่)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (dateHit) receiptDate = parseBeDateToIso(dateHit[1]);
    if (!receiptDate) {
      var anyDate = String(text).match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]256\d)/);
      if (anyDate) receiptDate = parseBeDateToIso(anyDate[1]);
    }
    return { receiptNumber: receiptNumber, receiptDate: receiptDate };
  }

  function packLabelFromQty(qp) {
    if (!qp || !qp.pack) return '';
    if (qp.pack === '1') return '1';
    return qp.pack + "'s";
  }

  function parseKhlongThomRow(line) {
    var work = normalizeLine(line);
    if (!work || work.length < 6) return null;

    var expiryIso = '';
    var expM = work.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s*$/);
    if (expM) {
      expiryIso = parseBeDateToIso(expM[0]);
      work = work.slice(0, expM.index).trim();
    }

    var amount = 0;
    var amtM = work.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+\.\d{1,2})\s*$/);
    if (amtM) {
      amount = Number(amtM[1].replace(/,/g, ''));
      work = work.slice(0, amtM.index).trim();
    }

    var qpList = [];
    var qpRe = /(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)/g;
    var qm;
    while ((qm = qpRe.exec(work)) !== null) {
      qpList.push({
        index: qm.index,
        end: qm.index + qm[0].length,
        qty: Number(qm[1]),
        pack: qm[2],
        raw: qm[0]
      });
    }

    if (!qpList.length && !(amount > 0)) return null;

    var qp = qpList.length ? qpList[qpList.length - 1] : null;
    var qty = qp ? qp.qty : 0;
    var packSize = packLabelFromQty(qp);

    for (var i = qpList.length - 1; i >= 0; i--) {
      work = (work.slice(0, qpList[i].index) + work.slice(qpList[i].end)).replace(/\s{2,}/g, ' ').trim();
    }

    var code = '';
    work = work.replace(/^(\d{1,3})\s+(\d{6,7})\s+/, function (_, seq, c) {
      code = c;
      return '';
    });

    var form = '';
    var unit = '';
    var tokens = work.split(/\s+/).filter(Boolean);
    while (tokens.length > 1) {
      var last = tokens[tokens.length - 1];
      if (!unit && UNIT_WORDS.test(last)) {
        unit = last;
        tokens.pop();
        continue;
      }
      if (!form && FORM_WORDS.test(last)) {
        form = last;
        tokens.pop();
        continue;
      }
      break;
    }

    var name = tokens.join(' ').trim();
    if (!name || name.length < 2) return null;
    if (/^(solution|tablet|syr|susp|cream|cap|tab|bot)$/i.test(name)) return null;

    qty = qty || 1;
    var unitPrice = qty > 0 && amount > 0 ? round2(amount / qty) : 0;

    return {
      name: name,
      code: code,
      form: form,
      unit: unit,
      packSize: packSize || unit || 'กล่อง',
      qty: qty,
      unitPrice: unitPrice,
      amount: amount || round2(unitPrice * qty),
      expiry: expiryIso,
      qtyText: qp ? qp.raw : String(qty)
    };
  }

  function parseQtyPack(raw) {
    var t = String(raw || '').replace(/,/g, '');
    var m = t.match(/(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)?\s*('?s|’s)?/i);
    if (m) {
      var qty = Number(m[1]);
      var size = m[2] ? String(m[2]) + (m[3] ? "'s" : '') : '';
      if (m[2] && !m[3] && /'s|’s/i.test(t.slice(m.index))) size = m[2] + "'s";
      else if (m[2] && !size) size = m[2] + "'s";
      return { qty: qty, packSize: size || packLabelFromQty({ pack: m[2] }), raw: m[0] };
    }
    var n = t.match(/^(\d+(?:\.\d+)?)$/);
    if (n) return { qty: Number(n[1]), packSize: '', raw: n[1] };
    return null;
  }

  function extractNumbers(line) {
    var nums = [];
    String(line).replace(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/g, function (m) {
      var v = Number(String(m).replace(/,/g, ''));
      if (!isNaN(v)) nums.push(v);
      return m;
    });
    return nums;
  }

  function pushLine(out, seen, row, knownItems) {
    var known = matchKnownItem(row.name, knownItems);
    var name = known ? known.name : row.name;
    var itemId = known ? known.id : '';
    var packSize = row.packSize || (known && known.packSize) || 'กล่อง';
    if (known && known.packSize && (!row.packSize || row.packSize === '1' || row.packSize === 'กล่อง')) {
      packSize = known.packSize;
    }
    var qty = Number(row.qty || 0) || 1;
    var amount = Number(row.amount || 0);
    var unitPrice = qty > 0 && amount > 0 ? round2(amount / qty) : Number(row.unitPrice || 0);
    if (!amount && unitPrice) amount = round2(unitPrice * qty);
    if (!unitPrice && amount && qty) unitPrice = round2(amount / qty);
    else if (known && !unitPrice) unitPrice = Number(known.unitPrice || 0);

    var key = (name + '|' + qty + '|' + amount).toLowerCase();
    if (seen[key]) return;
    seen[key] = true;

    out.push({
      name: name,
      code: row.code || (known && known.code) || '',
      form: row.form || (known && known.form) || '',
      itemId: itemId,
      packSize: packSize,
      qty: qty,
      unitPrice: unitPrice,
      amount: amount || round2(unitPrice * qty),
      expiry: row.expiry || '',
      matched: !!known,
      raw: row.raw || row.name
    });
  }

  function parseGenericLine(line, knownItems) {
    if (SKIP.test(line) || line.length < 3) return null;
    if (/^[\d.\s]+$/.test(line)) return null;

    var qp = null;
    var qpMatch = line.match(/(\d+(?:\.\d+)?)\s*[xX×*]\s*\d*(?:\.\d+)?\s*['’]?s?/i);
    if (qpMatch) qp = parseQtyPack(qpMatch[0]);

    var nums = extractNumbers(line);
    if (!qp && nums.length < 2) {
      var hitOnly = matchKnownItem(line, knownItems);
      if (hitOnly && line.length >= 4) {
        return {
          name: hitOnly.name,
          itemId: hitOnly.id,
          packSize: hitOnly.packSize || '',
          qty: 1,
          unitPrice: Number(hitOnly.unitPrice || 0),
          amount: Number(hitOnly.unitPrice || 0),
          expiry: '',
          matched: true,
          raw: line
        };
      }
      return null;
    }

    var unitPrice = 0;
    var amount = 0;
    var qty = qp ? qp.qty : (nums[0] || 1);
    var packSize = qp ? qp.packSize : '';

    if (qp && qty > 0 && nums.length >= 1) {
      amount = nums[nums.length - 1];
      unitPrice = amount > 0 ? round2(amount / qty) : 0;
    } else if (nums.length >= 2) {
      qty = nums[0] || qty;
      amount = nums[nums.length - 1];
      unitPrice = qty > 0 && amount > 0 ? round2(amount / qty) : nums[nums.length - 2];
    } else if (nums.length === 1 && qp && qty > 0) {
      amount = nums[0];
      unitPrice = round2(amount / qty);
    }

    if (qty > 0 && amount > 0) unitPrice = round2(amount / qty);

    var namePart = line;
    if (qpMatch) namePart = line.slice(0, qpMatch.index).trim();
    namePart = namePart
      .replace(/^\d+[\).]\s*/, '')
      .replace(/^\d+\s+\d{6,7}\s+/, '')
      .replace(/\d+(?:\.\d+)?\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    namePart = namePart.replace(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+)\s*$/g, '').trim();
    if (namePart.length < 2) return null;

    return {
      name: namePart,
      packSize: packSize || 'กล่อง',
      qty: qty,
      unitPrice: unitPrice,
      amount: amount || round2(unitPrice * qty),
      expiry: '',
      raw: line
    };
  }

  function parseReceiptText(text, knownItems) {
    knownItems = knownItems || [];
    var lines = String(text || '').split(/\r?\n/).map(normalizeLine).filter(Boolean);
    var out = [];
    var seen = {};
    var meta = parseReceiptMeta(text);

    lines.forEach(function (line) {
      var kh = parseKhlongThomRow(line);
      if (kh) {
        kh.raw = line;
        pushLine(out, seen, kh, knownItems);
        return;
      }
      var generic = parseGenericLine(line, knownItems);
      if (generic) pushLine(out, seen, generic, knownItems);
    });

    return {
      lines: out,
      receiptNumber: meta.receiptNumber,
      receiptDate: meta.receiptDate,
      rawText: text
    };
  }

  function matchKnownItem(text, items) {
    var t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!t || !items || !items.length) return null;
    var best = null;
    var bestScore = 0;
    items.forEach(function (it) {
      if (it.active === '0') return;
      var n = String(it.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!n) return;
      var score = 0;
      if (t === n) score = 100;
      else if (t.indexOf(n) >= 0 || n.indexOf(t) >= 0) score = 80;
      else {
        var parts = n.split(/\s+/).filter(function (p) { return p.length > 2; });
        var hit = parts.filter(function (p) { return t.indexOf(p) >= 0; }).length;
        if (parts.length && hit / parts.length >= 0.6) score = 50 + hit;
      }
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    });
    return bestScore >= 50 ? best : null;
  }

  function round2(n) {
    return Math.round(Number(n || 0) * 100) / 100;
  }

  function scanFile(file, knownItems) {
    return loadImage(file).then(function (canvas) {
      var preview = document.getElementById('ocrPreview');
      if (preview) {
        preview.src = canvas.toDataURL('image/jpeg', 0.85);
        preview.style.display = 'block';
      }
      return recognize(canvas);
    }).then(function (text) {
      progressEl('แยกรายการแล้ว — กรุณาตรวจสอบด้านล่าง', 100);
      return parseReceiptText(text, knownItems);
    });
  }

  return {
    scanFile: scanFile,
    parseReceiptText: parseReceiptText
  };
})();
