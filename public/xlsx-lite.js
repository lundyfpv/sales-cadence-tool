// Reads the first worksheet of an .xlsx file into an array of rows (arrays of strings).
// An .xlsx file is a zip of XML parts; this unzips the few parts we need with the
// browser's built-in DecompressionStream, so no spreadsheet library is required.
(function () {
  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  }
  function unzipIndex(buf) {
    const dv = new DataView(buf); const u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not a valid .xlsx file.');
    const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      files[name] = { method, csize, local };
      p += 46 + nlen + elen + clen;
    }
    return { files, u8, dv };
  }
  async function readPart(z, name) {
    const f = z.files[name]; if (!f) return null;
    const lh = f.local; const nlen = z.dv.getUint16(lh + 26, true), elen = z.dv.getUint16(lh + 28, true);
    const start = lh + 30 + nlen + elen; const data = z.u8.subarray(start, start + f.csize);
    const out = f.method === 0 ? data : await inflate(data);
    return new TextDecoder().decode(out);
  }
  const colIndex = ref => { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  const pad = n => String(n).padStart(2, '0');
  function serialToDate(v) { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }

  window.readXlsx = async function (arrayBuffer) {
    const z = unzipIndex(arrayBuffer);
    const parse = t => new DOMParser().parseFromString(t, 'application/xml');
    // shared strings
    const shared = [];
    const ssx = await readPart(z, 'xl/sharedStrings.xml');
    if (ssx) for (const si of parse(ssx).getElementsByTagName('si')) shared.push([...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
    // date-formatted styles
    const dateStyles = new Set();
    const stx = await readPart(z, 'xl/styles.xml');
    if (stx) {
      const doc = parse(stx); const custom = {};
      for (const nf of doc.getElementsByTagName('numFmt')) custom[nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode') || '';
      const xfs = doc.getElementsByTagName('cellXfs')[0];
      if (xfs) [...xfs.getElementsByTagName('xf')].forEach((xf, i) => {
        const id = +xf.getAttribute('numFmtId');
        if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (custom[id] && /[dmy]/i.test(custom[id].replace(/"[^"]*"|\[[^\]]*\]/g, '')))) dateStyles.add(i);
      });
    }
    // first sheet in workbook order
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const wb = await readPart(z, 'xl/workbook.xml'), rels = await readPart(z, 'xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      const first = parse(wb).getElementsByTagName('sheet')[0];
      const rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
      for (const r of parse(rels).getElementsByTagName('Relationship')) if (r.getAttribute('Id') === rid) { const t = r.getAttribute('Target'); sheetPath = t.startsWith('/') ? t.slice(1) : 'xl/' + t; }
    }
    const sx = await readPart(z, sheetPath);
    if (!sx) throw new Error('No worksheet found in that file.');
    const rows = [];
    for (const row of parse(sx).getElementsByTagName('row')) {
      const out = [];
      for (const c of row.getElementsByTagName('c')) {
        const idx = colIndex(c.getAttribute('r')); const t = c.getAttribute('t'); const s = +c.getAttribute('s');
        const v = c.getElementsByTagName('v')[0]; let val = '';
        if (t === 's') val = shared[+(v && v.textContent)] ?? '';
        else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
        else if (v) { val = v.textContent; if (dateStyles.has(s) && !isNaN(+val)) val = serialToDate(+val); }
        out[idx >= 0 ? idx : out.length] = val;
      }
      rows.push(Array.from(out, x => x ?? ''));
    }
    return rows.filter(r => r.some(v => String(v).trim() !== ''));
  };
})();
