// App entry: renderer, environment, car, post-processing, camera rig, UI and input.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createEnvironment } from './environment.js';
import { createCar, MAX_STEER_ANGLE } from './car/index.js';
import { accelerateRaycasts } from './car/surfaceBuilder.js';
import { createCameraRig } from './cameraRig.js';

const parameters = new URLSearchParams(location.search);
const quality = parameters.get('quality') === 'low' ? 'low' : 'high';

const PAINTS = [
	['Carrara White', '#e8e8e3'], ['Jet Black', '#0a0b0d'], ['Chalk', '#c8c4b8'],
	['Dolomite Silver', '#a9acaf'], ['Quartzite Grey', '#6f7478'], ['Arctic Grey', '#bcc1c3'],
	['Carmine Red', '#8c0d16'], ['Biscay Blue', '#1b3f73'], ['Moonlight Blue', '#232f48'],
	['Mamba Green', '#2e4a3b'], ['Mahogany', '#4a2420'], ['Papaya', '#e2661f'],
];
const FINISHES = {
	metallic: { metalness: 0.55, roughness: 0.34, clearcoatRoughness: 0.035 },
	gloss: { metalness: 0.0, roughness: 0.22, clearcoatRoughness: 0.02 },
	satin: { metalness: 0.35, roughness: 0.55, clearcoatRoughness: 0.45 },
};
const PART_LABELS = {
	frontLeftDoor: 'front left door', frontRightDoor: 'front right door', rearLeftDoor: 'rear left door',
	rearRightDoor: 'rear right door', hood: 'bonnet', tailgate: 'tailgate',
};
const VIEWS = {
	threeQuarter: { position: [6.4, 2.1, 5.6], target: [0, 0.75, 0] },
	side: { position: [0.2, 1.2, 8.2], target: [0, 0.8, 0] },
	rear: { position: [-7.2, 1.9, -3.4], target: [0, 0.85, 0] },
	top: { position: [0.01, 10.5, 0.01], target: [0, 0.5, 0] },
	driver: { position: [-0.45, 1.22, -0.38], target: [3, 0.98, -0.38], mode: 'walk' },
	engine: { position: [3.7, 2.3, 1.5], target: [1.5, 0.8, 0], open: ['hood'] },
};

const keyboard = (() => {
	const pressed = new Set();
	window.addEventListener('keydown', (event) => pressed.add(event.code));
	window.addEventListener('keyup', (event) => pressed.delete(event.code));
	window.addEventListener('blur', () => pressed.clear());
	return { isDown: (code) => pressed.has(code) };
})();

// --- Renderer, scene, camera ----------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(quality === 'high' ? Math.min(devicePixelRatio, 2) : 1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('viewport').appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 2500);
camera.position.set(...VIEWS.threeQuarter.position);

const environment = createEnvironment({ scene, renderer, quality });
const car = createCar({ quality });
scene.add(car.group);
const carMeshes = [];
car.group.traverse((object) => {
	if (object.isMesh) carMeshes.push(object);
});
accelerateRaycasts(carMeshes);

const rig = createCameraRig({ camera, domElement: renderer.domElement, keyboard });
rig.orbit.target.set(...VIEWS.threeQuarter.target);
rig.orbit.update();

// Post-processing: bloom makes lamps and headlights glow at night.
let composer = null;
let bloomPass = null;
if (quality === 'high') {
	composer = new EffectComposer(renderer);
	composer.addPass(new RenderPass(scene, camera));
	bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.55, 1);
	composer.addPass(bloomPass);
	composer.addPass(new OutputPass());
}

addEventListener('resize', () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
	composer?.setSize(innerWidth, innerHeight);
});

// --- UI ----------------------------------------------------------------------------------------
const elements = {
	panel: document.getElementById('panel'),
	panelToggle: document.getElementById('panel-toggle'),
	presets: [...document.querySelectorAll('[data-preset]')],
	timeSlider: document.getElementById('time-slider'),
	timeOutput: document.getElementById('time-output'),
	cloudSlider: document.getElementById('cloud-slider'),
	cloudOutput: document.getElementById('cloud-output'),
	dayNight: document.getElementById('day-night'),
	swatches: document.getElementById('swatches'),
	paintPicker: document.getElementById('paint-picker'),
	paintFinish: document.getElementById('paint-finish'),
	paintName: document.getElementById('paint-name'),
	partButtons: [...document.querySelectorAll('[data-part]')],
	openAll: document.getElementById('open-all'),
	closeAll: document.getElementById('close-all'),
	steerSlider: document.getElementById('steer-slider'),
	steerOutput: document.getElementById('steer-output'),
	speedSlider: document.getElementById('speed-slider'),
	speedOutput: document.getElementById('speed-output'),
	lightButtons: [...document.querySelectorAll('[data-lights]')],
	cameraButtons: [...document.querySelectorAll('[data-camera]')],
	viewButtons: [...document.querySelectorAll('[data-view]')],
	autoRotate: document.getElementById('auto-rotate'),
	hoverLabel: document.getElementById('hover-label'),
	walkHint: document.getElementById('walk-hint'),
	loading: document.getElementById('loading'),
};

