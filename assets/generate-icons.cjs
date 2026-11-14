// Generates all app icons and splash screens from the SVGs in this folder.
// Run: node assets/generate-icons.cjs   (needs Playwright's Chromium).
// mark.svg is the shared cat drawing; edit it, rebuild icon*.svg, rerun.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const repo = path.resolve(__dirname, '..');
const svg = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const sized = (s, w, h) => s.replace('<svg ', `<svg width="${w}" height="${h}" `);
const execFileSync = require('child_process').execFileSync;

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ deviceScaleFactor: 1 });
  async function shot(html, w, h, out, transparent = true) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : '#FAF8F5'}">${html}</body></html>`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, omitBackground: transparent });
  }
  const res = `${repo}/android/app/src/main/res`;
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const s = Math.round(48 * k);
    const f = Math.round(108 * k);
    await shot(sized(svg('icon.svg'), s, s), s, s, `${res}/mipmap-${d}/ic_launcher.png`);
    await shot(`<div style="width:${s}px;height:${s}px;border-radius:50%;overflow:hidden">${sized(svg('icon-maskable.svg'), s, s)}</div>`, s, s, `${res}/mipmap-${d}/ic_launcher_round.png`);
    await shot(sized(svg('icon-foreground.svg'), f, f), f, f, `${res}/mipmap-${d}/ic_launcher_foreground.png`);
  }
  // Splash screens (Capacitor SplashScreen, centre-crop)
  for (const f of execFileSync('find', [res, '-name', 'splash.png']).toString().trim().split('\n')) {
    const [, w, h] = execFileSync('file', [f]).toString().match(/(\d+) x (\d+)/).map(Number);
    const icon = Math.round(Math.min(w, h) * 0.28);
    await shot(`<div style="width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(icon * 0.14)}px;font-family:Arial,Helvetica,sans-serif">
      ${sized(svg('icon.svg'), icon, icon)}
      <div style="font-size:${Math.round(icon * 0.26)}px;font-weight:800;color:#2E4738;letter-spacing:-0.5px">Tabby</div></div>`, w, h, f, false);
  }
  // Web / PWA
  const pub = `${repo}/public`;
  fs.copyFileSync(path.join(dir, 'icon.svg'), `${pub}/icon.svg`);
  await shot(sized(svg('icon.svg'), 192, 192), 192, 192, `${pub}/icon-192.png`);
  await shot(sized(svg('icon.svg'), 512, 512), 512, 512, `${pub}/icon-512.png`);
  await shot(sized(svg('icon-maskable.svg'), 512, 512), 512, 512, `${pub}/icon-maskable-512.png`);
  await shot(sized(svg('icon-maskable.svg'), 180, 180), 180, 180, `${pub}/apple-touch-icon.png`);
  await shot(sized(svg('icon.svg'), 48, 48), 48, 48, `${pub}/favicon-48.png`);
  await b.close();
  console.log('icons generated');
})();
