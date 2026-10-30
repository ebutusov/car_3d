// 21" five-twin-spoke wheels with tyres, brake discs and calipers.
// Hierarchy per wheel: mount (fixed position) → steer (Y rotation, front only) → caliper + spin (axle rotation).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WHEEL } from './shape.js';

const RIM_RADIUS = 0.267;
const TIRE_HALF_WIDTH = 0.142;

// Lathe profiles are revolved around Y and then turned so the axle is the Z axis (+Z = outer face).
function latheAroundZ(points, segments) {
	const geometry = new THREE.LatheGeometry(points.map(([radius, offset]) => new THREE.Vector2(radius, offset)), segments);
	geometry.rotateX(Math.PI / 2);
	return geometry;
}

function createTireGeometries(segments) {
	const radius = WHEEL.radius;
	const sidewallOuter = [
		[RIM_RADIUS + 0.004, TIRE_HALF_WIDTH - 0.018], [RIM_RADIUS + 0.03, TIRE_HALF_WIDTH - 0.004],
		[radius - 0.05, TIRE_HALF_WIDTH], [radius - 0.022, TIRE_HALF_WIDTH - 0.008],
		[radius - 0.006, TIRE_HALF_WIDTH - 0.03],
	];
	const tread = [];
	for (let step = 0; step <= 8; step++) {
		const offset = THREE.MathUtils.lerp(TIRE_HALF_WIDTH - 0.03, -(TIRE_HALF_WIDTH - 0.03), step / 8);
		tread.push([radius - 0.004 * Math.pow(Math.abs(offset) / TIRE_HALF_WIDTH, 2), offset]);
	}
	const sidewallInner = sidewallOuter.map(([r, offset]) => [r, -offset]).reverse();
	// Lathe winds by profile order; going from outer face over the tread to the inner face keeps normals outward.
	const sidewallProfile = [...sidewallOuter.slice().reverse()];
	return {
		sidewalls: mergeGeometries([
			latheAroundZ(sidewallProfile.slice().reverse(), segments),
			latheAroundZ(sidewallInner.slice().reverse(), segments),
		]),
		tread: latheAroundZ(tread.slice().reverse(), segments),
	};
}

function createSpokeGeometry() {
	// One spoke of a twin pair, extruded towards +Z and dished so the hub sits further inward.
	const shape = new THREE.Shape();
	shape.moveTo(0.075, -0.016);
	shape.lineTo(RIM_RADIUS - 0.012, -0.024);
	shape.lineTo(RIM_RADIUS - 0.012, 0.012);
	shape.lineTo(0.075, 0.012);
	shape.closePath();
	const geometry = new THREE.ExtrudeGeometry(shape, {
		depth: 0.026, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2, curveSegments: 4,
	});
	const position = geometry.attributes.position;
	for (let index = 0; index < position.count; index++) {
		const radial = position.getX(index);
		const dish = THREE.MathUtils.mapLinear(radial, 0.075, RIM_RADIUS, -0.035, 0.0);
		position.setZ(index, position.getZ(index) + dish + 0.07);
	}
	geometry.computeVertexNormals();
	return geometry;
}

function createRimGeometry(segments) {
	const parts = [];
	// Barrel and outer lip.
	parts.push(latheAroundZ([
		[RIM_RADIUS - 0.008, -0.13], [RIM_RADIUS - 0.012, -0.10], [RIM_RADIUS - 0.014, 0.08],
		[RIM_RADIUS - 0.004, 0.10], [RIM_RADIUS + 0.012, 0.112], [RIM_RADIUS + 0.014, 0.12],
		[RIM_RADIUS + 0.004, 0.124],
	].reverse(), segments));
	const spoke = createSpokeGeometry();
	for (let index = 0; index < 5; index++) {
		for (const offset of [-0.13, 0.13]) {
			const copy = spoke.clone();
			copy.rotateZ((index / 5) * Math.PI * 2 + offset);
			parts.push(copy);
		}
	}
	// Hub.
	parts.push(latheAroundZ([[0.001, 0.068], [0.06, 0.066], [0.085, 0.05], [0.09, 0.02]].reverse(), 32));
	return mergeGeometries(parts.map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry));
}

function createBrakeGeometries() {
	const disc = latheAroundZ([[0.11, 0.017], [0.205, 0.017], [0.205, -0.017], [0.11, -0.017]].reverse(), 48);
	const hat = latheAroundZ([[0.02, 0.035], [0.11, 0.035], [0.11, -0.01]].reverse(), 32);
	const caliperShape = new THREE.Shape();
	const innerRadius = 0.15;
	const outerRadius = 0.235;
	const sweep = 0.75;
	caliperShape.absarc(0, 0, outerRadius, -sweep / 2, sweep / 2, false);
	caliperShape.absarc(0, 0, innerRadius, sweep / 2, -sweep / 2, true);
	const caliper = new THREE.ExtrudeGeometry(caliperShape, {
		depth: 0.07, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 16,
	});
	caliper.translate(0, 0, -0.035);
	return { disc: mergeGeometries([disc, hat]), caliper };
}

export function buildWheels(materials, { quality = 'high' } = {}) {
	const segments = quality === 'low' ? 48 : 96;
	const tire = createTireGeometries(segments);
	const rim = createRimGeometry(segments);
	const lugs = mergeGeometries(Array.from({ length: 5 }, (_, index) => {
		const lug = new THREE.CylinderGeometry(0.009, 0.009, 0.014, 8);
		lug.rotateX(Math.PI / 2);
		const angle = (index / 5) * Math.PI * 2 + Math.PI / 5;
		lug.translate(Math.cos(angle) * 0.05, Math.sin(angle) * 0.05, 0.074);
		return lug;
	}));
	const brake = createBrakeGeometries();

	const wheels = [];
	const group = new THREE.Group();
	group.name = 'wheels';
	for (const [axleX, isFront] of [[WHEEL.frontAxleX, true], [WHEEL.rearAxleX, false]]) {
		for (const side of [1, -1]) {
			const mount = new THREE.Group();
			mount.position.set(axleX, WHEEL.radius, side * WHEEL.trackHalf);
			const steer = new THREE.Group();
			mount.add(steer);
			// Left wheels are turned around so their outer face (+Z local) points to -Z.
			const facing = new THREE.Group();
			facing.rotation.y = side > 0 ? 0 : Math.PI;
			steer.add(facing);
			const spin = new THREE.Group();
			facing.add(spin);

			const addMesh = (geometry, material, parent = spin) => {
				const mesh = new THREE.Mesh(geometry, material);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				parent.add(mesh);
				return mesh;
			};
			addMesh(tire.sidewalls, materials.tire);
			addMesh(tire.tread, materials.tread);
			addMesh(rim, materials.rim);
			addMesh(lugs, materials.rimDark);
			const disc = addMesh(brake.disc, materials.brakeDisc);
			disc.position.z = -0.02;
			// The caliper does not spin; it sits at the trailing edge of the disc.
			const caliper = addMesh(brake.caliper, materials.caliper, facing);
			caliper.position.z = -0.02;
			caliper.rotation.z = side > 0 ? Math.PI * 0.85 : Math.PI * 0.15;

			group.add(mount);
			wheels.push({ mount, steer, spin, side, isFront, spinSign: side > 0 ? -1 : 1 });
		}
	}
	return { group, wheels };
}
