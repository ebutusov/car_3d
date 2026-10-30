// Captures the main app under a few presets: node tests/app.mjs [quality] [presets]
import { launchBrowser, collectErrors } from './browser.mjs';

const quality = process.argv[2] || 'low';
const presets = (process.argv[3] || 'day,night').split(',');
const browser = await launchBrowser();
for (const preset of presets) {
	const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
	const errors = collectErrors(page);
	await page.goto(`http://localhost:5173/?quality=${quality}&preset=${preset}`, { timeout: 180000 });
	await page.waitForFunction(() => window.app && window.app.getFrameCount() > 3, null, { timeout: 180000 });
	await page.waitForTimeout(1500);
	const start = Date.now(); const frames = await page.evaluate(() => window.app.getFrameCount());
	await page.waitForTimeout(3000);
	console.log('fps', ((await page.evaluate(() => window.app.getFrameCount())) - frames) / ((Date.now() - start) / 1000));
	await page.screenshot({ path: `tests/screenshots/app-${preset}-${quality}.png`, timeout: 180000 });
	console.log(preset, JSON.stringify(await page.evaluate(() => window.app.getState())));
	console.log(errors.length ? errors.join('\n') : 'no errors');
	await page.close();
}
await browser.close();
