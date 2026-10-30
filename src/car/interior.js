// Cabin (seats, dashboard, console, steering wheel), engine bay and cargo floor.
// Left-hand drive: the driver sits on the left, which is -Z when facing +X.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const DRIVER_Z = -0.38;

function roundedBox(width, height, depth, radius, material) {
	const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, radius), material);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}

function createSeat(materials, { width = 0.52, backHeight = 0.62, bolsters = true } = {}) {
	const seat = new THREE.Group();
	const cushion = roundedBox(0.52, 0.12, width, 0.045, materials.leather);
	cushion.position.set(0, 0.06, 0);
	cushion.rotation.z = THREE.MathUtils.degToRad(5);
	seat.add(cushion);
	const insert = roundedBox(0.42, 0.02, width * 0.55, 0.008, materials.leatherAccent);
	insert.position.set(0.0, 0.125, 0);
	insert.rotation.z = cushion.rotation.z;
	seat.add(insert);

	const back = new THREE.Group();
	back.position.set(-0.24, 0.1, 0);
	back.rotation.z = THREE.MathUtils.degToRad(17);
	seat.add(back);
	const backrest = roundedBox(0.12, backHeight, width, 0.05, materials.leather);
	backrest.position.set(0, backHeight / 2, 0);
	back.add(backrest);
	const backInsert = roundedBox(0.02, backHeight * 0.7, width * 0.5, 0.008, materials.leatherAccent);
	backInsert.position.set(0.06, backHeight * 0.47, 0);
	back.add(backInsert);
	if (bolsters) {
		for (const side of [1, -1]) {
			const bolster = roundedBox(0.16, backHeight * 0.75, 0.08, 0.035, materials.leather);
			bolster.position.set(0.04, backHeight * 0.42, side * (width / 2 - 0.02));
			back.add(bolster);
			const cushionBolster = roundedBox(0.46, 0.08, 0.08, 0.03, materials.leather);
			cushionBolster.position.set(0, 0.13, side * (width / 2 - 0.03));
			seat.add(cushionBolster);
		}
	}
	const headrest = roundedBox(0.1, 0.17, 0.26, 0.04, materials.leather);
	headrest.position.set(0.0, backHeight + 0.13, 0);
	back.add(headrest);
	return seat;
}

function createSteeringWheel(materials) {
	const mount = new THREE.Group();
	mount.position.set(0.3, 1.0, DRIVER_Z);
	mount.lookAt(new THREE.Vector3(0.3 - 0.9, 1.0 + 0.42, DRIVER_Z));
	const wheel = new THREE.Group();
	mount.add(wheel);
	const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.019, 14, 56), materials.leather);
	rim.castShadow = true;
	wheel.add(rim);
	const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.05, 28), materials.interiorFront);
	hub.rotation.x = Math.PI / 2;
	hub.position.z = -0.01;
	wheel.add(hub);
	const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.02, 20), materials.satinChrome);
	emblem.position.z = 0.016;
	wheel.add(emblem);
	// Three spokes: left, right and bottom.
	for (const angle of [0, Math.PI, -Math.PI / 2]) {
		const spoke = roundedBox(0.13, 0.035, 0.018, 0.008, materials.interiorFront);
		spoke.position.set(Math.cos(angle) * 0.11, Math.sin(angle) * 0.11, -0.005);
		spoke.rotation.z = angle;
		wheel.add(spoke);
	}
	const topMarker = roundedBox(0.012, 0.03, 0.04, 0.004, materials.leatherAccent);
	topMarker.position.set(0, 0.18, 0);
	wheel.add(topMarker);
	const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.3, 16), materials.interiorFront);
	column.rotation.x = Math.PI / 2;
	column.position.z = -0.17;
	mount.add(column);
	return { mount, wheel };
}

