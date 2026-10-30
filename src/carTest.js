// Standalone viewer for inspecting the car model from fixed orthographic or perspective views.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCar } from './car/index.js';

const parameters = new URLSearchParams(location.search);
const view = parameters.get('view') || 'persp';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8a9099);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const car = createCar({ quality: parameters.get('quality') || 'high' });
scene.add(car.group);

const aspect = innerWidth / innerHeight;
const extent = view === 'top' ? 2.8 : view === 'front' || view === 'rear' ? 1.25 : 2.7;
let camera;
if (view === 'persp' || view === 'persp2' || view === 'persp3') {
	camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 100);
	const positions = { persp: [6.2, 2.4, 6.2], persp2: [-6.5, 2.2, 5.5], persp3: [7.5, 1.0, -3.0] };
	camera.position.set(...positions[view]);
} else {
	camera = new THREE.OrthographicCamera(-extent * aspect, extent * aspect, extent, -extent, 0.1, 100);
	const positions = { side: [0, 0.85, 20], front: [20, 0.85, 0], rear: [-20, 0.85, 0], top: [0, 20, 0.001] };
	camera.position.set(...positions[view]);
}
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, view === 'top' ? 0 : 0.85, 0);
controls.update();

for (const name of (parameters.get('open') || '').split(',').filter(Boolean)) car.setOpen(name, true, true);
if (parameters.get('steer')) car.setSteer(Number(parameters.get('steer')));
if (parameters.get('lights')) car.setLights(parameters.get('lights'));

window.carTest = { car, renderer, scene, camera };
let frames = 0;
renderer.setAnimationLoop(() => {
	car.update(1 / 60);
	controls.update();
	renderer.render(scene, camera);
	if (++frames === 3) window.ready = true;
});
