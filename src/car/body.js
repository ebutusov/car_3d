// Builds the painted body shell, glass and the opening panels (doors, hood, tailgate)
// from the parametric surface in shape.js.

import * as THREE from 'three';
import {
	X_FRONT, X_REAR, WHEEL, S_KEYS, loftPoint, filletPoint, endFaceOutline, endFaceX, sigmaToHalf,
} from './shape.js';
import {
	buildSamples, sampleGrid, gridGeometry, gridRibbonGeometry, planarPolygonGeometry, clipPolygonToRectangle,
} from './surfaceBuilder.js';

const GAP_X = 0.004;
const GAP_S = 0.0035;
const HOOD_FILLET_ANGLE = 0.95;
const HOOD_FILLET_GAP = 0.05;
const TAILGATE_CUT_Y = 0.62;
const REAR_DIFFUSER_Y = 0.47;
const FRONT_LIP_Y = 0.42;
const INNER_SHELL_DEPTH = 0.012;

export const OPENINGS = {
	hood: { xMin: 0.88, xMax: X_FRONT, sMin: S_KEYS.glassBase, sMax: 1 },
	tailgate: { xMin: X_REAR, xMax: -1.60, sMin: 0.845, sMax: 1 },
	frontDoor: { xMin: -0.175, xMax: 0.895, sMin: S_KEYS.rocker, sMax: 0.845 },
	rearDoor: { xMin: -1.11, xMax: -0.175, sMin: S_KEYS.rocker, sMax: 0.845 },
};

const SIDE_WINDOWS = [[-0.10, 0.80], [-1.06, -0.25], [-1.86, -1.20]];
const SIDE_PILLARS = [[-0.25, -0.10], [-1.20, -1.06]];
const WINDSHIELD = { xMin: -0.10, xMax: 0.83, sMin: 0.875 };
const REAR_WINDOW = { xMin: -2.24, xMax: -1.64, sMin: 0.875 };
const GREENHOUSE_SPAN = [-1.95, 0.80];

function within(value, range) {
	return value > range[0] && value < range[1];
}

// Material of the loft surface at station x and half-section parameter s.
function loftMaterialKey(x, s) {
	if (s < S_KEYS.claddingTop) return 'trim';
	if (s < S_KEYS.shoulderTop) return 'paint';
	if (s < S_KEYS.glassBase) return within(x, GREENHOUSE_SPAN) ? 'satinChrome' : 'paint';
	if (s < S_KEYS.rail) {
		if (SIDE_WINDOWS.some((range) => within(x, range))) return 'glass';
		if (SIDE_PILLARS.some((range) => within(x, range))) return 'blackGloss';
		return 'paint';
	}
	if (s >= WINDSHIELD.sMin && x > WINDSHIELD.xMin && x < WINDSHIELD.xMax) return 'glass';
	if (s >= REAR_WINDOW.sMin && x > REAR_WINDOW.xMin && x < REAR_WINDOW.xMax) return 'glass';
	return 'paint';
}

function insideOpening(x, s, opening) {
	return x >= opening.xMin && x <= opening.xMax && s >= opening.sMin && s <= opening.sMax;
}

// Half-section samples mirrored into a full sigma loop (or only one side).
function sigmaSamples(halfSamples, side) {
	const right = halfSamples;
	const left = halfSamples.map((value) => 2 - value).reverse();
	if (side > 0) return right;
	if (side < 0) return left;
	return [...right, ...left.slice(1)];
}

function halfSampleBreaks() {
	const breaks = [...Object.values(S_KEYS), 0.24, 0.40, WINDSHIELD.sMin];
	for (const opening of Object.values(OPENINGS)) {
		breaks.push(opening.sMin, opening.sMax, opening.sMin + GAP_S, opening.sMax - GAP_S);
	}
	return breaks;
}

function stationBreaks() {
	const breaks = [...GREENHOUSE_SPAN, WINDSHIELD.xMin, WINDSHIELD.xMax, REAR_WINDOW.xMin, REAR_WINDOW.xMax];
	for (const range of [...SIDE_WINDOWS, ...SIDE_PILLARS]) breaks.push(...range);
	for (const opening of Object.values(OPENINGS)) {
		breaks.push(opening.xMin, opening.xMax, opening.xMin + GAP_X, opening.xMax - GAP_X);
	}
	// Dense stations around the wheel arches so the arch outline stays round.
	for (const axleX of [WHEEL.frontAxleX, WHEEL.rearAxleX]) {
		for (let step = 0; step <= 40; step++) {
			breaks.push(axleX + Math.cos((step / 40) * Math.PI) * (WHEEL.archRadius + 0.002));
		}
	}
	return breaks;
}

