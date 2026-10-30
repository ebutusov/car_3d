// Static scenery: ground layout, curbs, markings, trees, street lamps, buildings, hills.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
	createRandomGenerator,
	createAsphaltTextures,
	createGrassTextures,
	createPaverTextures,
	createConcreteTextures,
	createPaintWearTexture,
	createBarkTextures,
	createFoliageTextures,
	createFacadeTextures,
	addMacroVariation
} from './textures.js';

// ---------------------------------------------------------------- layout constants (meters)

export const LAYOUT = {
	plaza: { minX: -40, maxX: 40, minZ: -11, maxZ: 18 },
	road: { minX: -260, maxX: 260, minZ: -23, maxZ: -15 },
	southSidewalk: { minZ: -14.8, maxZ: -11, height: 0.15 },
	grassLevel: -0.04,
	// keep-out zone around the car (flat, unobstructed)
	carZone: { minX: -9, maxX: 9, minZ: -7, maxZ: 7 }
};

// Plaza lamps that carry real SpotLights: post position + direction the arm points to.
export const LIT_LAMPS = [
	{ x: -8.5, z: -9.6, armDirectionZ: 1 },
	{ x: 8.5, z: -9.6, armDirectionZ: 1 },
	{ x: -8.5, z: 9.6, armDirectionZ: -1 },
	{ x: 8.5, z: 9.6, armDirectionZ: -1 }
];

const LAMP_HEIGHT = 7;
const LAMP_ARM_LENGTH = 1.5;

// ---------------------------------------------------------------- geometry helpers

// Horizontal rectangle with UVs in world meters / uvScale (top face only).
function createFlatRect(minX, maxX, minZ, maxZ, height, uvScale) {
	const geometry = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ);
	geometry.rotateX(-Math.PI / 2);
	geometry.translate((minX + maxX) / 2, height, (minZ + maxZ) / 2);
	const positions = geometry.attributes.position;
	const uvs = geometry.attributes.uv;
	for (let index = 0; index < positions.count; index++) {
		uvs.setXY(index, positions.getX(index) / uvScale, -positions.getZ(index) / uvScale);
	}
	return geometry;
}

// Box with UVs in meters / uvScale on every face (for curbs, slabs, planters).
function createWorldUvBox(width, height, depth, centerX, centerY, centerZ, uvScale) {
	const geometry = new THREE.BoxGeometry(width, height, depth);
	const uvs = geometry.attributes.uv;
	// face order: +x, -x, +y, -y, +z, -z ; 4 vertices each
	const faceExtents = [
		[depth, height], [depth, height],
		[width, depth], [width, depth],
		[width, height], [width, height]
	];
	for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
		for (let vertex = 0; vertex < 4; vertex++) {
			const index = faceIndex * 4 + vertex;
			uvs.setXY(index, uvs.getX(index) * faceExtents[faceIndex][0] / uvScale, uvs.getY(index) * faceExtents[faceIndex][1] / uvScale);
		}
	}
	geometry.translate(centerX, centerY, centerZ);
	return geometry;
}

function pointInRect(x, z, rect, margin = 0) {
	return x > rect.minX - margin && x < rect.maxX + margin && z > rect.minZ - margin && z < rect.maxZ + margin;
}

// ---------------------------------------------------------------- materials

function createSurfaceMaterials(quality, anisotropy) {
	const textureSize = quality === 'high' ? 1024 : 512;
	const smallTextureSize = quality === 'high' ? 512 : 256;

	const asphaltTextures = createAsphaltTextures(textureSize, anisotropy);
	const asphaltMaterial = addMacroVariation(new THREE.MeshStandardMaterial({
		name: 'asphalt',
		map: asphaltTextures.map,
		roughnessMap: asphaltTextures.roughnessMap,
		normalMap: asphaltTextures.normalMap,
		normalScale: new THREE.Vector2(0.35, 0.35),
		roughness: 1,
		metalness: 0,
		polygonOffset: true,
		polygonOffsetFactor: -1,
		polygonOffsetUnits: -1
	}), { scale: 0.045, strength: 0.14 });

	const roadTextures = createAsphaltTextures(textureSize, anisotropy, 17);
	const roadMaterial = addMacroVariation(new THREE.MeshStandardMaterial({
		name: 'road-asphalt',
		map: roadTextures.map,
		roughnessMap: roadTextures.roughnessMap,
		normalMap: roadTextures.normalMap,
		normalScale: new THREE.Vector2(0.35, 0.35),
		color: new THREE.Color(0.86, 0.86, 0.86),
		roughness: 1,
		metalness: 0,
		polygonOffset: true,
		polygonOffsetFactor: -1,
		polygonOffsetUnits: -1
	}), { scale: 0.03, strength: 0.16 });

	const grassTextures = createGrassTextures(textureSize, anisotropy);
	const grassMaterial = addMacroVariation(new THREE.MeshStandardMaterial({
		name: 'grass',
		map: grassTextures.map,
		roughnessMap: grassTextures.roughnessMap,
		normalMap: grassTextures.normalMap,
		normalScale: new THREE.Vector2(0.8, 0.8),
		roughness: 1,
		metalness: 0
	}), { scale: 0.02, strength: 0.22 });

	const paverTextures = createPaverTextures(smallTextureSize, anisotropy);
	const paverMaterial = new THREE.MeshStandardMaterial({
		name: 'pavers',
		map: paverTextures.map,
		roughnessMap: paverTextures.roughnessMap,
		normalMap: paverTextures.normalMap,
		roughness: 1,
		metalness: 0
	});

	const concreteTextures = createConcreteTextures(smallTextureSize, anisotropy);
	const concreteMaterial = new THREE.MeshStandardMaterial({
		name: 'concrete',
		map: concreteTextures.map,
		roughnessMap: concreteTextures.roughnessMap,
		normalMap: concreteTextures.normalMap,
		roughness: 1,
		metalness: 0
	});

	const paintWear = createPaintWearTexture(smallTextureSize, anisotropy);
	const markingMaterialSettings = {
		map: paintWear,
		roughness: 0.62,
		metalness: 0,
		polygonOffset: true,
		polygonOffsetFactor: -2,
		polygonOffsetUnits: -6
	};
	const whitePaintMaterial = new THREE.MeshStandardMaterial({ name: 'paint-white', color: new THREE.Color(0.82, 0.82, 0.8), ...markingMaterialSettings });
	const yellowPaintMaterial = new THREE.MeshStandardMaterial({ name: 'paint-yellow', color: new THREE.Color(0.85, 0.62, 0.12), ...markingMaterialSettings });

	return {
		asphaltMaterial, roadMaterial, grassMaterial, paverMaterial, concreteMaterial, whitePaintMaterial, yellowPaintMaterial,
		textures: [asphaltTextures, roadTextures, grassTextures, paverTextures, concreteTextures].flatMap((set) => Object.values(set)).concat([paintWear])
	};
}

