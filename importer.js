'use strict';
// Reads a schedule table out of a PDF or a photo and returns rows for the provider to review.

const Importer = (() => {
  const LIBS = {
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    tess: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    zip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
  };

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('Could not load a reading library. Check the internet connection.'));
      document.head.appendChild(s);
    });
  }

  // ---------- getting words with positions ----------

  async function ocr(canvas, onProg) {
    await loadScript(LIBS.tess);
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => { if (m.status === 'recognizing text' && onProg) onProg(m.progress); }
    });
    // Mode 4 (single column of variable-size text) missed the fewest table rows on test photos.
    await worker.setParameters({ tessedit_pageseg_mode: '4' });
    const { data } = await worker.recognize(canvas);
    await worker.terminate();
    return (data.words || []).map(w => ({ t: w.text, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1 }));
  }

  function imageToCanvas(src, forOcr) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // The on-device reader likes enlarged high-contrast pictures; the AI reader wants a normal, smaller one.
        const scale = forOcr ? Math.min(2.5, 2200 / img.naturalWidth) : Math.min(1, 1800 / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        const g = c.getContext('2d');
        if (forOcr) g.filter = 'grayscale(1) contrast(1.6)';
        g.drawImage(img, 0, 0, c.width, c.height);
        res(c);
      };
      img.onerror = () => rej(new Error('Could not open the image.'));
      img.src = src;
    });
  }

  async function pdfPages(buf) {
    await loadScript(LIBS.pdf);
    pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      let words = [];
      for (const it of tc.items) {
        const s = it.str;
        if (!s || !s.trim()) continue;
        const x = it.transform[4], yb = vp.height - it.transform[5];
        const hgt = it.height || Math.abs(it.transform[3]) || 10;
        let pos = 0;
        for (const p of s.split(/(\s+)/)) {
          if (p.trim()) words.push({ t: p, x0: x + it.width * (pos / s.length), x1: x + it.width * ((pos + p.length) / s.length), y0: yb - hgt, y1: yb });
          pos += p.length;
        }
      }
      // A scanned PDF has no text layer, so hand back a picture of the page instead.
      if (words.map(w => w.t).join('').length < 30) {
        const v2 = page.getViewport({ scale: Math.min(2.5, 2000 / vp.width) });
        const c = document.createElement('canvas');
        c.width = v2.width; c.height = v2.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: v2 }).promise;
        pages.push({ canvas: c });
      } else pages.push({ words });
    }
    return pages;
  }

  // ---------- turning words into table rows ----------

  const DATE = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/;
  const DAY = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?$/i;
  const STOP = /head of|professor|deptt|department of|signature/i;
  const clean = t => t.replace(/^[^A-Za-z0-9β(&]+|[^A-Za-z0-9β).:,&\/\-]+$/g, '');
  const isTime = t => /^[\d:.\-–]*(am|pm)?[\d:.\-–]*(am|pm)?$/i.test(t) && /\d|am|pm/i.test(t);
  const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const yc = w => (w.y0 + w.y1) / 2;

  function toLines(words) {
    words = words.map(w => ({ ...w, t: clean(w.t) })).filter(w => /[A-Za-z0-9&]/.test(w.t));
    if (!words.length) return { lines: [], H: 10 };
    const H = median(words.map(w => w.y1 - w.y0)) || 10;
    words.sort((a, b) => a.x0 - b.x0);
    const lines = [];
    for (const w of words) {
      let best = null, bd = Infinity;
      // Compare with the last word of each line so slightly tilted photos still line up.
      for (const L of lines) {
        const d = Math.abs(yc(L.words[L.words.length - 1]) - yc(w));
        if (d < bd) { bd = d; best = L; }
      }
      if (best && bd < H * 0.7) best.words.push(w); else lines.push({ words: [w] });
    }
    for (const L of lines) { L.y = median(L.words.map(yc)); L.text = L.words.map(w => w.t).join(' '); }
    lines.sort((a, b) => a.y - b.y);
    return { lines, H };
  }

  function normDate(t) {
    const m = DATE.exec(t);
    if (!m) return '';
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    if (+mo > 12 || +d > 31 || +mo < 1 || +d < 1) return '';
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  function analyzeStart(L, H) {
    const ws = L.words;
    const di = ws.findIndex(w => DATE.test(w.t));
    let i = di + 1, day = null;
    if (ws[i] && DAY.test(ws[i].t)) { day = ws[i]; i++; }
    const time = [];
    while (ws[i] && isTime(ws[i].t)) { time.push(ws[i]); i++; }
    const rest = ws.slice(i);
    const cellX = [];
    rest.forEach((w, k) => { if (k === 0 || w.x0 - rest[k - 1].x1 > H * 0.9) cellX.push(w.x0); });
    return { line: L, dateW: ws[di], day, time, rest, cellX };
  }

  function headerRoles(L) {
    if (!L) return [];
    const roles = [];
    for (const w of L.words) {
      const t = w.t.toLowerCase();
      if (/topic|title|subject|activity|particular/.test(t)) roles.push({ x: w.x0, r: 'title' });
      else if (/faculty|moderator|teacher|guide|chair/.test(t)) roles.push({ x: w.x0, r: 'faculty' });
      else if (/^jr$|resident|presenter|pgt|speaker|student/.test(t)) roles.push({ x: w.x0, r: 'jr' });
    }
    const seen = new Set();
    return roles.sort((a, b) => a.x - b.x).map(r => r.r).filter(r => !seen.has(r) && seen.add(r));
  }

  function parseTable(starts, lines, H, header, ctx) {
    // Text column positions: where cells begin on the first line of each row.
    const xs = starts.flatMap(s => s.cellX).sort((a, b) => a - b);
    let groups = [];
    for (const x of xs) {
      const g = groups[groups.length - 1];
      if (g && x - g[0] < H * 2.5) g.push(x); else groups.push([x]);
    }
    const need = Math.max(1, Math.ceil(starts.length * 0.4));
    groups = groups.filter(g => g.length >= need).sort((a, b) => b.length - a.length).slice(0, 3);
    const textCols = groups.map(g => median(g)).sort((a, b) => a - b);
    const timeXs = starts.filter(s => s.time.length).map(s => s.time[0].x0);
    const timeX = timeXs.length ? median(timeXs) : null;
    const firstText = textCols.length ? textCols[0] : Infinity;
    let roles = headerRoles(header);
    if (roles.length !== textCols.length) roles = ['title', 'faculty', 'jr'].slice(0, textCols.length);
    const tol = H * 1.2;
    const colOf = w => {
      let c = -1;
      textCols.forEach((x, k) => { if (x <= w.x0 + tol) c = k; });
      return c;
    };

    const rows = [];
    starts.forEach((s, n) => {
      const cells = textCols.map(() => []);
      const time = s.time.map(w => w.t);
      const put = w => { const c = colOf(w); cells[c < 0 ? 0 : c] && cells[c < 0 ? 0 : c].push(w.t); };
      s.rest.forEach(put);
      const from = lines.indexOf(s.line) + 1;
      const until = n + 1 < starts.length ? lines.indexOf(starts[n + 1].line) : lines.length;
      let prevY = s.line.y;
      for (let k = from; k < until; k++) {
        const L = lines[k];
        if (L.y - prevY > H * 2.6 || L.stop) break;
        prevY = L.y;
        for (const w of L.words) {
          if (w.x0 + tol >= firstText) put(w);
          else if (timeX != null && w.x0 + tol >= timeX && isTime(w.t)) time.push(w.t);
        }
      }
      const row = { date: normDate(s.dateW.t), time: tidyTime(time.join(' ')) || ctx.time, title: '', faculty: '', jr: '' };
      roles.forEach((r, k) => { row[r] = tidy(cells[k].join(' ')); });
      row.batch = [ctx.batch, ctx.sub].filter(Boolean).join(' - ');
      rows.push(row);
    });
    return rows;
  }

  const tidy = s => s.replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim();
  const tidyTime = s => tidy(s).replace(/\s*[-–]\s*/g, ' - ').replace(/(\d)\s*(am|pm)/gi, (m, d, ap) => `${d} ${ap.toUpperCase()}`);

  function parseWords(words) {
    const { lines, H } = toLines(words);
    const full = lines.map(L => L.text).join('\n');
    const meta = { batch: '', type: '' };
    const mb = /MBBS\s*[-–]?\s*(\d{4})/i.exec(full);
    if (mb) meta.batch = 'MBBS ' + mb[1];
    else if (/nursing/i.test(full)) meta.batch = 'Nursing';
    if (/nursing/i.test(full)) meta.type = 'nursing';
    else if (/practical/i.test(full) && mb) meta.type = 'ug_practical';
    else if (/theory/i.test(full)) meta.type = 'ug_theory';
    const tm = /^Time\s*:?\s*(.+)$/im.exec(full);
    const ctx = { batch: meta.batch, sub: '', time: tm ? tidyTime(tm[1]) : '' };

    const rows = [];
    let header = null, starts = [];
    const flush = () => { if (starts.length) rows.push(...parseTable(starts, lines, H, header, { ...ctx })); starts = []; };
    for (const L of lines) {
      const hasDate = L.words.some(w => DATE.test(w.t));
      const isHeader = !hasDate && L.words.some(w => /^date$/i.test(w.t));
      const sub = !hasDate && /\bBatch\s*[-:]?\s*([A-Z])\b(?!\w)/.exec(L.text);
      if (isHeader || (sub && !/MBBS/i.test(L.text)) || STOP.test(L.text)) L.stop = true;
      if (isHeader) { flush(); header = L; }
      else if (L.stop && sub) { flush(); ctx.sub = 'Batch ' + sub[1]; }
      else if (hasDate) starts.push(analyzeStart(L, H));
    }
    flush();
    return { rows: rows.filter(r => r.date), meta };
  }

  const jpeg = canvas => ({ mime: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] });

  // Word files: pull the text out with table cells separated by " | ".
  async function docxText(file) {
    await loadScript(LIBS.zip);
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');
    const text = xml.replace(/<\/w:tc>/g, ' | ').replace(/<\/w:tr>/g, '\n').replace(/<\/w:p>/g, ' ').replace(/<[^>]+>/g, '');
    const el = document.createElement('textarea');
    el.innerHTML = text;
    return el.value;
  }

  // ai({ images, text }) asks the shared script to read the schedule with an AI model. Without it,
  // text PDFs are still read exactly, and photos fall back to the much weaker on-device reader.
  async function readFile(file, onProg, ai) {
    const name = file.name || '';
    const out = { rows: [], meta: { batch: '', type: '' }, how: 'text' };
    const add = r => { out.rows.push(...r.rows); if (!out.meta.batch && r.meta) out.meta = r.meta; };
    const picture = async canvas => {
      if (ai) { out.how = 'ai'; add(await ai({ images: [jpeg(canvas)] })); }
      else { out.how = 'ocr'; add(parseWords(await ocr(canvas, onProg))); }
    };
    if (/\.docx$/i.test(name)) {
      if (!ai) throw new Error('Word files can be read once sharing is set up. Until then save it as PDF.');
      out.how = 'ai';
      add(await ai({ text: await docxText(file) }));
    } else if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) {
      for (const page of await pdfPages(await file.arrayBuffer())) {
        if (page.canvas) await picture(page.canvas); else add(parseWords(page.words));
      }
    } else {
      const url = URL.createObjectURL(file);
      try { await picture(await imageToCanvas(url, !ai)); } finally { URL.revokeObjectURL(url); }
    }
    return out;
  }

  return { readFile, parseWords, loadScript };
})();