// Chooses the grid orientation so normals point away from the car's centre line.
function outwardOrientation(pointFunction, a, b) {
	const point = new THREE.Vector3();
	const plus = new THREE.Vector3();
	const minus = new THREE.Vector3();
	pointFunction(a, b, point);
	pointFunction(a + 1e-4, b, plus);
	pointFunction(a - 1e-4, b, minus);
	const derivativeA = plus.clone().sub(minus);
	pointFunction(a, b + 1e-4, plus);
	pointFunction(a, b - 1e-4, minus);
	const derivativeB = plus.clone().sub(minus);
	const normal = new THREE.Vector3().crossVectors(derivativeA, derivativeB);
	const outward = new THREE.Vector3(point.x * 0.2, point.y - 0.8, point.z);
	return normal.dot(outward) >= 0 ? 1 : -1;
}

const loftFunction = (x, sigma, target) => loftPoint(x, sigma, target);
const frontFilletFunction = (angle, sigma, target) => filletPoint(1, angle, sigma, target);
const rearFilletFunction = (angle, sigma, target) => filletPoint(-1, angle, sigma, target);

function meshFromGroups({ geometry, materialKeys }, materials) {
	const mesh = new THREE.Mesh(geometry, materialKeys.map((key) => materials[key]));
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}

// Outer skin, inner (back-facing) lining and edge ribbons for one grid patch.
function addGridPatch(parent, grid, classify, materials, { innerDepth, ribbons }) {
	parent.add(meshFromGroups(gridGeometry(grid, classify), materials));
	const innerClassify = (a, b) => {
		const key = classify(a, b);
		return key && key !== 'glass' ? 'interior' : null;
	};
	const inner = meshFromGroups(gridGeometry(grid, innerClassify, { offset: -innerDepth }), materials);
	inner.castShadow = false;
	parent.add(inner);
	if (ribbons) {
		const ribbon = new THREE.Mesh(gridRibbonGeometry(grid, innerDepth), materials.paintDoubleSided);
		ribbon.castShadow = true;
		parent.add(ribbon);
	}
}

function addPolygon(parent, outline, planeX, facing, material, innerMaterial, innerDepth) {
	if (outline.length < 3) return;
	const mesh = new THREE.Mesh(planarPolygonGeometry(outline, planeX, facing), material);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	parent.add(mesh);
	if (innerMaterial) {
		const inner = new THREE.Mesh(planarPolygonGeometry(outline, planeX - facing * innerDepth, facing), innerMaterial);
		parent.add(inner);
	}
}

// Wraps world-space content in a hinge group placed at the pivot.
function createHinge(name, pivot, axis, openAngle, content) {
	const hinge = new THREE.Group();
	hinge.name = name;
	hinge.position.copy(pivot);
	content.position.sub(pivot);
	hinge.add(content);
	hinge.userData = { partName: name, axis, openAngle, openAmount: 0, target: 0 };
	content.traverse((object) => {
		object.userData.partName = name;
	});
	return hinge;
}

