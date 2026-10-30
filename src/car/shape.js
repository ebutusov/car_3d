// Parametric body surface of the car.
//
// Coordinate convention: Y up, metres, car faces +X, origin on the ground under the car centre.
// The body is a loft of cross-sections along X. Each half cross-section is parametrised by
// s ∈ [0, 1] (0 = bottom centre, 1 = roof centre). The full loop uses sigma ∈ [0, 2]:
// sigma ≤ 1 is the +Z (right) half, sigma > 1 the mirrored -Z (left) half.
// Both ends of the loft are closed by a rounded fillet ring and a flat end face.

import * as THREE from 'three';

export const X_FRONT = 2.33;
export const X_REAR = -2.40;
export const END_FILLET_RADIUS = 0.1;

export const WHEEL = {
	frontAxleX: 1.40,
	rearAxleX: -1.50,
	radius: 0.385,
	trackHalf: 0.835,
	archCenterY: 0.305,
	archRadius: 0.49,
};

// Fixed s values of the section keys; panels and material regions are aligned to these.
export const S_KEYS = {
	floorEdge: 0.10,
	rocker: 0.17,
	claddingTop: 0.20,
	shoulderCrease: 0.56,
	shoulderTop: 0.62,
	glassBase: 0.665,
	rail: 0.84,
	roofEdge: 0.90,
};

// Monotone cubic (Fritsch–Carlson) interpolation through [x, value] keys.
function createTrack(keys) {
	const positions = keys.map((key) => key[0]);
	const values = keys.map((key) => key[1]);
	const count = keys.length;
	const secants = [];
	for (let index = 0; index < count - 1; index++) {
		secants.push((values[index + 1] - values[index]) / (positions[index + 1] - positions[index]));
	}
	const tangents = new Array(count);
	tangents[0] = secants[0];
	tangents[count - 1] = secants[count - 2];
	for (let index = 1; index < count - 1; index++) {
		const before = secants[index - 1];
		const after = secants[index];
		tangents[index] = before * after <= 0 ? 0 : (before + after) / 2;
	}
	for (let index = 0; index < count - 1; index++) {
		if (secants[index] === 0) {
			tangents[index] = 0;
			tangents[index + 1] = 0;
			continue;
		}
		const alpha = tangents[index] / secants[index];
		const beta = tangents[index + 1] / secants[index];
		const magnitude = alpha * alpha + beta * beta;
		if (magnitude > 9) {
			const scale = 3 / Math.sqrt(magnitude);
			tangents[index] = scale * alpha * secants[index];
			tangents[index + 1] = scale * beta * secants[index];
		}
	}
	return (x) => {
		if (x <= positions[0]) return values[0];
		if (x >= positions[count - 1]) return values[count - 1];
		let segment = 0;
		while (x > positions[segment + 1]) segment++;
		const width = positions[segment + 1] - positions[segment];
		const t = (x - positions[segment]) / width;
		const t2 = t * t;
		const t3 = t2 * t;
		return (2 * t3 - 3 * t2 + 1) * values[segment]
			+ (t3 - 2 * t2 + t) * width * tangents[segment]
			+ (-2 * t3 + 3 * t2) * values[segment + 1]
			+ (t3 - t2) * width * tangents[segment + 1];
	};
}