function createDashboard(materials) {
	const dashboard = new THREE.Group();
	const main = roundedBox(0.42, 0.26, 1.56, 0.08, materials.interiorFront);
	main.position.set(0.66, 0.93, 0);
	dashboard.add(main);
	const upper = roundedBox(0.3, 0.06, 1.5, 0.03, materials.leather);
	upper.position.set(0.72, 1.07, 0);
	dashboard.add(upper);
	const trimStrip = roundedBox(0.02, 0.025, 1.5, 0.008, materials.satinChrome);
	trimStrip.position.set(0.45, 0.93, 0);
	dashboard.add(trimStrip);
	// Instrument binnacle and screens.
	const binnacle = roundedBox(0.16, 0.12, 0.36, 0.04, materials.interiorFront);
	binnacle.position.set(0.5, 1.08, DRIVER_Z);
	dashboard.add(binnacle);
	const cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.1), materials.screen);
	cluster.position.set(0.415, 1.075, DRIVER_Z);
	cluster.rotation.y = -Math.PI / 2;
	cluster.rotation.x = 0.0;
	dashboard.add(cluster);
	const centerScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.17), materials.screen);
	centerScreen.position.set(0.45, 1.0, 0);
	centerScreen.rotation.y = -Math.PI / 2;
	dashboard.add(centerScreen);
	const passengerScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.09), materials.screen);
	passengerScreen.position.set(0.448, 1.0, -DRIVER_Z);
	passengerScreen.rotation.y = -Math.PI / 2;
	dashboard.add(passengerScreen);
	for (const z of [-0.7, 0.7, -0.08, 0.08]) {
		const vent = roundedBox(0.02, 0.05, 0.1, 0.01, materials.satinChrome);
		vent.position.set(0.448, 0.9, z);
		dashboard.add(vent);
	}
	// Centre console running back between the front seats.
	const console = roundedBox(1.0, 0.22, 0.26, 0.05, materials.interiorFront);
	console.position.set(0.0, 0.6, 0);
	console.rotation.z = THREE.MathUtils.degToRad(-6);
	dashboard.add(console);
	const consoleTop = roundedBox(0.7, 0.02, 0.2, 0.008, materials.blackGloss);
	consoleTop.position.set(0.05, 0.715, 0);
	consoleTop.rotation.z = console.rotation.z;
	dashboard.add(consoleTop);
	const gearSelector = roundedBox(0.07, 0.05, 0.04, 0.015, materials.satinChrome);
	gearSelector.position.set(0.12, 0.745, 0);
	dashboard.add(gearSelector);
	return dashboard;
}

function createEngineBay(materials) {
	const bay = new THREE.Group();
	const floor = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 1.5), materials.engine);
	floor.position.set(1.62, 0.5, 0);
	bay.add(floor);
	const block = roundedBox(0.62, 0.3, 0.7, 0.05, materials.engine);
	block.position.set(1.42, 0.68, 0);
	bay.add(block);
	const cover = roundedBox(0.56, 0.08, 0.62, 0.035, materials.engine);
	cover.position.set(1.42, 0.86, 0);
	bay.add(cover);
	for (const side of [1, -1]) {
		const intake = roundedBox(0.5, 0.07, 0.12, 0.03, materials.engineMetal);
		intake.position.set(1.42, 0.86, side * 0.22);
		bay.add(intake);
		const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.12, 20), materials.engineMetal);
		strut.position.set(1.4, 0.84, side * 0.6);
		bay.add(strut);
	}
	const radiator = roundedBox(0.08, 0.3, 1.25, 0.02, materials.engine);
	radiator.position.set(2.15, 0.7, 0);
	bay.add(radiator);
	const cowl = roundedBox(0.08, 0.12, 1.4, 0.02, materials.trim);
	cowl.position.set(0.94, 0.92, 0);
	bay.add(cowl);
	const reservoir = roundedBox(0.16, 0.1, 0.14, 0.03, new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.4 }));
	reservoir.position.set(1.85, 0.8, 0.5);
	bay.add(reservoir);
	const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.5 }));
	cap.position.set(1.85, 0.865, 0.5);
	bay.add(cap);
	const battery = roundedBox(0.2, 0.16, 0.26, 0.02, materials.engine);
	battery.position.set(1.9, 0.72, -0.5);
	bay.add(battery);
	return bay;
}

export function buildInterior(materials) {
	const group = new THREE.Group();
	group.name = 'interior';

	const carpet = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.04, 1.6), materials.interiorFront);
	carpet.position.set(-0.7, 0.4, 0);
	carpet.receiveShadow = true;
	group.add(carpet);
	const cargoFloor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 1.6), materials.interiorFront);
	cargoFloor.position.set(-1.92, 0.72, 0);
	cargoFloor.receiveShadow = true;
	group.add(cargoFloor);

	for (const z of [DRIVER_Z, -DRIVER_Z]) {
		const seat = createSeat(materials);
		seat.position.set(-0.2, 0.47, z);
		group.add(seat);
	}
	for (const z of [-0.42, 0, 0.42]) {
		const seat = createSeat(materials, { width: z === 0 ? 0.36 : 0.46, backHeight: 0.56, bolsters: z !== 0 });
		seat.position.set(-1.14, 0.5, z);
		group.add(seat);
	}
	group.add(createDashboard(materials));
	const steering = createSteeringWheel(materials);
	group.add(steering.mount);
	group.add(createEngineBay(materials));
	return { group, steeringWheel: steering.wheel };
}
