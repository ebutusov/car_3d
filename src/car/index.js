// Public car API: assembles body, wheels, interior and details and animates the moving parts.

import * as THREE from 'three';
import { WHEEL } from './shape.js';
import { createCarMaterials } from './materials.js';
import { buildBody } from './body.js';
import { buildWheels } from './wheels.js';
import { buildInterior } from './interior.js';
import { buildDetails } from './details.js';

export const PART_NAMES = ['frontLeftDoor', 'frontRightDoor', 'rearLeftDoor', 'rearRightDoor', 'hood', 'tailgate'];
export const MAX_STEER_ANGLE = THREE.MathUtils.degToRad(34);
const STEERING_RATIO = 14;
const WHEELBASE = WHEEL.frontAxleX - WHEEL.rearAxleX;
const OPEN_SPEED = 1.1;

// Soft ambient-occlusion blob that grounds the car whatever the sun angle.
function createContactShadow() {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 128;
	const context = canvas.getContext('2d');
	context.filter = 'blur(14px)';
	context.fillStyle = '#fff';
	context.beginPath();
	context.roundRect(30, 26, 196, 76, 30);
	context.fill();
	const texture = new THREE.CanvasTexture(canvas);
	const shadow = new THREE.Mesh(
		new THREE.PlaneGeometry(5.6, 2.6),
		new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: texture, transparent: true, opacity: 0.72, depthWrite: false }),
	);
	shadow.rotation.x = -Math.PI / 2;
	shadow.position.y = 0.012;
	shadow.renderOrder = -1;
	return shadow;
}

