// Standalone harness for src/environment.js (not part of the app).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment } from './environment.js';

const searchParams = new URLSearchParams(location.search);
const quality = searchParams.get('quality') === 'low' ? 'low' : 'high';

const renderer = new THREE.WebGLRenderer({ antialias: quality === 'high', preserveDrawingBuffer: true });
renderer.setPixelRatio(quality === 'high' ? Math.min(devicePixelRatio, 2) : 1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(8.5, 2.2, 8.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.update();

// placeholder car: 4.9 x 1.7 x 2.0, metallic paint
const carMaterial = new THREE.MeshPhysicalMaterial({
	color: 0x8a0f12, metalness: 0.6, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.04
});
const car = new THREE.Mesh(new THREE.BoxGeometry(4.9, 1.2, 2.0), carMaterial);
car.position.y = 0.2 + 0.6;
car.castShadow = true;
car.receiveShadow = true;
scene.add(car);
const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.5, 1.8), new THREE.MeshPhysicalMaterial({ color: 0x111418, metalness: 0, roughness: 0.05, clearcoat: 1 }));
cabin.position.set(-0.3, 1.65, 0);
cabin.castShadow = true;
scene.add(cabin);
const chromeSphere = new THREE.Mesh(new THREE.SphereGeometry(0.45, 48, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.02 }));
chromeSphere.position.set(3.6, 0.45, 2.2);
chromeSphere.castShadow = true;
scene.add(chromeSphere);

const environment = createEnvironment({ scene, renderer, quality });
const changes = [];
environment.onChange((payload) => changes.push(payload));

const initialPreset = searchParams.get('preset');
if (initialPreset) environment.setPreset(initialPreset);
if (searchParams.has('time')) environment.setTimeOfDay(Number(searchParams.get('time')));
if (searchParams.has('clouds')) environment.setCloudiness(Number(searchParams.get('clouds')));
if (searchParams.has('hideui')) document.getElementById('controls').classList.add('hidden');

const timeSlider = document.getElementById('time');
const cloudSlider = document.getElementById('clouds');
timeSlider.addEventListener('input', () => environment.setTimeOfDay(Number(timeSlider.value)));
cloudSlider.addEventListener('input', () => environment.setCloudiness(Number(cloudSlider.value)));
for (const button of document.querySelectorAll('[data-preset]')) {
	button.addEventListener('click', () => environment.setPreset(button.dataset.preset));
}

const timer = new THREE.Timer();
let framesRendered = 0;
function renderFrame() {
	timer.update();
	const deltaSeconds = timer.getDelta();
	environment.update(deltaSeconds, timer.getElapsed());
	controls.update();
	renderer.render(scene, camera);
	framesRendered++;
}

const useAnimationLoop = !searchParams.has('manual');
if (useAnimationLoop) renderer.setAnimationLoop(renderFrame);

addEventListener('resize', () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
});

window.envTest = {
	environment,
	renderer,
	scene,
	camera,
	controls,
	changes,
	setTimeOfDay: (hours) => environment.setTimeOfDay(hours),
	setPreset: (name) => environment.setPreset(name),
	setCloudiness: (value) => environment.setCloudiness(value),
	setCamera(position, target) {
		camera.position.set(...position);
		controls.target.set(...target);
		controls.update();
	},
	renderFrames(count = 1) {
		for (let index = 0; index < count; index++) renderFrame();
		return framesRendered;
	},
	info: () => ({ ...renderer.info.render, programs: renderer.info.programs.length, nightFactor: environment.nightFactor, exposure: renderer.toneMappingExposure, fog: scene.fog.color.toArray().map((value) => +value.toFixed(4)) })
};
