const sharp = require('sharp');

(async () => {
  const { data, info } = await sharp('assets/eko_emojis_transparent.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const colHas = new Array(w).fill(false), rowHas = new Array(h).fill(false);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 12) { colHas[x] = true; rowHas[y] = true; }
    }
  }
  function runs(arr) {
    const out = []; let start = null;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i]) { if (start === null) start = i; }
      else if (start !== null) { out.push([start, i - 1]); start = null; }
    }
    if (start !== null) out.push([start, arr.length - 1]);
    return out;
  }
  const cols = runs(colHas), rows = runs(rowHas);
  console.log('size', w, h);
  console.log('col spans', cols.length, JSON.stringify(cols));
  console.log('row spans', rows.length, JSON.stringify(rows));
})().catch((e) => { console.error(e); process.exit(1); });