// ---------------------------------------------------------------- ground & hardscape

function buildGround(group, materials) {
	const { plaza, road, southSidewalk, grassLevel } = LAYOUT;

	// endless grass (fades into the fog / horizon dome long before the edge)
	const grassGeometry = new THREE.CircleGeometry(1600, 48);
	grassGeometry.rotateX(-Math.PI / 2);
	grassGeometry.translate(0, grassLevel, 0);
	const grassPositions = grassGeometry.attributes.position;
	for (let index = 0; index < grassPositions.count; index++) {
		grassGeometry.attributes.uv.setXY(index, grassPositions.getX(index) / 6, -grassPositions.getZ(index) / 6);
	}
	const grass = new THREE.Mesh(grassGeometry, materials.grassMaterial);
	grass.receiveShadow = true;
	grass.name = 'ground-grass';
	group.add(grass);

	// plaza asphalt
	const plazaMesh = new THREE.Mesh(createFlatRect(plaza.minX, plaza.maxX, plaza.minZ, plaza.maxZ, 0, 7), materials.asphaltMaterial);
	plazaMesh.receiveShadow = true;
	plazaMesh.name = 'plaza-asphalt';
	group.add(plazaMesh);

	// road
	const roadMesh = new THREE.Mesh(createFlatRect(road.minX, road.maxX, road.minZ, road.maxZ, 0, 7), materials.roadMaterial);
	roadMesh.receiveShadow = true;
	roadMesh.name = 'road-asphalt';
	group.add(roadMesh);

	// sidewalk between road and plaza (raised slab, pavers on top)
	const sidewalkHeight = southSidewalk.height;
	const sidewalkDepth = southSidewalk.maxZ - southSidewalk.minZ;
	const sidewalkGeometry = createWorldUvBox(road.maxX - road.minX, sidewalkHeight + 0.1, sidewalkDepth,
		0, (sidewalkHeight - 0.1) / 2, (southSidewalk.minZ + southSidewalk.maxZ) / 2, 2.4);
	const sidewalk = new THREE.Mesh(sidewalkGeometry, materials.paverMaterial);
	sidewalk.receiveShadow = true;
	sidewalk.name = 'sidewalk';
	group.add(sidewalk);

	// curbs (light concrete): along road edges and around the plaza
	const curbHeight = 0.17;
	const curbGeometries = [
		// road side of the sidewalk
		createWorldUvBox(road.maxX - road.minX, curbHeight + 0.1, 0.22, 0, (curbHeight - 0.1) / 2, road.maxZ + 0.11, 1),
		// far side of road
		createWorldUvBox(road.maxX - road.minX, 0.12 + 0.1, 0.22, 0, 0.01, road.minZ - 0.11, 1),
		// plaza north edge
		createWorldUvBox(plaza.maxX - plaza.minX + 0.44, 0.13 + 0.1, 0.22, 0, 0.015, plaza.maxZ + 0.11, 1),
		// plaza east / west edges
		createWorldUvBox(0.22, 0.13 + 0.1, plaza.maxZ - plaza.minZ, plaza.maxX + 0.11, 0.015, (plaza.minZ + plaza.maxZ) / 2, 1),
		createWorldUvBox(0.22, 0.13 + 0.1, plaza.maxZ - plaza.minZ, plaza.minX - 0.11, 0.015, (plaza.minZ + plaza.maxZ) / 2, 1)
	];

	// planter islands with a tree each, either side of the car
	const planters = [];
	for (const side of [-1, 1]) {
		const centerX = side * 16.5;
		const halfWidth = 1.8;
		const halfDepth = 3.6;
		const wallThickness = 0.18;
		const wallHeight = 0.2;
		curbGeometries.push(
			createWorldUvBox(halfWidth * 2, wallHeight, wallThickness, centerX, wallHeight / 2, -halfDepth + wallThickness / 2, 1),
			createWorldUvBox(halfWidth * 2, wallHeight, wallThickness, centerX, wallHeight / 2, halfDepth - wallThickness / 2, 1),
			createWorldUvBox(wallThickness, wallHeight, halfDepth * 2 - wallThickness * 2, centerX - halfWidth + wallThickness / 2, wallHeight / 2, 0, 1),
			createWorldUvBox(wallThickness, wallHeight, halfDepth * 2 - wallThickness * 2, centerX + halfWidth - wallThickness / 2, wallHeight / 2, 0, 1)
		);
		planters.push({ x: centerX, z: 0, minX: centerX - halfWidth, maxX: centerX + halfWidth, minZ: -halfDepth, maxZ: halfDepth });
		const planterGrass = new THREE.Mesh(createFlatRect(centerX - halfWidth + wallThickness, centerX + halfWidth - wallThickness,
			-halfDepth + wallThickness, halfDepth - wallThickness, 0.14, 3), materials.grassMaterial);
		planterGrass.receiveShadow = true;
		group.add(planterGrass);
	}

	const curbs = new THREE.Mesh(mergeGeometries(curbGeometries), materials.concreteMaterial);
	curbs.receiveShadow = true;
	curbs.castShadow = true;
	curbs.name = 'curbs';
	group.add(curbs);
	curbGeometries.forEach((geometry) => geometry.dispose());

	return { planters };
}

