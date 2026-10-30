// Exterior details: lights, intakes, plates, mirrors, handles, roof rails, spoiler and exhausts.
// Flat-ish details are projected onto the body by raycasting so they follow its curvature.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
	projectDecal, castOnto, accelerateRaycasts, rectangleShape, roundedShape,
} from './surfaceBuilder.js';
import { bodyTracks } from './shape.js';

// Rays shot along -X (front) or +X (rear), optionally angled outward to wrap round the corners.
function endFrame(end, wrap = 0) {
	return (u, v) => {
		const direction = new THREE.Vector3(-end, 0, -Math.sign(u) * wrap).normalize();
		const origin = new THREE.Vector3(end * 2.7, v, u).addScaledVector(direction, -3);
		return { origin, direction };
	};
}

export function buildDetails({ materials, shell, hinges, quality = 'high' }) {
	const group = new THREE.Group();
	group.name = 'details';
	const resolution = quality === 'low' ? 0.6 : 1;
	const targets = [];
	shell.traverse((object) => {
		if (object.isMesh) targets.push(object);
	});
	for (const hinge of Object.values(hinges)) {
		hinge.traverse((object) => {
			if (object.isMesh) targets.push(object);
		});
	}
	accelerateRaycasts(targets);

	// Adds decal pieces to the shell or to the hinge of the panel they landed on.
	function placeDecal(options, material, { castShadow = false } = {}) {
		const pieces = projectDecal({
			targets,
			...options,
			uSteps: Math.max(4, Math.round(options.uSteps * resolution)),
			vSteps: Math.max(3, Math.round(options.vSteps * resolution)),
		});
		const meshes = [];
		for (const { object, geometry } of pieces) {
			const partName = object.userData.partName;
			const mesh = new THREE.Mesh(geometry, material);
			mesh.castShadow = castShadow;
			mesh.receiveShadow = true;
			if (partName) {
				const hinge = hinges[partName];
				geometry.applyMatrix4(new THREE.Matrix4().copy(hinge.matrixWorld).invert());
				mesh.userData.partName = partName;
				hinge.add(mesh);
			} else {
				group.add(mesh);
			}
			meshes.push(mesh);
		}
		return meshes;
	}

	// --- Front --------------------------------------------------------------------------------
	for (const side of [1, -1]) {
		const lampFrame = endFrame(1, 0.55);
		// Headlight: wide rounded unit whose inner end dips lower.
		const lampCenter = [side * 0.70, 0.73];
		const lampHalfSize = [0.275, 0.074];
		const lampWarp = (x, y) => [x, y * (1 - 0.25 * side * x / lampHalfSize[0]) + 0.035 * side * x / lampHalfSize[0]];
		placeDecal({
			frame: lampFrame, shape: roundedShape(lampCenter, lampHalfSize, { exponent: 5, warp: lampWarp }),
			uSteps: 64, vSteps: 8, offset: 0.004,
		}, materials.headlightHousing);
		// Four-point LED daytime running lights.
		for (const [xOffset, yOffset] of [[-0.075, -0.024], [0.025, -0.024], [-0.075, 0.03], [0.025, 0.03]]) {
			const x = side * xOffset;
			const [warpedX, warpedY] = lampWarp(x, yOffset);
			placeDecal({
				frame: lampFrame,
				shape: roundedShape([lampCenter[0] + warpedX, lampCenter[1] + warpedY], [0.034, 0.013], { exponent: 4 }),
				uSteps: 24, vSteps: 3, offset: 0.007,
			}, materials.drl);
		}
		// Main projector lens towards the outer end.
		const lensCenter = [lampCenter[0] + side * 0.165, lampCenter[1] + 0.022];
		placeDecal({
			frame: lampFrame, shape: roundedShape(lensCenter, [0.045, 0.026], { exponent: 3 }),
			uSteps: 24, vSteps: 3, offset: 0.006,
		}, materials.headlightLens);

		// Side air intakes, tapering towards the outside.
		const intakeHalf = [0.16, 0.12];
		placeDecal({
			frame: endFrame(1, 0.25),
			shape: roundedShape([side * 0.665, 0.505], intakeHalf, {
				exponent: 4,
				warp: (x, y) => [x, y * (1 - 0.3 * side * x / intakeHalf[0]) - 0.02 * side * x / intakeHalf[0]],
			}),
			uSteps: 48, vSteps: 8, offset: 0.004,
		}, materials.grille);
	}
	placeDecal({
		frame: endFrame(1), shape: roundedShape([0, 0.49], [0.4, 0.105], { exponent: 6 }),
		uSteps: 72, vSteps: 8, offset: 0.004,
	}, materials.grille);
	placeDecal({
		frame: endFrame(1), shape: roundedShape([0, 0.638], [0.38, 0.022], { exponent: 8 }),
		uSteps: 64, vSteps: 3, offset: 0.004,
	}, materials.grille);
	placeDecal({
		frame: endFrame(1), shape: rectangleShape([0.26, -0.26], [0.455, 0.565]), uSteps: 8, vSteps: 3, offset: 0.008, uvMode: 'grid',
	}, materials.plate);

	// --- Rear ---------------------------------------------------------------------------------
	placeDecal({
		frame: endFrame(-1), shape: rectangleShape([-0.8, 0.8], [0.885, 0.915]), uSteps: 60, vSteps: 2, offset: 0.004,
	}, materials.taillightBar);
	for (const side of [1, -1]) {
		const clusterHalf = [0.24, 0.07];
		placeDecal({
			frame: endFrame(-1, 0.6),
			shape: roundedShape([side * 0.74, 0.9], clusterHalf, {
				exponent: 5,
				warp: (x, y) => [x, y * (1 - 0.35 * side * -x / clusterHalf[0]) + 0.01 * side * x / clusterHalf[0]],
			}),
			uSteps: 48, vSteps: 6, offset: 0.0045,
		}, materials.taillight);
		placeDecal({
			frame: endFrame(-1, 0.3), shape: rectangleShape(side > 0 ? [0.6, 0.86] : [-0.86, -0.6], [0.505, 0.525]),
			uSteps: 10, vSteps: 2, offset: 0.004,
		}, materials.reflector);
	}
	placeDecal({
		frame: endFrame(-1), shape: rectangleShape([-0.26, 0.26], [0.67, 0.78]), uSteps: 8, vSteps: 3, offset: 0.006, uvMode: 'grid',
	}, materials.plate);

	// Twin exhaust tips on each side of the diffuser.
	for (const side of [1, -1]) {
		for (const offset of [0.47, 0.6]) {
			const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.16, 24, 1, true), materials.exhaust);
			tip.rotation.z = Math.PI / 2;
			tip.position.set(-2.43, 0.44, side * offset);
			const inner = new THREE.Mesh(new THREE.CircleGeometry(0.038, 20), materials.exhaustInner);
			inner.rotation.y = -Math.PI / 2;
			inner.position.set(-2.47, 0.44, side * offset);
			group.add(tip, inner);
		}
	}

	// --- Roof ---------------------------------------------------------------------------------
	for (const side of [1, -1]) {
		const railPoints = [];
		for (let step = 0; step <= 16; step++) {
			const x = THREE.MathUtils.lerp(-1.48, -0.12, step / 16);
			const hit = castOnto(targets, new THREE.Vector3(x, 3, side * 0.58), new THREE.Vector3(0, -1, 0));
			if (hit) railPoints.push(hit.point.clone().add(new THREE.Vector3(0, 0.04, 0)));
		}
		if (railPoints.length > 4) {
			const curve = new THREE.CatmullRomCurve3(railPoints);
			const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.013, 10, false), materials.satinChrome);
			rail.castShadow = true;
			group.add(rail);
			for (const point of [railPoints[0], railPoints[railPoints.length - 1]]) {
				const foot = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.05, 0.03, 2, 0.01), materials.trim);
				foot.position.copy(point).add(new THREE.Vector3(0, -0.02, 0));
				group.add(foot);
			}
		}
	}
	const finHit = castOnto(targets, new THREE.Vector3(-1.42, 3, 0), new THREE.Vector3(0, -1, 0));
	if (finHit) {
		const finShape = new THREE.Shape();
		finShape.moveTo(0, 0);
		finShape.lineTo(-0.16, 0);
		finShape.quadraticCurveTo(-0.13, 0.055, -0.03, 0.06);
		finShape.quadraticCurveTo(0, 0.02, 0, 0);
		const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, {
			depth: 0.04, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.01, bevelSegments: 3,
		}), materials.blackGloss);
		fin.geometry.translate(0.08, 0, -0.02);
		fin.position.copy(finHit.point).add(new THREE.Vector3(0, -0.005, 0));
		group.add(fin);
	}

	// Roof spoiler with a third brake light, mounted on the tailgate.
	{
		const tailgate = hinges.tailgate;
		const spoiler = new THREE.Group();
		const topHit = castOnto(targets, new THREE.Vector3(-1.66, 3, 0), new THREE.Vector3(0, -1, 0));
		const baseY = topHit ? topHit.point.y : 1.62;
		const wing = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.03, 1.3, 3, 0.012), materials.paint);
		wing.castShadow = true;
		wing.position.set(-0.13, 0, 0);
		spoiler.add(wing);
		const brakeLight = new THREE.Mesh(new RoundedBoxGeometry(0.01, 0.012, 0.5, 2, 0.004), materials.taillightBar);
		brakeLight.position.set(-0.275, -0.012, 0);
		spoiler.add(brakeLight);
		spoiler.position.set(-1.6, baseY + 0.012, 0);
		spoiler.rotation.z = THREE.MathUtils.degToRad(9);
		spoiler.updateMatrix();
		spoiler.applyMatrix4(new THREE.Matrix4().copy(tailgate.matrixWorld).invert());
		spoiler.traverse((object) => {
			object.userData.partName = 'tailgate';
		});
		tailgate.add(spoiler);
	}

	// --- Sides --------------------------------------------------------------------------------
	for (const side of [1, -1]) {
		// Door handles.
		for (const [doorName, handleX] of [[side > 0 ? 'frontRightDoor' : 'frontLeftDoor', 0.05], [side > 0 ? 'rearRightDoor' : 'rearLeftDoor', -0.93]]) {
			const hinge = hinges[doorName];
			const hit = castOnto(targets, new THREE.Vector3(handleX, 0.99, side * 2), new THREE.Vector3(0, 0, -side));
			if (!hit) continue;
			const handle = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.032, 0.026, 3, 0.012), materials.paint);
			handle.position.copy(hit.point).addScaledVector(hit.normal, 0.008);
			handle.lookAt(handle.position.clone().add(hit.normal));
			handle.rotateY(Math.PI / 2);
			handle.applyMatrix4(new THREE.Matrix4().copy(hinge.matrixWorld).invert());
			handle.userData.partName = doorName;
			handle.castShadow = true;
			hinge.add(handle);
		}

		// Side mirror on the front door.
		const doorName = side > 0 ? 'frontRightDoor' : 'frontLeftDoor';
		const hinge = hinges[doorName];
		const mirror = new THREE.Group();
		const beltHeight = bodyTracks.belt(0.66);
		const housing = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), materials.paint);
		housing.scale.set(0.07, 0.072, 0.125);
		housing.castShadow = true;
		mirror.add(housing);
		const glass = new THREE.Mesh(new THREE.CircleGeometry(1, 32), materials.mirror);
		glass.scale.set(0.12, 0.068, 1);
		glass.rotation.y = -Math.PI / 2;
		glass.position.x = -0.03;
		mirror.add(glass);
		const arm = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.05, 0.12, 2, 0.015), materials.trim);
		arm.position.set(0.0, -0.045, -side * 0.12);
		mirror.add(arm);
		mirror.position.set(0.63, beltHeight + 0.085, side * 1.0);
		mirror.updateMatrix();
		mirror.applyMatrix4(new THREE.Matrix4().copy(hinge.matrixWorld).invert());
		mirror.traverse((object) => {
			object.userData.partName = doorName;
		});
		hinge.add(mirror);
	}

	// --- Lights -------------------------------------------------------------------------------
	const headlights = [];
	for (const side of [1, -1]) {
		const spot = new THREE.SpotLight(0xf2f5ff, 0, 40, 0.62, 1, 1.6);
		spot.userData.baseIntensity = 70;
		spot.position.set(2.42, 0.76, side * 0.72);
		spot.target.position.set(8, -1.5, side * 1.4);
		spot.castShadow = false;
		group.add(spot, spot.target);
		headlights.push(spot);
	}
	const tailGlow = new THREE.PointLight(0xff1a1a, 0, 2.6, 2);
	tailGlow.userData.baseIntensity = 3;
	tailGlow.position.set(-2.8, 0.85, 0);
	group.add(tailGlow);

	return { group, headlights, taillightLights: [tailGlow] };
}
