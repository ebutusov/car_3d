// Generic app screenshot: node tests/shot.mjs name "query" "js to run before capture"
import { launchBrowser, collectErrors } from './browser.mjs';
const [name, query = '', script = ''] = process.argv.slice(2);
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = collectErrors(page);
await page.goto(`http://localhost:5173/?${query.includes('quality') ? '' : 'quality=low&'}${query}`, { timeout: 180000 });
await page.waitForFunction(() => window.app && window.app.getFrameCount() > 2, null, { timeout: 180000 });
if (script) await page.evaluate(script);
const frames = await page.evaluate(() => window.app.getFrameCount());
await page.waitForFunction((count) => window.app.getFrameCount() > count + 4, frames, { timeout: 180000 });
await page.screenshot({ path: `tests/screenshots/${name}.png`, timeout: 180000 });
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