export function buildBody(materials, { quality = 'high' } = {}) {
	const detail = quality === 'low' ? 0.6 : 1;
	const body = new THREE.Group();
	body.name = 'body';
	const shell = new THREE.Group();
	shell.name = 'shell';
	body.add(shell);

	const halfSamples = buildSamples(0, 1, Math.round(72 * detail), halfSampleBreaks());
	const stations = buildSamples(X_REAR, X_FRONT, Math.round(220 * detail), stationBreaks());
	const filletAngles = buildSamples(0, Math.PI / 2, 10, [HOOD_FILLET_ANGLE, HOOD_FILLET_ANGLE + HOOD_FILLET_GAP]);
	const fullLoop = sigmaSamples(halfSamples, 0);

	// --- Fixed shell -------------------------------------------------------------------------
	const loftOrientation = outwardOrientation(loftFunction, 0, 0.4);
	const loftGrid = sampleGrid(loftFunction, stations, fullLoop, loftOrientation);
	addGridPatch(shell, loftGrid, (x, sigma) => {
		const s = sigmaToHalf(sigma);
		if (Object.values(OPENINGS).some((opening) => insideOpening(x, s, opening))) return null;
		return loftMaterialKey(x, s);
	}, materials, { innerDepth: INNER_SHELL_DEPTH });

	const frontGrid = sampleGrid(frontFilletFunction, filletAngles, fullLoop,
		outwardOrientation(frontFilletFunction, 0.5, 0.4));
	addGridPatch(shell, frontGrid, (angle, sigma) => {
		const s = sigmaToHalf(sigma);
		if (s < S_KEYS.claddingTop) return 'trim';
		if (s >= OPENINGS.hood.sMin && angle < HOOD_FILLET_ANGLE + HOOD_FILLET_GAP) return null;
		return 'paint';
	}, materials, { innerDepth: INNER_SHELL_DEPTH });

	const rearAngles = filletAngles.slice().reverse();
	const rearGrid = sampleGrid(rearFilletFunction, rearAngles, fullLoop,
		outwardOrientation(rearFilletFunction, 0.5, 0.4));
	addGridPatch(shell, rearGrid, (angle, sigma) => {
		const s = sigmaToHalf(sigma);
		if (s >= OPENINGS.tailgate.sMin) return null;
		if (s < S_KEYS.claddingTop) return 'trim';
		return 'paint';
	}, materials, { innerDepth: INNER_SHELL_DEPTH });

	// End faces.
	const frontOutline = endFaceOutline(1);
	const frontX = endFaceX(1);
	addPolygon(shell, clipPolygonToRectangle(frontOutline, -9, 9, FRONT_LIP_Y, 9), frontX, 1, materials.paint, materials.interiorFront, INNER_SHELL_DEPTH);
	addPolygon(shell, clipPolygonToRectangle(frontOutline, -9, 9, -9, FRONT_LIP_Y), frontX, 1, materials.trim);

	const rearOutline = endFaceOutline(-1);
	const rearX = endFaceX(-1);
	const tailgateEdgeZ = filletPoint(-1, Math.PI / 2, OPENINGS.tailgate.sMin).z;
	addPolygon(shell, clipPolygonToRectangle(rearOutline, -9, 9, -9, REAR_DIFFUSER_Y), rearX, -1, materials.trim);
	addPolygon(shell, clipPolygonToRectangle(rearOutline, -9, 9, REAR_DIFFUSER_Y, TAILGATE_CUT_Y), rearX, -1, materials.paint, materials.interiorFront, INNER_SHELL_DEPTH);
	addPolygon(shell, clipPolygonToRectangle(rearOutline, tailgateEdgeZ, 9, TAILGATE_CUT_Y, 9), rearX, -1, materials.paint, materials.interiorFront, INNER_SHELL_DEPTH);
	addPolygon(shell, clipPolygonToRectangle(rearOutline, -9, -tailgateEdgeZ, TAILGATE_CUT_Y, 9), rearX, -1, materials.paint, materials.interiorFront, INNER_SHELL_DEPTH);

	// Wheel-well liners stop the view through the arches into the body.
	for (const axleX of [WHEEL.frontAxleX, WHEEL.rearAxleX]) {
		for (const side of [1, -1]) {
			const linerRadius = WHEEL.archRadius + 0.005;
			const liner = new THREE.Mesh(
				new THREE.CylinderGeometry(linerRadius, linerRadius, 0.42, 40, 1, true, Math.PI / 2, Math.PI),
				materials.trimDoubleSided,
			);
			liner.geometry.rotateX(Math.PI / 2);
			liner.position.set(axleX, WHEEL.archCenterY, side * 0.76);
			const wall = new THREE.Mesh(new THREE.CircleGeometry(linerRadius, 40, 0, Math.PI), materials.trimDoubleSided);
			wall.position.set(axleX, WHEEL.archCenterY, side * 0.55);
			shell.add(liner, wall);
		}
	}

	// B-pillars stay with the body when both doors on a side are open.
	for (const side of [1, -1]) {
		const points = [];
		const normal = new THREE.Vector3();
		for (let step = 0; step <= 12; step++) {
			const s = THREE.MathUtils.lerp(0.24, 0.835, step / 12);
			const point = loftPoint(OPENINGS.rearDoor.xMax, side > 0 ? s : 2 - s);
			normal.set(0, point.y < 1.05 ? 0 : 0.3, side).normalize();
			points.push(point.addScaledVector(normal, -0.07));
		}
		const pillar = new THREE.Mesh(
			new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.045, 6, false),
			materials.interiorFront,
		);
		pillar.castShadow = true;
		shell.add(pillar);
	}

	// --- Opening panels ----------------------------------------------------------------------
	const hinges = {};
	const panelOptions = { innerDepth: 0.035, ribbons: true };
	const panelClassify = (x, sigma) => loftMaterialKey(x, sigmaToHalf(sigma));

	// Hood: hinged at its rear edge, rotates about Z (front edge lifts).
	{
		const opening = OPENINGS.hood;
		const content = new THREE.Group();
		const hoodStations = stations.filter((x) => x >= opening.xMin + GAP_X);
		const hoodHalf = halfSamples.filter((s) => s >= opening.sMin + GAP_S);
		const hoodLoop = sigmaSamples(hoodHalf, 0);
		addGridPatch(content, sampleGrid(loftFunction, hoodStations, hoodLoop, loftOrientation), panelClassify, materials, panelOptions);
		const hoodAngles = filletAngles.filter((angle) => angle <= HOOD_FILLET_ANGLE);
		addGridPatch(content, sampleGrid(frontFilletFunction, hoodAngles, hoodLoop, frontGrid.orientation), () => 'paint', materials, panelOptions);
		const pivot = loftPoint(opening.xMin, 1).add(new THREE.Vector3(0, -0.02, 0));
		hinges.hood = createHinge('hood', pivot, new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(58), content);
	}

	// Tailgate: hinged at the roof's rear edge, swings up and back.
	{
		const opening = OPENINGS.tailgate;
		const content = new THREE.Group();
		const tailgateStations = stations.filter((x) => x <= opening.xMax - GAP_X);
		const tailgateHalf = halfSamples.filter((s) => s >= opening.sMin + GAP_S);
		const tailgateLoop = sigmaSamples(tailgateHalf, 0);
		addGridPatch(content, sampleGrid(loftFunction, tailgateStations, tailgateLoop, loftOrientation), panelClassify, materials, panelOptions);
		addGridPatch(content, sampleGrid(rearFilletFunction, rearAngles, tailgateLoop, rearGrid.orientation), () => 'paint', materials, panelOptions);
		const tailgateFace = clipPolygonToRectangle(rearOutline, -tailgateEdgeZ + GAP_X, tailgateEdgeZ - GAP_X, TAILGATE_CUT_Y + GAP_X, 9);
		addPolygon(content, tailgateFace, rearX, -1, materials.paint, materials.interiorFront, 0.035);
		const pivot = loftPoint(opening.xMax, 1).add(new THREE.Vector3(0, -0.01, 0));
		hinges.tailgate = createHinge('tailgate', pivot, new THREE.Vector3(0, 0, -1), THREE.MathUtils.degToRad(82), content);
	}

	// Doors: hinged at their front edge on a vertical axis.
	for (const [doorKey, prefix] of [['frontDoor', 'front'], ['rearDoor', 'rear']]) {
		const opening = OPENINGS[doorKey];
		const doorStations = stations.filter((x) => x >= opening.xMin + GAP_X && x <= opening.xMax - GAP_X);
		const doorHalf = halfSamples.filter((s) => s >= opening.sMin + GAP_S && s <= opening.sMax - GAP_S);
		for (const side of [1, -1]) {
			const name = `${prefix}${side > 0 ? 'Right' : 'Left'}Door`;
			const content = new THREE.Group();
			addGridPatch(content, sampleGrid(loftFunction, doorStations, sigmaSamples(doorHalf, side), loftOrientation), panelClassify, materials, panelOptions);
			const hingePoint = loftPoint(opening.xMax - GAP_X, side > 0 ? 0.40 : 1.60);
			hinges[name] = createHinge(name, hingePoint, new THREE.Vector3(0, side, 0), THREE.MathUtils.degToRad(64), content);
		}
	}

	for (const hinge of Object.values(hinges)) body.add(hinge);
	return { body, shell, hinges };
}
