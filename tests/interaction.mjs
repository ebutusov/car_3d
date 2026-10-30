// End-to-end interaction test of the main app in headless Chromium (SwiftShader).
// Requires the Vite dev server on :5173. Usage: node tests/interaction.mjs
import { launchBrowser, collectErrors } from './browser.mjs';

const results = [];
function check(name, condition, detail = '') {
	results.push({ name, ok: Boolean(condition) });
	console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = collectErrors(page);
// Software WebGL renders ~1 frame/s, and preset changes rebuild reflection maps synchronously.
page.setDefaultTimeout(240000);
await page.goto('http://localhost:5173/?quality=low', { timeout: 180000 });
await page.waitForFunction(() => window.app && window.app.getFrameCount() > 2, null, { timeout: 180000 });

const state = () => page.evaluate(() => window.app.getState());
const waitFrames = (count) => page.evaluate((frames) => new Promise((resolve) => {
	const target = window.app.getFrameCount() + frames;
	const poll = () => (window.app.getFrameCount() >= target ? resolve() : setTimeout(poll, 50));
	poll();
}), count);
const setCamera = (position, target) => page.evaluate(([cameraPosition, orbitTarget]) => {
	window.app.rig.setMode('orbit');
	window.app.camera.position.set(...cameraPosition);
	window.app.rig.orbit.target.set(...orbitTarget);
	window.app.rig.orbit.update();
}, [position, target]);
const waitPart = (name, amount) => page.waitForFunction(([part, value]) => window.app.getState().parts[part].amount === value, [name, amount], { timeout: 180000 });
const shot = (name) => page.screenshot({ path: `tests/screenshots/test-${name}.png`, timeout: 180000 });

// 1. Clicking each opening part on the car itself.
const clickViews = {
	frontRightDoor: [[0.6, 1.3, 7], [0, 0.8, 0]],
	rearRightDoor: [[-0.6, 1.3, 7], [-0.6, 0.8, 0]],
	frontLeftDoor: [[0.6, 1.3, -7], [0, 0.8, 0]],
	rearLeftDoor: [[-0.6, 1.3, -7], [-0.6, 0.8, 0]],
	hood: [[6, 3.5, 0.5], [1.4, 0.9, 0]],
	tailgate: [[-6.5, 2.4, 0.4], [-2, 1.0, 0]],
};
for (const [part, [position, target]] of Object.entries(clickViews)) {
	await setCamera(position, target);
	await waitFrames(2);
	const point = await page.evaluate((name) => window.app.projectPart(name), part);
	await page.mouse.click(point.x, point.y);
	await waitFrames(1);
	const opened = (await state()).parts[part].open;
	check(`click opens ${part}`, opened, `clicked at ${Math.round(point.x)},${Math.round(point.y)}`);
	if (opened) await waitPart(part, 1);
}
await setCamera([6.2, 2.6, 6.0], [-0.2, 0.8, 0]);
await waitFrames(3);
await shot('all-open-by-click');

// 2. Keyboard shortcuts close them again.
await page.locator('canvas').focus();
for (const key of ['1', '2', '3', '4', 'h', 't']) await page.keyboard.press(key);
await waitFrames(1);
const afterKeys = await state();
check('keys 1-4/H/T close all parts', Object.values(afterKeys.parts).every((part) => !part.open));
await page.keyboard.press('o');
await waitFrames(1);
check('key O opens everything', Object.values((await state()).parts).every((part) => part.open));
await page.click('#close-all');
await waitFrames(1);
check('Close all button', Object.values((await state()).parts).every((part) => !part.open));
await page.click('[data-part="hood"]');
await waitFrames(1);
check('panel button toggles bonnet', (await state()).parts.hood.open);
await page.click('[data-part="hood"]');

// 3. Steering with held arrow keys and the slider.
await page.locator('canvas').focus();
await page.keyboard.down('ArrowLeft');
await waitFrames(5);
await page.keyboard.up('ArrowLeft');
await waitFrames(6);
const steeredLeft = (await state()).steerDegrees;
check('ArrowLeft steers left', steeredLeft > 5, `${steeredLeft.toFixed(1)}°`);
await page.evaluate(() => window.app.setSteerDegrees(-30));
await page.waitForFunction(() => window.app.getState().steerDegrees < -29, null, { timeout: 120000 });
check('steer right to -30°', true);
await setCamera([6.5, 4.5, 3.0], [1.2, 0.4, 0]);
await waitFrames(3);
await shot('steer-right');
await page.evaluate(() => window.app.setSteerDegrees(0));
await page.keyboard.press('ArrowUp');
check('ArrowUp rolls the wheels', (await state()).wheelSpeed > 0);
await page.keyboard.press('ArrowDown');

// 4. Paint.
await page.click('.swatch[title="Carmine Red"]');
check('swatch sets paint', (await state()).paint === '#8c0d16');
await page.locator('canvas').focus();
await page.keyboard.press('p');
check('key P cycles paint', (await state()).paint !== '#8c0d16');
await page.evaluate(() => window.app.setPaint('#e2661f', 'Papaya'));

// 5. Day / night / sunset.
await setCamera([6.4, 2.1, 5.6], [0, 0.75, 0]);
await page.locator('canvas').focus();
await page.keyboard.press('n');
await waitFrames(3);
let current = await state();
check('key N switches to night', current.preset === 'night' && current.nightFactor > 0.9 && current.lightsOn);
await shot('night');
await page.click('[data-preset="sunset"]');
await waitFrames(3);
current = await state();
check('sunset preset', current.preset === 'sunset', `time ${current.timeOfDay}`);
await shot('sunset');
// From sunset the button reads "Switch to night"; a second press returns to day.
await page.click('#day-night');
await waitFrames(2);
check('day/night button: sunset -> night', (await state()).preset === 'night');
await page.click('#day-night');
await waitFrames(3);
current = await state();
check('day/night button: night -> day', current.nightFactor < 0.1, current.preset);
await page.click('[data-lights="on"]');
check('lights forced on in daylight', (await state()).lightsOn);
await page.click('[data-lights="auto"]');
await shot('day');

// 6. Orbit with mouse drag and keyboard panning.
const before = (await state()).cameraPosition;
await page.mouse.move(400, 400);
await page.mouse.down();
for (let step = 1; step <= 5; step++) {
	await page.mouse.move(400 + step * 40, 400);
	await waitFrames(1);
}
await page.mouse.up();
await waitFrames(4);
const afterDrag = (await state()).cameraPosition;
check('mouse drag orbits camera', Math.hypot(afterDrag[0] - before[0], afterDrag[2] - before[2]) > 0.3);
await page.locator('canvas').focus();
await page.keyboard.down('KeyW');
await waitFrames(5);
await page.keyboard.up('KeyW');
const afterPan = (await state()).cameraPosition;
check('W pans in orbit mode', Math.hypot(afterPan[0] - afterDrag[0], afterPan[2] - afterDrag[2]) > 0.3);

// 7. Walk mode: V, WASD, drag-to-look.
await page.keyboard.press('v');
check('V enters walk mode', (await state()).cameraMode === 'walk');
const walkStart = (await state()).cameraPosition;
await page.keyboard.down('KeyD');
await waitFrames(6);
await page.keyboard.up('KeyD');
const walkEnd = (await state()).cameraPosition;
check('D strafes in walk mode', Math.hypot(walkEnd[0] - walkStart[0], walkEnd[2] - walkStart[2]) > 0.5);
const lookBefore = await page.evaluate(() => window.app.camera.quaternion.toArray());
await page.mouse.move(640, 380);
await page.mouse.down();
await page.mouse.move(760, 330, { steps: 4 });
await page.mouse.up();
const lookAfter = await page.evaluate(() => window.app.camera.quaternion.toArray());
check('drag looks around in walk mode', lookBefore.some((value, index) => Math.abs(value - lookAfter[index]) > 0.01));
await page.click('[data-view="driver"]');
await page.waitForFunction(() => !window.app.rig.isTransitioning(), null, { timeout: 180000 });
await waitFrames(2);
await shot('driver-seat');
await page.keyboard.press('v');
check('V returns to orbit', (await state()).cameraMode === 'orbit');

check('no page or console errors', errors.length === 0, errors.join(' | '));
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
