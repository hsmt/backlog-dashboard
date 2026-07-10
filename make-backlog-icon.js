// Builds the app icon (.icns) and the menu-bar tray template from the official
// Backlog "b" mark (assets/backlog-source.png). Dependency-free: decodes the
// source PNG, upscales it, composites onto a rounded-square, and calls iconutil.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { encodePNG } = require('./pnglib');

// --- minimal PNG decoder (8-bit RGBA, non-interlaced) ----------------------
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, colorType = 0, bitDepth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error(`unsupported PNG (bd=${bitDepth} ct=${colorType})`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = width * bpp;
  const out = Buffer.alloc(width * height * bpp);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rowStart + x];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = rawByte; break;
        case 1: v = rawByte + a; break;
        case 2: v = rawByte + b; break;
        case 3: v = rawByte + ((a + b) >> 1); break;
        case 4: v = rawByte + paeth(a, b, c); break;
        default: throw new Error('bad filter ' + filter);
      }
      out[y * stride + x] = v & 0xff;
    }
  }
  return { width, height, data: out };
}

// bilinear sample of src at (fx,fy) in source pixel space -> [r,g,b,a]
function sample(src, fx, fy) {
  const { width: w, height: h, data } = src;
  fx = Math.min(Math.max(fx, 0), w - 1);
  fy = Math.min(Math.max(fy, 0), h - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const dx = fx - x0, dy = fy - y0;
  const px = (x, y, k) => data[(y * w + x) * 4 + k];
  const out = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const top = px(x0, y0, k) * (1 - dx) + px(x1, y0, k) * dx;
    const bot = px(x0, y1, k) * (1 - dx) + px(x1, y1, k) * dx;
    out[k] = top * (1 - dy) + bot * dy;
  }
  return out;
}

// --- app icon master: rounded white square + the b, anti-aliased ----------
function buildAppMaster(src, S) {
  const px = Buffer.alloc(S * S * 4);
  const r = S * 0.2237;                 // squircle-ish corner radius
  const pad = S * 0.06;                  // inset so the mark isn't full-bleed
  const inner = S - 2 * pad;
  const SS = 4;                          // mask supersampling for AA
  const insideRR = (x, y) => {
    const cx = Math.min(Math.max(x, r), S - r);
    const cy = Math.min(Math.max(y, r), S - r);
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let cov = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++)
          if (insideRR(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) cov++;
      cov /= SS * SS;
      const i = (y * S + x) * 4;
      if (cov <= 0) continue;
      const c = sample(src, ((x - pad) / inner) * src.width, ((y - pad) / inner) * src.height);
      // Source is opaque; treat outside-inset as white background.
      const inSrc = x >= pad && x < S - pad && y >= pad && y < S - pad;
      const rgb = inSrc ? c : [255, 255, 255, 255];
      px[i] = Math.round(rgb[0]); px[i + 1] = Math.round(rgb[1]); px[i + 2] = Math.round(rgb[2]);
      px[i + 3] = Math.round(cov * 255);
    }
  }
  return px;
}

// --- tray template: the b as a black-on-transparent alpha mask ------------
function buildTrayMask(src, S) {
  const px = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c = sample(src, (x / S) * src.width, (y / S) * src.height);
      const minc = Math.min(c[0], c[1], c[2]);      // distance from white
      const a = Math.min(255, Math.round((1 - minc / 255) * 255 * 1.6));
      const i = (y * S + x) * 4;
      px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = (a * (c[3] / 255)) | 0;
    }
  }
  return px;
}

function downsample(master, S, D) {
  const out = Buffer.alloc(D * D * 4);
  const f = S / D;
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = Math.floor(y * f); sy < Math.floor((y + 1) * f); sy++)
      for (let sx = Math.floor(x * f); sx < Math.floor((x + 1) * f); sx++) {
        const i = (sy * S + sx) * 4, al = master[i + 3];
        r += master[i] * al; g += master[i + 1] * al; b += master[i + 2] * al; a += al; n++;
      }
    const o = (y * D + x) * 4;
    out[o] = a ? Math.round(r / a) : 0;
    out[o + 1] = a ? Math.round(g / a) : 0;
    out[o + 2] = a ? Math.round(b / a) : 0;
    out[o + 3] = n ? Math.round(a / n) : 0;
  }
  return out;
}

// --- run -------------------------------------------------------------------
const assets = path.join(__dirname, 'assets');
const src = decodePNG(fs.readFileSync(path.join(assets, 'backlog-source.png')));
console.log(`Source: ${src.width}x${src.height}`);

// Tray template (menu bar): the b mark, black-on-transparent.
fs.writeFileSync(path.join(assets, 'trayTemplate.png'), encodePNG(22, buildTrayMask(src, 22)));
fs.writeFileSync(path.join(assets, 'trayTemplate@2x.png'), encodePNG(44, buildTrayMask(src, 44)));
console.log('Wrote assets/trayTemplate.png (+@2x)');

// App icon: rounded square with the b.
const MASTER = 1024;
const master = buildAppMaster(src, MASTER);
const iconsetDir = path.join(assets, 'appicon.iconset');
fs.rmSync(iconsetDir, { recursive: true, force: true });
fs.mkdirSync(iconsetDir, { recursive: true });
const specs = [
  [16, 'icon_16x16.png'], [32, 'icon_16x16@2x.png'], [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'], [128, 'icon_128x128.png'], [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'], [512, 'icon_256x256@2x.png'], [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
];
for (const [size, name] of specs) {
  const buf = size === MASTER ? master : downsample(master, MASTER, size);
  fs.writeFileSync(path.join(iconsetDir, name), encodePNG(size, buf));
}
fs.writeFileSync(path.join(assets, 'icon.png'), encodePNG(512, downsample(master, MASTER, 512)));
console.log('Wrote', specs.length, 'iconset PNGs');

try {
  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', path.join(assets, 'icon.icns')]);
  console.log('Wrote assets/icon.icns');
} catch (e) {
  console.warn('iconutil failed (not on macOS?):', e.message);
}
