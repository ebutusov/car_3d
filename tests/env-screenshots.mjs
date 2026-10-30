// Renders the environment test harness for each preset and saves screenshots.
// Usage: node tests/env-screenshots.mjs [outputDir]   (server: npx vite --port 5199 --strictPort)
// Fails (exit 1) on any page error or console error.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outputDirectory = process.argv[2] || process.env.ENV_SHOT_DIR || 'tests/screenshots/env';
const baseUrl = process.env.ENV_TEST_URL || 'http://localhost:5199/env-test.html';
const includeHigh = process.env.ENV_SKIP_HIGH !== '1';
mkdirSync(outputDirectory, { recursive: true });

const shots = [
	{ name: 'day-low', quality: 'low', preset: 'day' },
	{ name: 'sunset-low', quality: 'low', preset: 'sunset' },
	{ name: 'overcast-low', quality: 'low', preset: 'overcast' },
	{ name: 'night-low', quality: 'low', preset: 'night' },
	{ name: 'night-wide-low', quality: 'low', preset: 'night', camera: [16, 5, 16], target: [0, 1, -4] },
	{ name: 'night-moon-low', quality: 'low', preset: 'night', camera: [-7, 1.4, -9], target: [2, 14, 8] },
	{ name: 'sunset-wide-low', quality: 'low', preset: 'sunset', camera: [10, 2.5, -9], target: [-4, 1, 4] },
	{ name: 'day-wide-low', quality: 'low', preset: 'day', camera: [-14, 3, 12], target: [0, 2, -10] }
];
if (includeHigh) shots.push({ name: 'day-high', quality: 'high', preset: 'day' });
if (process.env.ENV_EXTRA === '1') {
	shots.push({ name: 'sunset-high', quality: 'high', preset: 'sunset' });
	shots.push({ name: 'night-high', quality: 'high', preset: 'night' });
}

const onlyNames = process.env.ENV_ONLY ? process.env.ENV_ONLY.split(',') : null;
const selectedShots = onlyNames ? shots.filter((shot) => onlyNames.includes(shot.name)) : shots;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
try {
	for (const shot of selectedShots) {
		const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
		page.setDefaultTimeout(240000);
		page.on('pageerror', (error) => problems.push(`[${shot.name}] pageerror: ${error.message}`));
		page.on('console', (message) => {
			if (message.type() === 'error') problems.push(`[${shot.name}] console error: ${message.text()}`);
			else if (message.type() === 'warning') console.log(`[${shot.name}] warn: ${message.text()}`);
		});
		const started = Date.now();
		await page.goto(`${baseUrl}?quality=${shot.quality}&preset=${shot.preset}&manual&hideui`, { waitUntil: 'load' });
		await page.waitForFunction(() => window.envTest !== undefined, null, { timeout: 240000 });
		const info = await page.evaluate(({ camera, target }) => {
			if (camera) window.envTest.setCamera(camera, target);
			window.envTest.renderFrames(3);
			return window.envTest.info();
		}, { camera: shot.camera, target: shot.target });
		const filePath = join(outputDirectory, `${shot.name}.png`);
		await page.screenshot({ path: filePath });
		console.log(`${shot.name}: ${filePath} (${((Date.now() - started) / 1000).toFixed(1)} s)`, JSON.stringify(info));
		await page.close();
	}
} finally {
	await browser.close();
}
if (problems.length) {
	console.error(problems.join('\n'));
	process.exit(1);
}
console.log('OK');
