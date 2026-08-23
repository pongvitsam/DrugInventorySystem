/**
 * Free browser OCR for printed pharmacy bills (Tesseract.js tha+eng).
 * Always review results before saving — Thai OCR is helpful but not perfect.
 */
var BillOcr = (function () {
  var SKIP = /^(ลำดับ|รายการ|ปริมาณ|จำนวน|มูลค่า|หมายเหตุ|รวม|ยอด|วันที่|ใบเบิก|โรงพยาบาล|ลงชื่อ|ผู้อนุมัติ|ผู้เบิก|ผู้รับ|ผู้จ่าย|หน้า|page|total|no\.?|item)/i;

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
          var maxW = 1800;
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

  function parseQtyPack(raw) {
    var t = String(raw || '').replace(/,/g, '');
    var m = t.match(/(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)?\s*('?s|’s)?/i);
    if (m) {
      var qty = Number(m[1]);
      var size = m[2] ? String(m[2]) + (m[3] ? "'s" : '') : '';
      if (m[2] && !m[3] && /'s|’s/i.test(t.slice(m.index))) size = m[2] + "'s";
      else if (m[2] && !size) size = m[2] + "'s";
      return { qty: qty, packSize: size || '', raw: m[0] };
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

  function parseReceiptText(text, knownItems) {
    knownItems = knownItems || [];
    var lines = String(text || '').split(/\r?\n/).map(normalizeLine).filter(Boolean);
    var out = [];
    var receiptNumber = '';
    var seen = {};

    lines.forEach(function (line) {
      var numHit = line.match(/\b(S?\d{5,})\b/i);
      if (numHit && /S\d+/i.test(numHit[1])) receiptNumber = numHit[1];

      if (SKIP.test(line) || line.length < 3) return;
      if (/^[\d.\s]+$/.test(line)) return;

      var qp = null;
      var qpMatch = line.match(/(\d+(?:\.\d+)?)\s*[xX×*]\s*\d*(?:\.\d+)?\s*['’]?s?/i);
      if (qpMatch) qp = parseQtyPack(qpMatch[0]);

      var nums = extractNumbers(line);
      if (!qp && nums.length < 2) {
        // try match known item name only
        var hitOnly = matchKnownItem(line, knownItems);
        if (hitOnly && line.length >= 4) {
          var key0 = hitOnly.name.toLowerCase();
          if (!seen[key0]) {
            seen[key0] = true;
            out.push({
              name: hitOnly.name,
              itemId: hitOnly.id,
              packSize: hitOnly.packSize || '',
              qty: 1,
              unitPrice: Number(hitOnly.unitPrice || 0),
              amount: Number(hitOnly.unitPrice || 0),
              expiry: '',
              matched: true,
              raw: line
            });
          }
        }
        return;
      }

      var unitPrice = 0;
      var amount = 0;
      var qty = qp ? qp.qty : (nums[0] || 1);
      var packSize = qp ? qp.packSize : '';

      if (nums.length >= 2) {
        amount = nums[nums.length - 1];
        unitPrice = nums[nums.length - 2];
        if (qp && qty > 0 && amount > 0 && Math.abs(unitPrice * qty - amount) > 1 && nums.length >= 3) {
          // prefer amount/qty as unit price when mismatch
          var maybe = round2(amount / qty);
          if (maybe > 0) unitPrice = maybe;
        }
      } else if (nums.length === 1 && !qp) {
        unitPrice = nums[0];
      }

      var namePart = line;
      if (qpMatch) namePart = line.slice(0, qpMatch.index).trim();
      namePart = namePart
        .replace(/^\d+[\).]\s*/, '')
        .replace(/\d+(?:\.\d+)?\s*$/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      // strip trailing money-like leftovers
      namePart = namePart.replace(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+)\s*$/g, '').trim();
      if (namePart.length < 2) return;

      var known = matchKnownItem(namePart, knownItems);
      var name = known ? known.name : namePart;
      var itemId = known ? known.id : '';
      if (known && known.packSize && !packSize) packSize = known.packSize;
      if (known && !unitPrice) unitPrice = Number(known.unitPrice || 0);
      if (!amount && unitPrice && qty) amount = round2(unitPrice * qty);

      var key = (name + '|' + qty + '|' + unitPrice).toLowerCase();
      if (seen[key]) return;
      seen[key] = true;

      out.push({
        name: name,
        itemId: itemId,
        packSize: packSize || 'กล่อง',
        qty: qty,
        unitPrice: unitPrice,
        amount: amount || round2(unitPrice * qty),
        expiry: '',
        matched: !!known,
        raw: line
      });
    });

    return { lines: out, receiptNumber: receiptNumber, rawText: text };
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