const floorTrack = createTrack([
	[-2.40, 0.42], [-2.15, 0.36], [-1.9, 0.31], [0, 0.30], [1.9, 0.29], [2.15, 0.30], [2.33, 0.33],
]);
const widthTrack = createTrack([
	[-2.40, 0.86], [-2.30, 0.925], [-2.15, 0.958], [-1.95, 0.985], [-1.5, 0.995], [-1.05, 0.978],
	[-0.5, 0.966], [0.5, 0.966], [0.95, 0.975], [1.4, 0.986], [1.85, 0.97], [2.1, 0.935], [2.25, 0.89], [2.33, 0.84],
]);
const beltTrack = createTrack([
	[-2.40, 1.04], [-2.25, 1.11], [-1.9, 1.14], [-1.0, 1.125], [0, 1.105], [0.8, 1.075],
	[1.2, 1.04], [1.8, 1.0], [2.1, 0.955], [2.25, 0.91], [2.33, 0.86],
]);
const glassBaseWidthTrack = createTrack([
	[-2.40, 0.70], [-2.2, 0.80], [-1.9, 0.84], [-1.0, 0.85], [0.5, 0.85], [0.85, 0.83],
	[1.0, 0.80], [1.6, 0.77], [2.33, 0.70],
]);
const railWidthTrack = createTrack([
	[-2.40, 0.66], [-2.2, 0.66], [-1.9, 0.69], [-1.0, 0.72], [-0.1, 0.72], [0.4, 0.75],
	[0.85, 0.80], [1.0, 0.77], [1.6, 0.74], [2.1, 0.70], [2.33, 0.62],
]);
const railHeightTrack = createTrack([
	[-2.40, 1.06], [-2.30, 1.12], [-2.15, 1.22], [-1.95, 1.36], [-1.75, 1.46], [-1.55, 1.525],
	[-1.0, 1.595], [-0.3, 1.635], [-0.12, 1.625], [0.1, 1.525], [0.4, 1.35], [0.7, 1.17],
	[0.86, 1.07], [0.95, 1.025], [1.3, 0.985], [1.8, 0.945], [2.1, 0.905], [2.25, 0.88], [2.33, 0.875],
]);
const crownTrack = createTrack([
	[-2.40, 0.03], [-2.2, 0.05], [-1.6, 0.065], [-0.12, 0.065], [0.86, 0.045], [1.2, 0.03], [2.33, 0.03],
]);

function smoothMax(a, b, smoothing) {
	const blend = THREE.MathUtils.clamp(0.5 + 0.5 * (b - a) / smoothing, 0, 1);
	return THREE.MathUtils.lerp(a, b, blend) + smoothing * blend * (1 - blend);
}

function archHeight(x, axleX) {
	const offset = Math.abs(x - axleX);
	const { archCenterY, archRadius } = WHEEL;
	if (offset < archRadius) return archCenterY + Math.sqrt(archRadius * archRadius - offset * offset);
	return archCenterY - (offset - archRadius) * 2;
}

export function lowerEdgeHeight(x) {
	let height = floorTrack(x);
	height = smoothMax(height, archHeight(x, WHEEL.frontAxleX), 0.04);
	height = smoothMax(height, archHeight(x, WHEEL.rearAxleX), 0.04);
	return height;
}

export const bodyTracks = {
	floor: floorTrack,
	width: widthTrack,
	belt: beltTrack,
	glassBaseWidth: glassBaseWidthTrack,
	railWidth: railWidthTrack,
	railHeight: railHeightTrack,
	crown: crownTrack,
};

// Section keys at a station: [s, z, y, tension]. Tension < 1 sharpens the curve at that key.
const sectionCache = new Map();

function sectionKeys(x) {
	const cached = sectionCache.get(x);
	if (cached) return cached;
	const low = lowerEdgeHeight(x);
	const halfWidth = widthTrack(x);
	const belt = beltTrack(x);
	const sideHeight = belt - low;
	const glassBaseWidth = glassBaseWidthTrack(x);
	const railWidth = railWidthTrack(x);
	const railHeight = railHeightTrack(x);
	const crown = crownTrack(x);
	const keys = [
		[0, 0, low, 1],
		[S_KEYS.floorEdge, halfWidth - 0.24, low, 1],
		[S_KEYS.rocker, halfWidth - 0.04, low + 0.08 * sideHeight, 1],
		[0.24, halfWidth - 0.012, low + 0.24 * sideHeight, 1],
		[0.40, halfWidth, low + 0.55 * sideHeight, 1],
		[S_KEYS.shoulderCrease, halfWidth - 0.028, belt - 0.035, 0.45],
		[S_KEYS.shoulderTop, halfWidth - 0.075, belt, 1],
		[S_KEYS.glassBase, glassBaseWidth, belt + 0.012, 0.6],
		[S_KEYS.rail, railWidth, railHeight, 0.55],
		[S_KEYS.roofEdge, railWidth - 0.1, railHeight + crown * 0.65, 1],
		[1, 0, railHeight + crown, 1],
	];
	// Precompute Hermite tangents (dz/ds, dy/ds).
	const tangents = keys.map((key, index) => {
		if (index === 0) return [(keys[1][1] - key[1]) / (keys[1][0] - key[0]), 0];
		if (index === keys.length - 1) {
			const previous = keys[index - 1];
			return [(key[1] - previous[1]) / (key[0] - previous[0]), 0];
		}
		const previous = keys[index - 1];
		const next = keys[index + 1];
		const span = next[0] - previous[0];
		return [(next[1] - previous[1]) / span * key[3], (next[2] - previous[2]) / span * key[3]];
	});
	const section = { keys, tangents };
	if (sectionCache.size > 20000) sectionCache.clear();
	sectionCache.set(x, section);
	return section;
}