function easeInOut(t) {
	return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function createCar({ quality = 'high' } = {}) {
	const materials = createCarMaterials();
	const group = new THREE.Group();
	group.name = 'car';

	group.add(createContactShadow());
	const { body, shell, hinges } = buildBody(materials, { quality });
	group.add(body);
	const { group: wheelGroup, wheels } = buildWheels(materials, { quality });
	group.add(wheelGroup);
	const interior = buildInterior(materials);
	group.add(interior.group);
	group.updateMatrixWorld(true);
	const details = buildDetails({ materials, shell, hinges, quality });
	group.add(details.group);

	let steerAngle = 0;
	let steerTarget = 0;
	let wheelSpeed = 0;
	let lightMode = 'auto';
	let nightFactor = 0;
	// Emissive values are tuned for exposure 1; the environment drops exposure to ~0.1 at noon.
	let emissiveScale = 1;

	const interactiveObjects = [];
	for (const hinge of Object.values(hinges)) {
		hinge.traverse((object) => {
			if (object.isMesh) interactiveObjects.push(object);
		});
	}

	function applyHinge(hinge) {
		const { axis, openAngle, openAmount } = hinge.userData;
		hinge.quaternion.setFromAxisAngle(axis, openAngle * easeInOut(openAmount));
	}

	function applySteering() {
		// Ackermann geometry: the inner wheel turns more sharply than the outer one.
		for (const wheel of wheels) {
			if (!wheel.isFront) continue;
			if (Math.abs(steerAngle) < 1e-4) {
				wheel.steer.rotation.y = 0;
				continue;
			}
			const turnRadius = WHEELBASE / Math.tan(Math.abs(steerAngle));
			const isInner = (steerAngle > 0 && wheel.side < 0) || (steerAngle < 0 && wheel.side > 0);
			const offset = isInner ? -WHEEL.trackHalf : WHEEL.trackHalf;
			wheel.steer.rotation.y = Math.sign(steerAngle) * Math.atan(WHEELBASE / (turnRadius + offset));
		}
		interior.steeringWheel.rotation.z = steerAngle * STEERING_RATIO;
	}

	function applyLights() {
		const on = lightMode === 'on' || (lightMode === 'auto' && nightFactor > 0.35);
		const strength = on ? 1 : 0;
		materials.headlightLens.emissiveIntensity = strength * 4 * emissiveScale;
		materials.drl.emissiveIntensity = (1.2 + strength * 5) * emissiveScale;
		materials.taillight.emissiveIntensity = (0.12 + strength * 2.2) * emissiveScale;
		materials.taillightBar.emissiveIntensity = (0.08 + strength * 3) * emissiveScale;
		materials.screen.emissiveIntensity = 0.8 * emissiveScale;
		for (const light of details.headlights) light.intensity = strength * light.userData.baseIntensity;
		for (const light of details.taillightLights) light.intensity = strength * light.userData.baseIntensity;
	}

	const api = {
		group,
		materials,
		interactiveObjects,
		partNames: PART_NAMES,
		hinges,
		setOpen(name, open, immediate = false) {
			const hinge = hinges[name];
			if (!hinge) throw new Error(`Unknown part ${name}`);
			hinge.userData.target = open ? 1 : 0;
			if (immediate) {
				hinge.userData.openAmount = hinge.userData.target;
				applyHinge(hinge);
			}
		},
		toggle(name) {
			api.setOpen(name, !api.isOpen(name));
			return api.isOpen(name);
		},
		isOpen(name) {
			return hinges[name].userData.target === 1;
		},
		getOpenAmount(name) {
			return hinges[name].userData.openAmount;
		},
		setSteer(angle, immediate = true) {
			steerTarget = THREE.MathUtils.clamp(angle, -MAX_STEER_ANGLE, MAX_STEER_ANGLE);
			if (immediate) {
				steerAngle = steerTarget;
				applySteering();
			}
		},
		getSteer() {
			return steerAngle;
		},
		// Rolling speed in metres per second (wheels spin accordingly).
		setWheelSpeed(speed) {
			wheelSpeed = speed;
		},
		getWheelSpeed() {
			return wheelSpeed;
		},
		setPaint(color) {
			materials.paint.color.set(color);
			materials.paintDoubleSided.color.copy(materials.paint.color);
			details.onPaintChange?.(materials.paint.color);
		},
		getPaint() {
			return '#' + materials.paint.color.getHexString();
		},
		setPaintFinish({ metalness, roughness, clearcoatRoughness }) {
			for (const material of [materials.paint, materials.paintDoubleSided]) {
				if (metalness !== undefined) material.metalness = metalness;
				if (roughness !== undefined) material.roughness = roughness;
				if (clearcoatRoughness !== undefined) material.clearcoatRoughness = clearcoatRoughness;
			}
		},
		// 'auto' follows the environment's night factor; 'on' / 'off' override it.
		setLights(mode) {
			lightMode = mode;
			applyLights();
		},
		getLights() {
			return lightMode;
		},
		areLightsOn() {
			return lightMode === 'on' || (lightMode === 'auto' && nightFactor > 0.35);
		},
		setNightFactor(value) {
			nightFactor = value;
			applyLights();
		},
		// Keeps emissive parts readable whatever exposure the environment chooses.
		setExposure(exposure) {
			const scale = 1 / THREE.MathUtils.clamp(exposure, 0.05, 2);
			if (Math.abs(scale - emissiveScale) < 1e-3) return;
			emissiveScale = scale;
			applyLights();
		},
		// Finds which opening part an intersected object belongs to.
		partFromObject(object) {
			let current = object;
			while (current) {
				if (current.userData.partName) return current.userData.partName;
				current = current.parent;
			}
			return null;
		},
		update(deltaSeconds) {
			for (const hinge of Object.values(hinges)) {
				const data = hinge.userData;
				if (data.openAmount === data.target) continue;
				const step = deltaSeconds * OPEN_SPEED;
				data.openAmount = data.target > data.openAmount
					? Math.min(data.target, data.openAmount + step)
					: Math.max(data.target, data.openAmount - step);
				applyHinge(hinge);
			}
			if (steerAngle !== steerTarget) {
				const step = deltaSeconds * 1.5;
				steerAngle += THREE.MathUtils.clamp(steerTarget - steerAngle, -step, step);
				applySteering();
			}
			if (wheelSpeed !== 0) {
				const angularSpeed = wheelSpeed / WHEEL.radius;
				for (const wheel of wheels) wheel.spin.rotation.z += wheel.spinSign * angularSpeed * deltaSeconds;
			}
		},
	};
	applyLights();
	return api;
}
