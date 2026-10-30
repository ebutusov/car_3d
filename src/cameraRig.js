// Camera navigation: an orbit mode around the car (mouse + WASD panning) and a free
// walk/fly mode (WASD + mouse look, pointer lock when available, drag-to-look otherwise).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MIN_CAMERA_HEIGHT = 0.12;
const WALK_SPEED = 3.2;
const RUN_MULTIPLIER = 3;
const LOOK_SENSITIVITY = 0.0025;

function easeInOutCubic(t) {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function createCameraRig({ camera, domElement, keyboard }) {
	const orbit = new OrbitControls(camera, domElement);
	orbit.enableDamping = true;
	orbit.dampingFactor = 0.08;
	orbit.minDistance = 1.2;
	orbit.maxDistance = 40;
	orbit.maxPolarAngle = THREE.MathUtils.degToRad(88);
	orbit.target.set(0, 0.8, 0);
	orbit.screenSpacePanning = false;

	let mode = 'orbit';
	let yaw = 0;
	let pitch = 0;
	let dragging = false;
	let lastPointer = null;
	let transition = null;
	const listeners = new Set();

	function emit() {
		for (const listener of listeners) listener(mode);
	}

	function syncAnglesFromCamera() {
		const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
		yaw = euler.y;
		pitch = euler.x;
	}

	function applyLook() {
		camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
	}

	function setMode(nextMode) {
		if (nextMode === mode) return;
		mode = nextMode;
		transition = null;
		if (mode === 'walk') {
			orbit.enabled = false;
			syncAnglesFromCamera();
		} else {
			if (document.pointerLockElement === domElement) document.exitPointerLock();
			orbit.enabled = true;
			// Re-target the orbit a few metres ahead of where the walker is looking.
			const forward = new THREE.Vector3();
			camera.getWorldDirection(forward);
			const distance = THREE.MathUtils.clamp(camera.position.length(), 3, 8);
			orbit.target.copy(camera.position).addScaledVector(forward, distance);
			orbit.target.y = THREE.MathUtils.clamp(orbit.target.y, 0.3, 2.5);
			orbit.update();
		}
		emit();
	}

	// Look handling for walk mode.
	domElement.addEventListener('pointerdown', (event) => {
		if (mode !== 'walk' || event.button !== 0) return;
		dragging = true;
		lastPointer = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
	});
	window.addEventListener('pointerup', (event) => {
		if (mode === 'walk' && dragging && lastPointer && document.pointerLockElement !== domElement) {
			const moved = Math.hypot(event.clientX - lastPointer.startX, event.clientY - lastPointer.startY);
			// A click without dragging captures the mouse for FPS-style look (where supported).
			if (moved < 4 && domElement.requestPointerLock) {
				try {
					const request = domElement.requestPointerLock();
					if (request && request.catch) request.catch(() => {});
				} catch {
					// Pointer lock is optional; drag-to-look keeps working.
				}
			}
		}
		dragging = false;
		lastPointer = null;
	});
	window.addEventListener('pointermove', (event) => {
		if (mode !== 'walk') return;
		let deltaX = 0;
		let deltaY = 0;
		if (document.pointerLockElement === domElement) {
			deltaX = event.movementX;
			deltaY = event.movementY;
		} else if (dragging && lastPointer) {
			deltaX = event.clientX - lastPointer.x;
			deltaY = event.clientY - lastPointer.y;
			lastPointer.x = event.clientX;
			lastPointer.y = event.clientY;
		} else {
			return;
		}
		yaw -= deltaX * LOOK_SENSITIVITY;
		pitch = THREE.MathUtils.clamp(pitch - deltaY * LOOK_SENSITIVITY, -1.45, 1.45);
		transition = null;
		applyLook();
	});
	domElement.addEventListener('wheel', (event) => {
		if (mode !== 'walk') return;
		event.preventDefault();
		const forward = new THREE.Vector3();
		camera.getWorldDirection(forward);
		camera.position.addScaledVector(forward, -Math.sign(event.deltaY) * 0.4);
	}, { passive: false });

	const forward = new THREE.Vector3();
	const right = new THREE.Vector3();
	const movement = new THREE.Vector3();
	const up = new THREE.Vector3(0, 1, 0);

	function keyboardMovement(deltaSeconds) {
		movement.set(0, 0, 0);
		camera.getWorldDirection(forward);
		forward.y = 0;
		if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
		forward.normalize();
		right.crossVectors(forward, up).normalize();
		if (keyboard.isDown('KeyW')) movement.add(forward);
		if (keyboard.isDown('KeyS')) movement.sub(forward);
		if (keyboard.isDown('KeyD')) movement.add(right);
		if (keyboard.isDown('KeyA')) movement.sub(right);
		const vertical = (keyboard.isDown('KeyE') ? 1 : 0) - (keyboard.isDown('KeyQ') ? 1 : 0);
		const speed = WALK_SPEED * (keyboard.isDown('ShiftLeft') || keyboard.isDown('ShiftRight') ? RUN_MULTIPLIER : 1);
		if (movement.lengthSq() > 0) movement.normalize().multiplyScalar(speed * deltaSeconds);
		return { movement, vertical: vertical * speed * deltaSeconds };
	}

	return {
		orbit,
		getMode: () => mode,
		setMode,
		onModeChange(listener) {
			listeners.add(listener);
		},
		// Smoothly flies to a viewpoint. In orbit mode the camera looks at target; in walk mode it
		// arrives facing target.
		flyTo({ position, target, mode: nextMode = 'orbit', duration = 1.2 }) {
			setMode(nextMode);
			transition = {
				fromPosition: camera.position.clone(),
				toPosition: new THREE.Vector3(...position),
				fromTarget: mode === 'orbit' ? orbit.target.clone() : camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3())),
				toTarget: new THREE.Vector3(...target),
				elapsed: 0,
				duration,
			};
		},
		isTransitioning: () => transition !== null,
		update(deltaSeconds) {
			if (transition) {
				transition.elapsed += deltaSeconds;
				const t = easeInOutCubic(Math.min(1, transition.elapsed / transition.duration));
				camera.position.lerpVectors(transition.fromPosition, transition.toPosition, t);
				const lookTarget = new THREE.Vector3().lerpVectors(transition.fromTarget, transition.toTarget, t);
				if (mode === 'orbit') {
					orbit.target.copy(lookTarget);
				} else {
					camera.lookAt(lookTarget);
					syncAnglesFromCamera();
				}
				if (t >= 1) transition = null;
			}
			const { movement: step, vertical } = keyboardMovement(deltaSeconds);
			if (step.lengthSq() > 0 || vertical !== 0) transition = null;
			if (mode === 'walk') {
				camera.position.add(step);
				camera.position.y += vertical;
			} else {
				// WASD pans the orbit target across the ground; Q/E dolly in and out.
				camera.position.add(step);
				orbit.target.add(step);
				if (vertical !== 0) {
					const offset = camera.position.clone().sub(orbit.target);
					const distance = THREE.MathUtils.clamp(offset.length() * (1 - vertical * 0.5), orbit.minDistance, orbit.maxDistance);
					camera.position.copy(orbit.target).addScaledVector(offset.normalize(), distance);
				}
				orbit.update();
			}
			camera.position.y = Math.max(camera.position.y, MIN_CAMERA_HEIGHT);
		},
	};
}
