// Renders public/og.png (1200×630 link-preview card) and public/apple-touch-icon.png (180×180)
// with sharp. Run from site/: node tools/make-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const INK = '#0f0e0c', BG = '#f8f7f0', ACCENT = '#b51b03', MUTED = '#6b665c';

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${BG}"/>
  <text x="80" y="96" font-family="Arial, Helvetica, sans-serif" font-size="24" letter-spacing="3" fill="${INK}">SUYASH</text>
  <text x="72" y="355" font-family="Georgia, 'Times New Roman', serif" font-size="210" fill="${INK}">Namaste<tspan fill="${ACCENT}">!</tspan></text>
  <line x1="80" y1="408" x2="1120" y2="408" stroke="${INK}" stroke-opacity="0.25" stroke-width="2"/>
  <text x="80" y="470" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="38" fill="${INK}">Zero to one product designer <tspan fill="${MUTED}">with one simple rule,</tspan></text>
  <text x="80" y="520" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="38" fill="${INK}">the user wins and the business doesn’t lose.</text>
  <circle cx="86" cy="574" r="6" fill="${ACCENT}"/>
  <text x="104" y="582" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${MUTED}">notfiguredyet.com</text>
</svg>`;

await sharp(Buffer.from(og)).png().toFile('public/og.png');
await sharp(readFileSync('public/favicon.svg'), { density: 600 }).resize(180, 180).flatten({ background: INK }).png().toFile('public/apple-touch-icon.png');
console.log('wrote public/og.png and public/apple-touch-icon.png');