function buildMarkings(group, materials) {
	const { road } = LAYOUT;
	const whiteGeometries = [];
	const yellowGeometries = [];
	const paintHeight = 0.006;
	const roadPaintHeight = 0.008;
	const addStripe = (target, minX, maxX, minZ, maxZ, height = paintHeight) => {
		target.push(createFlatRect(minX, maxX, minZ, maxZ, height, 1.7));
	};

	// road: dashed centre line, solid edge lines, zebra crossing
	const roadCenterZ = (road.minZ + road.maxZ) / 2;
	for (let dashStart = -150; dashStart < 150; dashStart += 9) {
		if (dashStart > 17 && dashStart < 27) continue;
		addStripe(whiteGeometries, dashStart, dashStart + 3, roadCenterZ - 0.07, roadCenterZ + 0.07, roadPaintHeight);
	}
	addStripe(whiteGeometries, -150, 150, road.maxZ - 0.45, road.maxZ - 0.3, roadPaintHeight);
	addStripe(whiteGeometries, -150, 150, road.minZ + 0.3, road.minZ + 0.45, roadPaintHeight);
	for (let stripeZ = road.minZ + 0.6; stripeZ < road.maxZ - 0.7; stripeZ += 1.0) {
		addStripe(whiteGeometries, 20, 24, stripeZ, stripeZ + 0.5, roadPaintHeight + 0.001);
	}

	// parking stalls: north row and south row, perpendicular to the curb
	const stallWidth = 2.6;
	const lineWidth = 0.12;
	for (let stallLineX = -31.2; stallLineX <= 31.2; stallLineX += stallWidth) {
		addStripe(whiteGeometries, stallLineX - lineWidth / 2, stallLineX + lineWidth / 2, 12.2, 17.4);
		if (Math.abs(stallLineX) > 5) addStripe(whiteGeometries, stallLineX - lineWidth / 2, stallLineX + lineWidth / 2, -10.6, -5.6);
	}
	addStripe(whiteGeometries, -31.2, 31.2, 12.2 - lineWidth, 12.2);

	// the car's own bay (open towards +X, the car's front)
	addStripe(whiteGeometries, -3.1, 3.2, -1.5, -1.5 + lineWidth);
	addStripe(whiteGeometries, -3.1, 3.2, 1.5 - lineWidth, 1.5);
	addStripe(whiteGeometries, -3.1, -3.1 + lineWidth, -1.5, 1.5);

	// yellow hatched no-parking box near the planters / pedestrian path
	for (const side of [-1, 1]) {
		const centerX = side * 25;
		addStripe(yellowGeometries, centerX - 2, centerX + 2, 2.4, 2.52);
		addStripe(yellowGeometries, centerX - 2, centerX + 2, -2.52, -2.4);
		for (let hatchX = centerX - 1.6; hatchX < centerX + 1.8; hatchX += 0.8) {
			const hatch = createFlatRect(-0.06, 0.06, -2.3, 2.3, paintHeight, 1.7);
			hatch.rotateY(0.6);
			hatch.translate(hatchX, 0, 0);
			// clip rotated stripes back into the box by scaling (keeps it simple)
			hatch.scale(1, 1, 0.85);
			yellowGeometries.push(hatch);
		}
	}

	const whiteMarkings = new THREE.Mesh(mergeGeometries(whiteGeometries), materials.whitePaintMaterial);
	whiteMarkings.receiveShadow = true;
	whiteMarkings.name = 'markings-white';
	whiteMarkings.renderOrder = 1;
	group.add(whiteMarkings);
	const yellowMarkings = new THREE.Mesh(mergeGeometries(yellowGeometries), materials.yellowPaintMaterial);
	yellowMarkings.receiveShadow = true;
	yellowMarkings.name = 'markings-yellow';
	yellowMarkings.renderOrder = 1;
	group.add(yellowMarkings);
	[...whiteGeometries, ...yellowGeometries].forEach((geometry) => geometry.dispose());
}

// ---------------------------------------------------------------- trees

function hashPosition(x, y, z) {
	const value = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719) * 43758.5453;
	return value - Math.floor(value);
}

