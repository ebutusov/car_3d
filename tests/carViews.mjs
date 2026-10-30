// Renders the car test page from several views: node tests/carViews.mjs [views] [extraQuery]
import { launchBrowser, collectErrors } from './browser.mjs';

const views = (process.argv[2] || 'side,front,rear,top,persp,persp2').split(',');
const extraQuery = process.argv[3] || '';
const browser = await launchBrowser();
const errors = [];
for (const view of views) {
	const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
	const pageErrors = collectErrors(page);
	await page.goto(`http://localhost:5173/car-test.html?view=${view}&${extraQuery}`, { timeout: 180000 });
	await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
	const suffix = extraQuery ? '-' + extraQuery.replace(/[^a-z0-9]+/gi, '_') : '';
	await page.screenshot({ path: `tests/screenshots/car-${view}${suffix}.png` });
	console.log('captured', view);
	errors.push(...pageErrors);
	await page.close();
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
