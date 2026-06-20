import { createRequire } from 'node:module';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

async function loadChromium() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    return require('playwright').chromium;
  }
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'assets', 'app-store', 'screenshots', 'iphone-6-9');
const appUrl = pathToFileURL(path.join(root, 'index.html')).href;

const shots = [
  ['02-today.png', 'today'],
  ['03-habits.png', 'habits'],
  ['04-focus.png', 'focus'],
  ['05-progress.png', 'progress'],
  ['06-guidance.png', 'coach'],
];

await mkdir(outDir, { recursive: true });

const chromium = await loadChromium();
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const launchOptions = { headless: true };
try {
  await access(chromePath);
  launchOptions.executablePath = chromePath;
} catch {
  // Fall back to Playwright's managed browser when it is installed.
}
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
});

const page = await context.newPage();
await page.goto(appUrl);
await page.waitForSelector('#app');
await page.screenshot({ path: path.join(outDir, '01-onboarding.png') });

await page.waitForFunction(() => typeof window.__seed === 'function');
await page.evaluate(() => window.__seed(45, true));
await page.waitForTimeout(350);

for (const [file, tab] of shots) {
  await page.evaluate((target) => {
    const btn = document.querySelector(`[data-act="tab"][data-id="${target}"]`);
    if (btn) btn.click();
  }, tab);
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(outDir, file) });
}

await browser.close();
console.log(`Generated ${shots.length + 1} screenshots in ${outDir}`);