function createFoliageGeometry(kind, detail, random) {
	const blobs = [];
	if (kind === 'conifer') {
		const levels = 6;
		for (let level = 0; level < levels; level++) {
			const levelFraction = level / (levels - 1);
			const ringRadius = 1.5 * (1 - levelFraction) + 0.2;
			const blobsInRing = level === levels - 1 ? 1 : 3;
			for (let blobIndex = 0; blobIndex < blobsInRing; blobIndex++) {
				const angle = (blobIndex / blobsInRing) * Math.PI * 2 + level * 0.9;
				const offset = blobsInRing === 1 ? 0 : ringRadius * 0.55;
				blobs.push({
					center: new THREE.Vector3(Math.cos(angle) * offset, 2.2 + levelFraction * 6.2, Math.sin(angle) * offset),
					radius: (1 - levelFraction) * 1.25 + 0.45,
					squash: 0.75
				});
			}
		}
	} else {
		const isTall = kind === 'tall';
		const crownCenter = new THREE.Vector3(0, isTall ? 6.0 : 4.6, 0);
		const crownRadii = isTall ? new THREE.Vector3(1.6, 3.0, 1.6) : new THREE.Vector3(2.4, 1.9, 2.4);
		const blobCount = isTall ? 10 : 11;
		for (let blobIndex = 0; blobIndex < blobCount; blobIndex++) {
			const theta = random() * Math.PI * 2;
			const phi = Math.acos(random() * 2 - 1);
			const distance = Math.cbrt(random()) * 0.75;
			blobs.push({
				center: new THREE.Vector3(
					crownCenter.x + Math.sin(phi) * Math.cos(theta) * crownRadii.x * distance,
					crownCenter.y + Math.cos(phi) * crownRadii.y * distance * 0.85,
					crownCenter.z + Math.sin(phi) * Math.sin(theta) * crownRadii.z * distance
				),
				radius: (isTall ? 1.05 : 1.25) + random() * 0.55,
				squash: 0.9
			});
		}
	}

	let crownMinY = Infinity;
	let crownMaxY = -Infinity;
	const crownCentroid = new THREE.Vector3();
	for (const blob of blobs) {
		crownMinY = Math.min(crownMinY, blob.center.y - blob.radius);
		crownMaxY = Math.max(crownMaxY, blob.center.y + blob.radius);
		crownCentroid.add(blob.center);
	}
	crownCentroid.divideScalar(blobs.length);

	const blobGeometries = blobs.map((blob) => {
		const geometry = new THREE.IcosahedronGeometry(blob.radius, detail);
		geometry.scale(1, blob.squash, 1);
		const positions = geometry.attributes.position;
		const vertex = new THREE.Vector3();
		for (let index = 0; index < positions.count; index++) {
			vertex.fromBufferAttribute(positions, index);
			const bump = hashPosition(vertex.x, vertex.y, vertex.z);
			vertex.multiplyScalar(1 + (bump - 0.5) * 0.32);
			vertex.add(blob.center);
			positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
		}
		return geometry;
	});
	const foliageGeometry = mergeGeometries(blobGeometries);
	blobGeometries.forEach((geometry) => geometry.dispose());
	foliageGeometry.computeVertexNormals();

	// soften: blend facet normals with the direction from the crown centre, plus vertex colours
	const positions = foliageGeometry.attributes.position;
	const normals = foliageGeometry.attributes.normal;
	const colors = new Float32Array(positions.count * 3);
	const vertex = new THREE.Vector3();
	const normal = new THREE.Vector3();
	const radial = new THREE.Vector3();
	for (let index = 0; index < positions.count; index++) {
		vertex.fromBufferAttribute(positions, index);
		normal.fromBufferAttribute(normals, index);
		radial.copy(vertex).sub(crownCentroid).normalize();
		normal.lerp(radial, 0.55).normalize();
		normals.setXYZ(index, normal.x, normal.y, normal.z);
		const heightFraction = (vertex.y - crownMinY) / (crownMaxY - crownMinY);
		const outerness = THREE.MathUtils.clamp(vertex.distanceTo(crownCentroid) / 2.5, 0, 1);
		const shade = 0.42 + heightFraction * 0.4 + outerness * 0.18;
		colors[index * 3] = shade * 0.95;
		colors[index * 3 + 1] = shade;
		colors[index * 3 + 2] = shade * 0.85;
	}
	foliageGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	return foliageGeometry;
}

function createTrunkGeometry(kind, random) {
	const isConifer = kind === 'conifer';
	const trunkHeight = isConifer ? 5.5 : (kind === 'tall' ? 5.2 : 4.0);
	const trunk = new THREE.CylinderGeometry(isConifer ? 0.12 : 0.14, isConifer ? 0.24 : 0.22, trunkHeight, 8, 1);
	trunk.translate(0, trunkHeight / 2, 0);
	const parts = [trunk];
	if (!isConifer) {
		for (let branchIndex = 0; branchIndex < 3; branchIndex++) {
			const branch = new THREE.CylinderGeometry(0.04, 0.08, 1.8, 5, 1);
			branch.translate(0, 0.9, 0);
			branch.rotateZ(0.7 + random() * 0.3);
			branch.rotateY((branchIndex / 3) * Math.PI * 2 + random());
			branch.translate(0, trunkHeight * 0.62, 0);
			parts.push(branch);
		}
	}
	const merged = mergeGeometries(parts);
	parts.forEach((geometry) => geometry.dispose());
	return merged;
}

