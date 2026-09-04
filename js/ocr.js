/**
 * Free browser OCR for printed pharmacy bills (Tesseract.js tha+eng).
 * Optimized for ใบอนุมัติเบิก รพ.คลองท่อม (qty NxM · มูลค่าเบิก · วันหมดอายุ พ.ศ.)
 */
var BillOcr = (function () {
  var SKIP = /^(ลำดับ|รายการ|ปริมาณ|จำนวน|มูลค่า|หมายเหตุ|รวม|ยอด|วันที่|ใบเบิก|โรงพยาบาล|ลงชื่อ|ผู้อนุมัติ|ผู้เบิก|ผู้รับ|ผู้จ่าย|หน้า|page|total|no\.?|item|ใบอนุมัติ|หน่วยงาน|รหัสยา|ชื่อเวช|รูปแบบ|หน่วย|จำนวนเบิก|จำนวนอนุมัติ|มูลค่าเบิก|วันหมดอายุ|เบิกปกติ|หน้าที่|เลขที่)/i;
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
    work = work.replace(/^(\d{1,3})\s+([A-Za-z0-9]{5,10})\s+/, function (_, seq, c) {
      if (!/^(20\d{2}|256\d)$/.test(c)) code = normalizeCode(c);
      return code ? '' : _;
    });
    if (!code) {
      var early = work.match(/^([A-Za-z]?\d{5,8}|\d{5,8})\s+/);
      if (early) {
        code = normalizeCode(early[1]);
        work = work.slice(early[0].length).trim();
      }
    }

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

  function pushLine(out, seen, row, knownItems, index) {
    var known = matchKnownItemSmart(row, knownItems, index);
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

    var key = ((row.code || '') + '|' + name + '|' + qty + '|' + amount).toLowerCase();
    if (seen[key]) return;
    seen[key] = true;

    out.push({
      name: name,
      code: (known && known.code) || row.code || '',
      form: row.form || (known && known.form) || '',
      itemId: itemId,
      packSize: packSize,
      qty: qty,
      unitPrice: unitPrice,
      amount: amount || round2(unitPrice * qty),
      expiry: row.expiry || '',
      matched: !!known,
      matchedBy: known ? (known._matchedBy || 'name') : '',
      matchScore: known ? (known._matchScore || 0) : 0,
      raw: row.raw || row.name
    });
  }

  function parseGenericLine(line, knownItems) {
    if (SKIP.test(line) || line.length < 3) return null;
    if (/^[\d.\s]+$/.test(line)) return null;

    var extractedCode = extractDrugCodeFromLine(line);

    var qp = null;
    var qpMatch = line.match(/(\d+(?:\.\d+)?)\s*[xX×*]\s*\d*(?:\.\d+)?\s*['’]?s?/i);
    if (qpMatch) qp = parseQtyPack(qpMatch[0]);

    var nums = extractNumbers(line);
    if (!qp && nums.length < 2) {
      var hitOnly = matchKnownItemSmart({ name: line, code: extractedCode, raw: line }, knownItems);
      if (hitOnly && (extractedCode || line.length >= 4)) {
        return {
          name: hitOnly.name,
          code: hitOnly.code || extractedCode || '',
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
      .replace(/^\d{1,3}\s+[A-Za-z0-9]{4,12}\s+/, '')
      .replace(/^\d+\s+\d{5,8}\s+/, '')
      .replace(/\d+(?:\.\d+)?\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    namePart = namePart.replace(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+)\s*$/g, '').trim();
    if (namePart.length < 2 && !extractedCode) return null;

    return {
      name: namePart || extractedCode || 'ไม่ทราบชื่อ',
      code: extractedCode || '',
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
    var index = buildItemIndex_(knownItems);

    lines.forEach(function (line) {
      var kh = parseKhlongThomRow(line);
      if (kh) {
        kh.raw = line;
        if (!kh.code) kh.code = extractDrugCodeFromLine(line);
        pushLine(out, seen, kh, knownItems, index);
        return;
      }
      var generic = parseGenericLine(line, knownItems);
      if (generic) pushLine(out, seen, generic, knownItems, index);
    });

    return {
      lines: out,
      receiptNumber: meta.receiptNumber,
      receiptDate: meta.receiptDate,
      rawText: text
    };
  }

  /** แก้ตัวอักษรที่ OCR มักอ่านผิดในรหัสยา (O↔0, I/l↔1, S↔5, B↔8) */
  function normalizeCode(raw) {
    var s = String(raw || '').toUpperCase().replace(/[\s\-_.]/g, '');
    if (!s) return '';
    // ถ้าเป็นตัวเลขเป็นหลัก ให้แก้ตัวอักษรที่คล้ายเลข
    if (/^[0-9A-Z]+$/.test(s) && (s.replace(/\D/g, '').length >= s.length * 0.6)) {
      s = s.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
    }
    return s;
  }

  function extractDrugCodeFromLine(line) {
    var work = normalizeLine(line);
    if (!work) return '';
    // รูปแบบมาตรฐานใบคลองท่อม: ลำดับ + รหัสยา (5–8 หลัก) + ชื่อ
    var m1 = work.match(/^(\d{1,3})\s+([A-Za-z0-9]{5,10})\s+/);
    if (m1 && !/^(20\d{2}|256\d)$/.test(m1[2])) return normalizeCode(m1[2]);
    // รหัสอยู่ต้นบรรทัดโดยไม่มีลำดับ
    var m2 = work.match(/^([A-Za-z]?\d{5,8}|\d{5,8}[A-Za-z]?)\s+[A-Za-zก-๙]/);
    if (m2) return normalizeCode(m2[1]);
    // หาเลข 6–7 หลักหลังลำดับสั้นๆ ภายใน 40 ตัวแรก
    var head = work.slice(0, 48);
    var m3 = head.match(/\b(\d{6,7})\b/);
    if (m3) return normalizeCode(m3[1]);
    return '';
  }

  function buildItemIndex_(items) {
    var byCode = {};
    (items || []).forEach(function (it) {
      if (!it || it.active === '0') return;
      var c = normalizeCode(it.code);
      if (!c) return;
      if (!byCode[c]) byCode[c] = it;
    });
    return { byCode: byCode, items: items || [] };
  }

  function codeDistance_(a, b) {
    a = String(a || '');
    b = String(b || '');
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 1) return 99;
    // Levenshtein แบบสั้น (รหัสยาไม่ยาว)
    var n = a.length;
    var m = b.length;
    var prev = [];
    var cur = [];
    var i, j;
    for (j = 0; j <= m; j++) prev[j] = j;
    for (i = 1; i <= n; i++) {
      cur[0] = i;
      for (j = 1; j <= m; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[m];
  }

  function matchByCode_(code, index) {
    var c = normalizeCode(code);
    if (!c || !index) return null;
    if (index.byCode[c]) {
      return Object.assign({}, index.byCode[c], { _matchedBy: 'code', _matchScore: 1000 });
    }
    // รหัสใกล้เคียง (OCR พลาด 1 ตัว) — เฉพาะความยาวเท่ากัน
    var best = null;
    var bestDist = 99;
    Object.keys(index.byCode).forEach(function (k) {
      if (k.length !== c.length) return;
      var d = codeDistance_(c, k);
      if (d > 0 && d <= 1 && d < bestDist) {
        bestDist = d;
        best = index.byCode[k];
      }
    });
    if (best) {
      return Object.assign({}, best, { _matchedBy: 'code-fuzzy', _matchScore: 900 });
    }
    return null;
  }

  function matchByName_(text, items) {
    var t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!t || !items || !items.length) return null;
    // ตัดรหัส/ลำดับออกจากข้อความก่อนเทียบชื่อ
    t = t
      .replace(/^\d{1,3}\s+[a-z0-9]{5,10}\s+/i, '')
      .replace(/^\d{5,8}\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return null;
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
        if (parts.length && hit / parts.length >= 0.6) score = 50 + hit * 5;
        // token overlap จากชื่อ OCR
        var tParts = t.split(/\s+/).filter(function (p) { return p.length > 2; });
        if (tParts.length >= 2 && parts.length) {
          var hit2 = tParts.filter(function (p) { return n.indexOf(p) >= 0; }).length;
          var ratio = hit2 / tParts.length;
          if (ratio >= 0.5) score = Math.max(score, 45 + Math.round(ratio * 40));
        }
      }
      // ชื่อยาสั้นมากต้องตรงเกือบทั้งหมด
      if (n.length <= 4 && score < 80) return;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    });
    if (bestScore >= 50 && best) {
      return Object.assign({}, best, { _matchedBy: 'name', _matchScore: bestScore });
    }
    return null;
  }

  /**
   * จับคู่ทะเบียน: รหัสยาก่อน → รหัสใกล้เคียง → ชื่อ
   * row = { name, code, raw } หรือสตริงชื่อ
   */
  function matchKnownItemSmart(row, items, index) {
    if (!items || !items.length) return null;
    if (typeof row === 'string') row = { name: row, code: '', raw: row };
    row = row || {};
    index = index || buildItemIndex_(items);

    var code = normalizeCode(row.code) || extractDrugCodeFromLine(row.raw || row.name || '');
    var byCode = matchByCode_(code, index);
    if (byCode) return byCode;

    return matchByName_(row.name || row.raw || '', items);
  }

  /** เผื่อโค้ดเก่าเรียก */
  function matchKnownItem(text, items) {
    return matchKnownItemSmart({ name: text, code: extractDrugCodeFromLine(text), raw: text }, items);
  }

  function round2(n) {
    return Math.round(Number(n || 0) * 100) / 100;
  }

  function scanFile(file, knownItems) {
    return loadImage(file).then(function (canvas) {
      var preview = document.getElementById('ocrPreview');
      var imageDataUrl = '';
      try {
        // ย่อรูปบิลสำหรับเก็บคู่ใบรับ (ดูภายหลังได้)
        var maxW = 1200;
        var out = canvas;
        if (canvas.width > maxW) {
          var scale = maxW / canvas.width;
          out = document.createElement('canvas');
          out.width = Math.round(canvas.width * scale);
          out.height = Math.round(canvas.height * scale);
          out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
        }
        var q = 0.55;
        imageDataUrl = out.toDataURL('image/jpeg', q);
        while (imageDataUrl.length > 28000 && q > 0.28) {
          q -= 0.07;
          imageDataUrl = out.toDataURL('image/jpeg', q);
        }
      } catch (e) { imageDataUrl = ''; }
      if (preview) {
        preview.src = imageDataUrl || canvas.toDataURL('image/jpeg', 0.85);
        preview.style.display = 'block';
      }
      return recognize(canvas).then(function (text) {
        progressEl('แยกรายการแล้ว — กรุณาตรวจสอบด้านล่าง', 100);
        var parsed = parseReceiptText(text, knownItems);
        parsed.imageDataUrl = imageDataUrl;
        return parsed;
      });
    });
  }

  return {
    scanFile: scanFile,
    parseReceiptText: parseReceiptText,
    matchKnownItem: matchKnownItem,
    normalizeCode: normalizeCode
  };
})();