function formatTime(hours) {
	const wrapped = ((hours % 24) + 24) % 24;
	const wholeHours = Math.floor(wrapped);
	const minutes = Math.floor((wrapped - wholeHours) * 60);
	return `${String(wholeHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function refreshEnvironmentUi() {
	const time = environment.getTimeOfDay();
	const cloudiness = environment.getCloudiness();
	elements.timeSlider.value = time;
	elements.timeOutput.textContent = formatTime(time);
	elements.cloudSlider.value = cloudiness;
	elements.cloudOutput.textContent = `${Math.round(cloudiness * 100)}%`;
	const preset = environment.getPreset();
	for (const button of elements.presets) button.classList.toggle('active', button.dataset.preset === preset);
	elements.dayNight.textContent = environment.nightFactor > 0.5 ? '☀ Switch to day' : '☾ Switch to night';
}

function setDayNight(toNight) {
	environment.setPreset(toNight ? 'night' : 'day');
}

for (const button of elements.presets) button.addEventListener('click', () => environment.setPreset(button.dataset.preset));
elements.timeSlider.addEventListener('input', () => environment.setTimeOfDay(Number(elements.timeSlider.value)));
elements.cloudSlider.addEventListener('input', () => environment.setCloudiness(Number(elements.cloudSlider.value)));
elements.dayNight.addEventListener('click', () => setDayNight(environment.nightFactor <= 0.5));
environment.onChange(({ nightFactor }) => {
	car.setNightFactor(nightFactor);
	refreshEnvironmentUi();
});

let paintIndex = PAINTS.findIndex(([, hex]) => hex === car.getPaint());
function setPaint(hex, name) {
	car.setPaint(hex);
	elements.paintPicker.value = car.getPaint();
	paintIndex = PAINTS.findIndex(([, paintHex]) => paintHex.toLowerCase() === car.getPaint());
	elements.paintName.textContent = name || (paintIndex >= 0 ? PAINTS[paintIndex][0] : `Custom ${car.getPaint()}`);
	for (const swatch of elements.swatches.children) swatch.classList.toggle('active', swatch.dataset.color === car.getPaint());
}
for (const [name, hex] of PAINTS) {
	const swatch = document.createElement('button');
	swatch.className = 'swatch';
	swatch.title = name;
	swatch.setAttribute('aria-label', name);
	swatch.dataset.color = hex.toLowerCase();
	swatch.style.background = hex;
	swatch.addEventListener('click', () => setPaint(hex, name));
	elements.swatches.appendChild(swatch);
}
elements.paintPicker.addEventListener('input', () => setPaint(elements.paintPicker.value));
elements.paintFinish.addEventListener('change', () => {
	car.setPaintFinish(FINISHES[elements.paintFinish.value]);
	elements.paintFinish.blur();
});

function refreshPartButtons() {
	for (const button of elements.partButtons) button.classList.toggle('active', car.isOpen(button.dataset.part));
}
for (const button of elements.partButtons) {
	button.addEventListener('click', () => {
		car.toggle(button.dataset.part);
		refreshPartButtons();
	});
}
function setAllParts(open) {
	for (const name of car.partNames) car.setOpen(name, open);
	refreshPartButtons();
}
elements.openAll.addEventListener('click', () => setAllParts(true));
elements.closeAll.addEventListener('click', () => setAllParts(false));

function setSteerDegrees(degrees) {
	const clamped = THREE.MathUtils.clamp(degrees, -34, 34);
	car.setSteer(THREE.MathUtils.degToRad(clamped), false);
	elements.steerSlider.value = clamped;
	elements.steerOutput.textContent = `${clamped > 0 ? 'L ' : clamped < 0 ? 'R ' : ''}${Math.abs(clamped).toFixed(0)}°`;
}
elements.steerSlider.addEventListener('input', () => setSteerDegrees(Number(elements.steerSlider.value)));
function setRollSpeed(kilometresPerHour) {
	const clamped = THREE.MathUtils.clamp(kilometresPerHour, -20, 60);
	car.setWheelSpeed(clamped / 3.6);
	elements.speedSlider.value = clamped;
	elements.speedOutput.textContent = `${clamped.toFixed(0)} km/h`;
}
elements.speedSlider.addEventListener('input', () => setRollSpeed(Number(elements.speedSlider.value)));

function setLightMode(mode) {
	car.setLights(mode);
	for (const button of elements.lightButtons) button.classList.toggle('active', button.dataset.lights === mode);
}
for (const button of elements.lightButtons) button.addEventListener('click', () => setLightMode(button.dataset.lights));

function refreshCameraUi(mode) {
	for (const button of elements.cameraButtons) button.classList.toggle('active', button.dataset.camera === mode);
	elements.walkHint.hidden = mode !== 'walk';
	if (mode === 'walk') {
		elements.autoRotate.checked = false;
		rig.orbit.autoRotate = false;
	}
}
rig.onModeChange(refreshCameraUi);
for (const button of elements.cameraButtons) button.addEventListener('click', () => rig.setMode(button.dataset.camera));

function goToView(name) {
	const view = VIEWS[name];
	for (const part of view.open || []) car.setOpen(part, true);
	refreshPartButtons();
	rig.flyTo({ position: view.position, target: view.target, mode: view.mode || 'orbit' });
}
for (const button of elements.viewButtons) button.addEventListener('click', () => goToView(button.dataset.view));
elements.autoRotate.addEventListener('change', () => {
	if (elements.autoRotate.checked) rig.setMode('orbit');
	rig.orbit.autoRotate = elements.autoRotate.checked;
	rig.orbit.autoRotateSpeed = 0.8;
});
elements.panelToggle.addEventListener('click', () => elements.panel.classList.toggle('collapsed'));
// Keep keyboard shortcuts working after clicking panel buttons.
elements.panel.addEventListener('click', (event) => {
	if (event.target.closest('button')) event.target.closest('button').blur();
});

// --- Picking: click doors / bonnet / tailgate ----------------------------------------------------
const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
const pointer = new THREE.Vector2();

function pickPart(clientX, clientY) {
	const bounds = renderer.domElement.getBoundingClientRect();
	pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
	raycaster.setFromCamera(pointer, camera);
	const hit = raycaster.intersectObjects(carMeshes, false)[0];
	return hit ? car.partFromObject(hit.object) : null;
}

let pointerDown = null;
renderer.domElement.addEventListener('pointerdown', (event) => {
	pointerDown = { x: event.clientX, y: event.clientY, button: event.button };
});
renderer.domElement.addEventListener('pointerup', (event) => {
	if (!pointerDown || pointerDown.button !== 0) return;
	const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
	pointerDown = null;
	if (moved > 5 || document.pointerLockElement) return;
	const part = pickPart(event.clientX, event.clientY);
	if (part) {
		car.toggle(part);
		refreshPartButtons();
	}
});
let hoverEvent = null;
renderer.domElement.addEventListener('pointermove', (event) => {
	hoverEvent = event;
});
renderer.domElement.addEventListener('pointerleave', () => {
	hoverEvent = null;
	elements.hoverLabel.hidden = true;
	renderer.domElement.style.cursor = '';
});

function updateHover() {
	if (!hoverEvent || document.pointerLockElement || hoverEvent.buttons) {
		if (document.pointerLockElement) elements.hoverLabel.hidden = true;
		return;
	}
	const part = pickPart(hoverEvent.clientX, hoverEvent.clientY);
	elements.hoverLabel.hidden = !part;
	renderer.domElement.style.cursor = part ? 'pointer' : '';
	if (part) {
		elements.hoverLabel.textContent = `Click to ${car.isOpen(part) ? 'close' : 'open'} the ${PART_LABELS[part]}`;
		elements.hoverLabel.style.left = `${hoverEvent.clientX}px`;
		elements.hoverLabel.style.top = `${hoverEvent.clientY}px`;
	}
	hoverEvent = null;
}

// --- Keyboard shortcuts --------------------------------------------------------------------------
const PART_KEYS = {
	Digit1: 'frontLeftDoor', Digit2: 'frontRightDoor', Digit3: 'rearLeftDoor', Digit4: 'rearRightDoor',
	KeyH: 'hood', KeyT: 'tailgate',
};
window.addEventListener('keydown', (event) => {
	// Only text entry swallows shortcuts; sliders, checkboxes and the finish menu do not.
	const target = event.target;
	const isTextEntry = target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && !['range', 'checkbox', 'color'].includes(target.type));
	if (isTextEntry || event.ctrlKey || event.metaKey || event.altKey) return;
	if (target.tagName === 'INPUT' || target.tagName === 'SELECT') target.blur();
	if (event.code.startsWith('Arrow')) event.preventDefault();
	if (event.repeat && !event.code.startsWith('Arrow')) return;
	if (PART_KEYS[event.code]) {
		car.toggle(PART_KEYS[event.code]);
		refreshPartButtons();
		return;
	}
	switch (event.code) {
		case 'KeyO':
			setAllParts(!car.partNames.every((name) => car.isOpen(name)));
			break;
		case 'KeyN':
			setDayNight(environment.nightFactor <= 0.5);
			break;
		case 'KeyL': {
			const modes = ['auto', 'on', 'off'];
			setLightMode(modes[(modes.indexOf(car.getLights()) + 1) % modes.length]);
			break;
		}
		case 'KeyV':
			rig.setMode(rig.getMode() === 'orbit' ? 'walk' : 'orbit');
			break;
		case 'KeyP': {
			const [name, hex] = PAINTS[(paintIndex + 1 + PAINTS.length) % PAINTS.length];
			setPaint(hex, name);
			break;
		}
		case 'KeyR':
			goToView('threeQuarter');
			break;
		case 'ArrowUp':
			setRollSpeed(Number(elements.speedSlider.value) + 5);
			break;
		case 'ArrowDown':
			setRollSpeed(Number(elements.speedSlider.value) - 5);
			break;
		default:
	}
});

// Held arrow keys turn the steering wheel continuously.
function updateSteeringFromKeys(deltaSeconds) {
	const direction = (keyboard.isDown('ArrowLeft') ? 1 : 0) - (keyboard.isDown('ArrowRight') ? 1 : 0);
	if (!direction) return;
	setSteerDegrees(Number(elements.steerSlider.value) + direction * 45 * deltaSeconds);
}

// --- Main loop -----------------------------------------------------------------------------------
const clock = new THREE.Clock();
let frameCount = 0;
function animate() {
	const deltaSeconds = Math.min(clock.getDelta(), 0.1);
	const elapsedSeconds = clock.elapsedTime;
	updateSteeringFromKeys(deltaSeconds);
	rig.update(deltaSeconds);
	car.update(deltaSeconds);
	environment.update(deltaSeconds, elapsedSeconds);
	car.setExposure(renderer.toneMappingExposure);
	updateHover();
	if (composer) {
		// Bloom only what is bright after exposure, and more of it at night.
		// By day a low threshold makes the sun haze the whole frame, so bloom is mostly a night effect.
		const nightFactor = environment.nightFactor;
		bloomPass.threshold = THREE.MathUtils.lerp(6, 1.4, nightFactor) / renderer.toneMappingExposure;
		bloomPass.strength = THREE.MathUtils.lerp(0.08, 0.7, nightFactor);
		composer.render(deltaSeconds);
	} else {
		renderer.render(scene, camera);
	}
	frameCount++;
	if (frameCount === 2) {
		elements.loading.classList.add('done');
		setTimeout(() => elements.loading.remove(), 800);
	}
}

// Initial state.
setPaint(car.getPaint());
car.setPaintFinish(FINISHES.metallic);
setLightMode('auto');
setSteerDegrees(0);
setRollSpeed(0);
refreshCameraUi(rig.getMode());
refreshPartButtons();
if (parameters.get('preset')) environment.setPreset(parameters.get('preset'));
else environment.setPreset('day');
car.setNightFactor(environment.nightFactor);
refreshEnvironmentUi();
renderer.setAnimationLoop(animate);

// Exposed for automated tests and the console.
window.app = {
	car,
	environment,
	camera,
	rig,
	renderer,
	scene,
	goToView,
	setPaint,
	setSteerDegrees,
	setRollSpeed,
	setLightMode,
	getFrameCount: () => frameCount,
	// Screen position (CSS pixels) of a point on a part, for click tests.
	projectPart(name) {
		const box = new THREE.Box3().setFromObject(car.hinges[name]);
		const center = box.getCenter(new THREE.Vector3());
		const projected = center.project(camera);
		const bounds = renderer.domElement.getBoundingClientRect();
		return { x: bounds.left + (projected.x + 1) / 2 * bounds.width, y: bounds.top + (1 - projected.y) / 2 * bounds.height };
	},
	getState() {
		return {
			parts: Object.fromEntries(car.partNames.map((name) => [name, { open: car.isOpen(name), amount: car.getOpenAmount(name) }])),
			steerDegrees: THREE.MathUtils.radToDeg(car.getSteer()),
			maxSteerDegrees: THREE.MathUtils.radToDeg(MAX_STEER_ANGLE),
			wheelSpeed: car.getWheelSpeed(),
			paint: car.getPaint(),
			lights: car.getLights(),
			lightsOn: car.areLightsOn(),
			timeOfDay: environment.getTimeOfDay(),
			preset: environment.getPreset(),
			nightFactor: environment.nightFactor,
			cameraMode: rig.getMode(),
			cameraPosition: camera.position.toArray(),
			frameCount,
		};
	},
};