function buildTrees(group, quality, anisotropy, planters) {
	const random = createRandomGenerator(901);
	const isHigh = quality === 'high';
	const placements = [];
	const { plaza, road, carZone } = LAYOUT;

	const tryPlace = (x, z, scale, kind) => {
		if (pointInRect(x, z, carZone, 4)) return;
		if (pointInRect(x, z, plaza, -0.5) && !planters.some((planter) => Math.abs(planter.x - x) < 0.1)) return;
		if (z > road.minZ - 2.5 && z < road.maxZ + 4.5) return;
		placements.push({ x, z, scale, kind, rotation: random() * Math.PI * 2 });
	};

	const kinds = ['round', 'tall', 'conifer'];
	// planters
	for (const planter of planters) tryPlace(planter.x, planter.z, 1.0, 'round');
	// north verge row behind the plaza
	for (let x = -64; x <= 64; x += isHigh ? 8 : 16) {
		tryPlace(x + (random() - 0.5) * 2.5, 22.5 + random() * 3, 0.85 + random() * 0.35, random() < 0.7 ? 'round' : 'tall');
	}
	// row across the road
	for (let x = -80; x <= 80; x += isHigh ? 10 : 20) {
		tryPlace(x + (random() - 0.5) * 3, -28.5 - random() * 2, 0.9 + random() * 0.35, random() < 0.6 ? 'tall' : 'round');
	}
	// plaza east / west sides
	for (const side of [-1, 1]) {
		for (let z = -6; z <= 16; z += isHigh ? 7 : 14) {
			tryPlace(side * (44 + random() * 2), z + random() * 2, 0.85 + random() * 0.4, kinds[Math.floor(random() * 2)]);
		}
	}
	// scattered park trees and woodland clumps farther away
	const farCount = isHigh ? 260 : 45;
	for (let index = 0; index < farCount; index++) {
		const angle = random() * Math.PI * 2;
		const distance = 55 + Math.pow(random(), 0.8) * 320;
		const x = Math.cos(angle) * distance;
		const z = Math.sin(angle) * distance;
		if (Math.abs(z + 65) < 22 && Math.abs(x) < 140) continue; // southern building block
		if (z > 85 && z < 165 && Math.abs(x) < 210) continue; // northern building block
		tryPlace(x, z, 0.8 + random() * 0.7, kinds[Math.floor(random() * 3)]);
	}

	const barkTextures = createBarkTextures(isHigh ? 256 : 64, anisotropy);
	const foliageTextures = createFoliageTextures(isHigh ? 512 : 128, anisotropy);
	const barkMaterial = new THREE.MeshStandardMaterial({
		name: 'bark', map: barkTextures.map, normalMap: barkTextures.normalMap, roughness: 0.95, metalness: 0
	});
	const foliageMaterial = new THREE.MeshStandardMaterial({
		name: 'foliage',
		color: new THREE.Color(0.2, 0.33, 0.1),
		map: foliageTextures.map,
		normalMap: foliageTextures.normalMap,
		normalScale: new THREE.Vector2(0.7, 0.7),
		roughnessMap: foliageTextures.roughnessMap,
		roughness: 1,
		metalness: 0,
		vertexColors: true
	});

	const geometries = [];
	const nearDistance = 45;
	const dummy = new THREE.Object3D();
	const tint = new THREE.Color();
	for (const kind of kinds) {
		for (const isNear of [true, false]) {
			const kindPlacements = placements.filter((placement) => placement.kind === kind && (Math.hypot(placement.x, placement.z) < nearDistance) === isNear);
			if (kindPlacements.length === 0) continue;
			const detail = isNear ? (isHigh ? 2 : 1) : (isHigh ? 1 : 0);
			const foliageGeometry = createFoliageGeometry(kind, detail, createRandomGenerator(kind.length * 31 + 7));
			const trunkGeometry = createTrunkGeometry(kind, createRandomGenerator(kind.length * 17 + 3));
			geometries.push(foliageGeometry, trunkGeometry);
			const foliageMesh = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, kindPlacements.length);
			const trunkMesh = new THREE.InstancedMesh(trunkGeometry, barkMaterial, kindPlacements.length);
			kindPlacements.forEach((placement, instanceIndex) => {
				dummy.position.set(placement.x, placement.kind && pointInRect(placement.x, placement.z, LAYOUT.plaza) ? 0.12 : LAYOUT.grassLevel, placement.z);
				dummy.rotation.set(0, placement.rotation, 0);
				dummy.scale.set(placement.scale, placement.scale * (0.9 + random() * 0.2), placement.scale);
				dummy.updateMatrix();
				foliageMesh.setMatrixAt(instanceIndex, dummy.matrix);
				trunkMesh.setMatrixAt(instanceIndex, dummy.matrix);
				const hueShift = (random() - 0.5) * 0.05;
				const lightness = 0.8 + random() * 0.4;
				tint.setRGB(lightness * (1 + hueShift * 3), lightness, lightness * (1 - hueShift * 2));
				foliageMesh.setColorAt(instanceIndex, tint);
			});
			foliageMesh.castShadow = isNear;
			trunkMesh.castShadow = isNear;
			foliageMesh.receiveShadow = isNear;
			trunkMesh.receiveShadow = isNear;
			foliageMesh.name = `trees-${kind}-${isNear ? 'near' : 'far'}-foliage`;
			trunkMesh.name = `trees-${kind}-${isNear ? 'near' : 'far'}-trunks`;
			foliageMesh.computeBoundingSphere();
			trunkMesh.computeBoundingSphere();
			group.add(foliageMesh, trunkMesh);
		}
	}
	return {
		materials: [barkMaterial, foliageMaterial],
		geometries,
		textures: [...Object.values(barkTextures), ...Object.values(foliageTextures)]
	};
}

// ---------------------------------------------------------------- street lamps