// Half cross-section point at station x, parameter s ∈ [0, 1]; writes {z, y} into target.
export function halfSection(x, s, target = { z: 0, y: 0 }) {
	const { keys, tangents } = sectionKeys(x);
	let segment = 0;
	while (segment < keys.length - 2 && s > keys[segment + 1][0]) segment++;
	const start = keys[segment];
	const end = keys[segment + 1];
	const span = end[0] - start[0];
	const t = THREE.MathUtils.clamp((s - start[0]) / span, 0, 1);
	const t2 = t * t;
	const t3 = t2 * t;
	const h00 = 2 * t3 - 3 * t2 + 1;
	const h10 = t3 - 2 * t2 + t;
	const h01 = -2 * t3 + 3 * t2;
	const h11 = t3 - t2;
	const startTangent = tangents[segment];
	const endTangent = tangents[segment + 1];
	target.z = h00 * start[1] + h10 * span * startTangent[0] + h01 * end[1] + h11 * span * endTangent[0];
	target.y = h00 * start[2] + h10 * span * startTangent[1] + h01 * end[2] + h11 * span * endTangent[1];
	return target;
}

export function sigmaToHalf(sigma) {
	return sigma <= 1 ? sigma : 2 - sigma;
}

const scratchSection = { z: 0, y: 0 };

// Point on the lofted body at station x and loop parameter sigma.
export function loftPoint(x, sigma, target = new THREE.Vector3()) {
	const wrapped = ((sigma % 2) + 2) % 2;
	const side = wrapped <= 1 ? 1 : -1;
	halfSection(x, sigmaToHalf(wrapped), scratchSection);
	return target.set(x, scratchSection.y, side * scratchSection.z);
}

const filletBase = new THREE.Vector3();
const filletBefore = new THREE.Vector3();
const filletAfter = new THREE.Vector3();

// Point on an end fillet. end = +1 front, -1 rear; angle ∈ [0, π/2].
export function filletPoint(end, angle, sigma, target = new THREE.Vector3()) {
	const stationX = end > 0 ? X_FRONT : X_REAR;
	loftPoint(stationX, sigma, filletBase);
	loftPoint(stationX, sigma - 1e-4, filletBefore);
	loftPoint(stationX, sigma + 1e-4, filletAfter);
	let tangentZ = filletAfter.z - filletBefore.z;
	let tangentY = filletAfter.y - filletBefore.y;
	const length = Math.hypot(tangentZ, tangentY) || 1;
	tangentZ /= length;
	tangentY /= length;
	// The loop runs counter-clockwise in the (z, y) plane, so inward is the tangent rotated +90°.
	const inwardZ = -tangentY;
	const inwardY = tangentZ;
	const inset = END_FILLET_RADIUS * (1 - Math.cos(angle));
	return target.set(
		stationX + end * END_FILLET_RADIUS * Math.sin(angle),
		filletBase.y + inwardY * inset,
		filletBase.z + inwardZ * inset,
	);
}

// Closed outline (in z, y) of an end face.
export function endFaceOutline(end, sampleCount = 160) {
	const outline = [];
	const point = new THREE.Vector3();
	for (let index = 0; index < sampleCount; index++) {
		filletPoint(end, Math.PI / 2, (index / sampleCount) * 2, point);
		outline.push(new THREE.Vector2(point.z, point.y));
	}
	return outline;
}

export function endFaceX(end) {
	return end > 0 ? X_FRONT + END_FILLET_RADIUS : X_REAR - END_FILLET_RADIUS;
}