function createLightPoolTexture(size) {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext('2d');
	const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	gradient.addColorStop(0, 'rgba(255,255,255,1)');
	gradient.addColorStop(0.25, 'rgba(255,255,255,0.7)');
	gradient.addColorStop(0.55, 'rgba(255,255,255,0.22)');
	gradient.addColorStop(1, 'rgba(255,255,255,0)');
	context.fillStyle = gradient;
	context.fillRect(0, 0, size, size);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

function buildStreetLamps(group, quality) {
	const { road, southSidewalk, plaza } = LAYOUT;
	const lamps = LIT_LAMPS.map((lamp) => ({ ...lamp, baseY: 0, hasLight: true }));
	const roadLampZ = southSidewalk.minZ + 1.0;
	for (let x = -135; x <= 135; x += 30) {
		lamps.push({ x, z: roadLampZ, armDirectionZ: -1, baseY: southSidewalk.height, hasLight: false });
	}
	for (const side of [-1, 1]) {
		lamps.push({ x: side * 30, z: -9.6, armDirectionZ: 1, baseY: 0, hasLight: false });
		lamps.push({ x: side * 30, z: 9.6, armDirectionZ: -1, baseY: 0, hasLight: false });
	}

	const radialSegments = quality === 'high' ? 12 : 6;
	const pole = new THREE.CylinderGeometry(0.065, 0.1, LAMP_HEIGHT, radialSegments, 1);
	pole.translate(0, LAMP_HEIGHT / 2, 0);
	const base = new THREE.CylinderGeometry(0.16, 0.18, 0.6, radialSegments, 1);
	base.translate(0, 0.3, 0);
	const arm = new THREE.BoxGeometry(0.07, 0.07, LAMP_ARM_LENGTH + 0.1);
	arm.translate(0, LAMP_HEIGHT - 0.05, (LAMP_ARM_LENGTH + 0.1) / 2 - 0.05);
	const head = new THREE.BoxGeometry(0.34, 0.09, 0.8);
	head.translate(0, LAMP_HEIGHT - 0.04, LAMP_ARM_LENGTH - 0.05);
	const lampBodyGeometry = mergeGeometries([pole, base, arm, head].map((geometry) => geometry.toNonIndexed()));
	[pole, base, arm, head].forEach((geometry) => geometry.dispose());
	const lensGeometry = new THREE.PlaneGeometry(0.26, 0.66);
	lensGeometry.rotateX(Math.PI / 2);
	lensGeometry.translate(0, LAMP_HEIGHT - 0.091, LAMP_ARM_LENGTH - 0.05);

	const bodyMaterial = new THREE.MeshStandardMaterial({ name: 'lamp-body', color: new THREE.Color(0.06, 0.065, 0.07), roughness: 0.45, metalness: 0.75 });
	const lensMaterial = new THREE.MeshStandardMaterial({
		name: 'lamp-lens', color: new THREE.Color(0.75, 0.75, 0.72), roughness: 0.25, metalness: 0,
		emissive: new THREE.Color(1.0, 0.72, 0.42), emissiveIntensity: 0
	});

	const bodies = new THREE.InstancedMesh(lampBodyGeometry, bodyMaterial, lamps.length);
	const lenses = new THREE.InstancedMesh(lensGeometry, lensMaterial, lamps.length);
	const dummy = new THREE.Object3D();
	const lightPositions = [];
	const poolGeometries = [];
	lamps.forEach((lamp, index) => {
		dummy.position.set(lamp.x, lamp.baseY, lamp.z);
		dummy.rotation.set(0, lamp.armDirectionZ > 0 ? 0 : Math.PI, 0);
		dummy.updateMatrix();
		bodies.setMatrixAt(index, dummy.matrix);
		lenses.setMatrixAt(index, dummy.matrix);
		const headX = lamp.x;
		const headZ = lamp.z + lamp.armDirectionZ * (LAMP_ARM_LENGTH - 0.05);
		const headY = lamp.baseY + LAMP_HEIGHT - 0.12;
		if (lamp.hasLight) {
			lightPositions.push(new THREE.Vector3(headX, headY, headZ));
		} else {
			// fake light pool on the ground under unlit-by-light lamps
			const poolRadius = 7;
			const poolHeight = headZ < road.maxZ ? 0.012 : (pointInRect(headX, headZ, plaza) ? 0.01 : southSidewalk.height + 0.01);
			const poolGeometry = new THREE.PlaneGeometry(poolRadius * 2, poolRadius * 2);
			poolGeometry.rotateX(-Math.PI / 2);
			poolGeometry.translate(headX, poolHeight, headZ);
			poolGeometries.push(poolGeometry);
		}
	});
	bodies.castShadow = true;
	bodies.receiveShadow = true;
	bodies.name = 'lamp-bodies';
	lenses.name = 'lamp-lenses';
	bodies.computeBoundingSphere();
	lenses.computeBoundingSphere();
	group.add(bodies, lenses);

	const poolTexture = createLightPoolTexture(128);
	const poolMaterial = new THREE.MeshBasicMaterial({
		name: 'lamp-light-pools',
		map: poolTexture,
		color: new THREE.Color(0.0, 0.0, 0.0),
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -3,
		polygonOffsetUnits: -8,
		fog: true
	});
	const pools = new THREE.Mesh(mergeGeometries(poolGeometries), poolMaterial);
	poolGeometries.forEach((geometry) => geometry.dispose());
	pools.name = 'lamp-light-pools';
	pools.renderOrder = 2;
	group.add(pools);

	return {
		lightPositions,
		lensMaterial,
		poolMaterial,
		poolMesh: pools,
		materials: [bodyMaterial, lensMaterial, poolMaterial],
		geometries: [lampBodyGeometry, lensGeometry, pools.geometry],
		textures: [poolTexture]
	};
}

// ---------------------------------------------------------------- buildings

function pushQuad(target, corners, normal, uvRect) {
	// corners: bottom-left, bottom-right, top-right, top-left (counter-clockwise seen from outside)
	const order = [0, 1, 2, 0, 2, 3];
	const uvCorners = [
		[uvRect[0], uvRect[1]], [uvRect[2], uvRect[1]], [uvRect[2], uvRect[3]], [uvRect[0], uvRect[3]]
	];
	for (const cornerIndex of order) {
		target.positions.push(corners[cornerIndex].x, corners[cornerIndex].y, corners[cornerIndex].z);
		target.normals.push(normal.x, normal.y, normal.z);
		target.uvs.push(uvCorners[cornerIndex][0], uvCorners[cornerIndex][1]);
	}
}

function toGeometry(buffers) {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
	geometry.computeBoundingSphere();
	return geometry;
}

function buildBuildings(group, quality) {
	const random = createRandomGenerator(4242);
	const isHigh = quality === 'high';
	const bayWidth = 3.2;
	const floorHeight = 3.5;
	const cellsPerTexture = 8;
	const footprints = [];

	// south block across the road
	for (let x = -125; x <= 125; x += 30 + random() * 12) footprints.push({ x, z: -62 - random() * 14, maxHeight: 40 });
	// north block behind the park
	for (let x = -200; x <= 200; x += 34 + random() * 20) footprints.push({ x, z: 110 + random() * 40, maxHeight: 70 });
	// east / west
	for (const side of [-1, 1]) {
		for (let z = -40; z <= 60; z += 40 + random() * 15) footprints.push({ x: side * (150 + random() * 30), z, maxHeight: 55 });
	}
	const selectedFootprints = isHigh ? footprints : footprints.filter((footprint, index) => index % 2 === 0);

	const buffersByStyle = {
		glass: { positions: [], normals: [], uvs: [] },
		concrete: { positions: [], normals: [], uvs: [] },
		roof: { positions: [], normals: [], uvs: [] }
	};
	const textureMeters = bayWidth * cellsPerTexture;
	const textureMetersVertical = floorHeight * cellsPerTexture;

	for (const footprint of selectedFootprints) {
		const style = random() < 0.5 ? 'glass' : 'concrete';
		const bays = 5 + Math.floor(random() * 6);
		const depthBays = 4 + Math.floor(random() * 4);
		const floors = 3 + Math.floor(random() * (footprint.maxHeight / floorHeight - 3));
		const width = bays * bayWidth;
		const depth = depthBays * bayWidth;
		const height = floors * floorHeight + 1.2;
		const yaw = (random() - 0.5) * 0.25;
		const cosYaw = Math.cos(yaw);
		const sinYaw = Math.sin(yaw);
		const toWorld = (localX, localY, localZ) => new THREE.Vector3(
			footprint.x + localX * cosYaw + localZ * sinYaw,
			localY + LAYOUT.grassLevel,
			footprint.z - localX * sinYaw + localZ * cosYaw
		);
		const halfWidth = width / 2;
		const halfDepth = depth / 2;
		const uOffset = Math.floor(random() * cellsPerTexture) / cellsPerTexture;
		const vOffset = Math.floor(random() * cellsPerTexture) / cellsPerTexture;
		const corners = [
			[-halfWidth, halfDepth], [halfWidth, halfDepth], [halfWidth, -halfDepth], [-halfWidth, -halfDepth]
		];
		const target = buffersByStyle[style];
		let perimeterU = uOffset;
		for (let sideIndex = 0; sideIndex < 4; sideIndex++) {
			const [startX, startZ] = corners[sideIndex];
			const [endX, endZ] = corners[(sideIndex + 1) % 4];
			const sideLength = Math.hypot(endX - startX, endZ - startZ);
			const bottomLeft = toWorld(startX, 0, startZ);
			const bottomRight = toWorld(endX, 0, endZ);
			const topRight = toWorld(endX, height, endZ);
			const topLeft = toWorld(startX, height, startZ);
			const edge = new THREE.Vector3().subVectors(bottomRight, bottomLeft);
			const normal = new THREE.Vector3(edge.z, 0, -edge.x).normalize();
			// ground floor (1.2 m plinth) maps to a band below the first window row
			pushQuad(target, [bottomLeft, bottomRight, topRight, topLeft], normal, [
				perimeterU, vOffset - 1.2 / textureMetersVertical,
				perimeterU + sideLength / textureMeters, vOffset + (height - 1.2) / textureMetersVertical
			]);
			perimeterU += sideLength / textureMeters;
		}
		// roof
		const roofCorners = corners.map(([localX, localZ]) => toWorld(localX, height, localZ));
		pushQuad(buffersByStyle.roof, [roofCorners[0], roofCorners[1], roofCorners[2], roofCorners[3]], new THREE.Vector3(0, 1, 0), [0, 0, width / 6, depth / 6]);
	}

	const glassFacade = createFacadeTextures(isHigh ? 512 : 256, 'glass', 7, cellsPerTexture);
	const concreteFacade = createFacadeTextures(isHigh ? 512 : 256, 'concrete', 13, cellsPerTexture);
	const roofTextures = createConcreteTextures(64, 1, 99);

	const makeFacadeMaterial = (textures, name) => new THREE.MeshStandardMaterial({
		name,
		map: textures.map,
		emissiveMap: textures.emissiveMap,
		emissive: new THREE.Color(1, 1, 1),
		emissiveIntensity: 0,
		roughnessMap: textures.roughnessMap,
		metalnessMap: textures.roughnessMap,
		roughness: 1,
		metalness: 1
	});
	const glassMaterial = makeFacadeMaterial(glassFacade, 'facade-glass');
	const concreteMaterial = makeFacadeMaterial(concreteFacade, 'facade-concrete');
	const roofMaterial = new THREE.MeshStandardMaterial({ name: 'roof', map: roofTextures.map, color: new THREE.Color(0.55, 0.55, 0.55), roughness: 0.95 });

	const meshes = [
		new THREE.Mesh(toGeometry(buffersByStyle.glass), glassMaterial),
		new THREE.Mesh(toGeometry(buffersByStyle.concrete), concreteMaterial),
		new THREE.Mesh(toGeometry(buffersByStyle.roof), roofMaterial)
	];
	meshes.forEach((mesh, index) => {
		mesh.name = ['buildings-glass', 'buildings-concrete', 'buildings-roofs'][index];
		group.add(mesh);
	});
	return {
		facadeMaterials: [glassMaterial, concreteMaterial],
		materials: [glassMaterial, concreteMaterial, roofMaterial],
		geometries: meshes.map((mesh) => mesh.geometry),
		textures: [...Object.values(glassFacade), ...Object.values(concreteFacade), ...Object.values(roofTextures)]
	};
}

// ---------------------------------------------------------------- distant hills

function buildHills(group, quality) {
	const isHigh = quality === 'high';
	const angularSegments = isHigh ? 160 : 64;
	const radialSegments = isHigh ? 14 : 7;
	const innerRadius = 420;
	const outerRadius = 1250;
	const positions = [];
	const colors = [];
	const indices = [];
	const random = createRandomGenerator(77);
	const harmonics = [];
	for (let index = 0; index < 7; index++) {
		harmonics.push({ frequency: 2 + Math.floor(random() * 3) * (index + 1), phase: random() * Math.PI * 2, amplitude: 1 / (index + 1.3) });
	}
	const ridgeHeight = (angle, radiusFraction) => {
		let value = 0;
		for (const harmonic of harmonics) value += Math.sin(angle * harmonic.frequency + harmonic.phase + radiusFraction * 2.0) * harmonic.amplitude;
		return value;
	};
	const lowColor = new THREE.Color(0.16, 0.22, 0.1);
	const highColor = new THREE.Color(0.26, 0.29, 0.18);
	const vertexColor = new THREE.Color();
	for (let ring = 0; ring <= radialSegments; ring++) {
		const radiusFraction = ring / radialSegments;
		const radius = innerRadius + (outerRadius - innerRadius) * Math.pow(radiusFraction, 0.8);
		const envelope = THREE.MathUtils.smoothstep(radiusFraction, 0.0, 0.45);
		for (let segment = 0; segment <= angularSegments; segment++) {
			const angle = (segment / angularSegments) * Math.PI * 2;
			const height = Math.max(0, (ridgeHeight(angle, radiusFraction) * 0.5 + 0.6) * (40 + radiusFraction * 70) * envelope);
			positions.push(Math.cos(angle) * radius, LAYOUT.grassLevel - 0.3 + height, Math.sin(angle) * radius);
			vertexColor.copy(lowColor).lerp(highColor, THREE.MathUtils.clamp(height / 110, 0, 1));
			colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
		}
	}
	const rowLength = angularSegments + 1;
	for (let ring = 0; ring < radialSegments; ring++) {
		for (let segment = 0; segment < angularSegments; segment++) {
			const current = ring * rowLength + segment;
			const next = current + rowLength;
			indices.push(current, current + 1, next, current + 1, next + 1, next);
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	const material = new THREE.MeshStandardMaterial({ name: 'hills', vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
	const hills = new THREE.Mesh(geometry, material);
	hills.name = 'hills';
	group.add(hills);
	return { materials: [material], geometries: [geometry] };
}

// ---------------------------------------------------------------- entry point

export function buildScenery({ quality, anisotropy }) {
	const group = new THREE.Group();
	group.name = 'environment-scenery';
	const surfaces = createSurfaceMaterials(quality, anisotropy);
	const { planters } = buildGround(group, surfaces);
	buildMarkings(group, surfaces);
	const trees = buildTrees(group, quality, anisotropy, planters);
	const lamps = buildStreetLamps(group, quality);
	const buildings = buildBuildings(group, quality);
	const hills = buildHills(group, quality);

	const ownedMaterials = [
		surfaces.asphaltMaterial, surfaces.roadMaterial, surfaces.grassMaterial, surfaces.paverMaterial,
		surfaces.concreteMaterial, surfaces.whitePaintMaterial, surfaces.yellowPaintMaterial,
		...trees.materials, ...lamps.materials, ...buildings.materials, ...hills.materials
	];
	const ownedTextures = [...surfaces.textures, ...trees.textures, ...lamps.textures, ...buildings.textures];

	return {
		group,
		lamps,
		facadeMaterials: buildings.facadeMaterials,
		dispose() {
			group.traverse((object) => {
				if (object.geometry) object.geometry.dispose();
				if (object.isInstancedMesh) object.dispose();
			});
			ownedMaterials.forEach((material) => material.dispose());
			ownedTextures.forEach((texture) => texture && texture.dispose && texture.dispose());
		}
	};
}
