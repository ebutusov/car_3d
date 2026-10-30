// Turns parametric surfaces into meshes: grid patches with per-cell material regions,
// offset (inner) shells, edge ribbons that give opening panels thickness, flat end faces
// and decals that are projected onto existing meshes by raycasting.

import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

// BVH-accelerated raycasting for the given meshes (used while projecting decals at build time).
export function accelerateRaycasts(meshes) {
	for (const mesh of meshes) {
		if (!mesh.geometry.boundsTree) mesh.geometry.computeBoundsTree();
		mesh.raycast = acceleratedRaycast;
	}
}

export function releaseRaycastAcceleration(meshes) {
	for (const mesh of meshes) {
		mesh.geometry.disposeBoundsTree();
		mesh.raycast = THREE.Mesh.prototype.raycast;
	}
}

// Sorted, de-duplicated samples in [min, max] that always include the given break values.
export function buildSamples(min, max, count, breaks = []) {
	const values = [];
	for (let index = 0; index <= count; index++) values.push(min + (max - min) * (index / count));
	for (const value of breaks) if (value >= min - 1e-9 && value <= max + 1e-9) values.push(value);
	values.sort((a, b) => a - b);
	const unique = [];
	for (const value of values) {
		if (!unique.length || Math.abs(value - unique[unique.length - 1]) > 1e-5) unique.push(value);
	}
	return unique;
}

const derivativeA = new THREE.Vector3();
const derivativeB = new THREE.Vector3();
const pointPlus = new THREE.Vector3();
const pointMinus = new THREE.Vector3();

// Outward surface normal from finite differences; pointFunction(a, b, target).
export function surfaceNormal(pointFunction, a, b, target, orientation = 1) {
	const epsilon = 1e-4;
	pointFunction(a + epsilon, b, pointPlus);
	pointFunction(a - epsilon, b, pointMinus);
	derivativeA.subVectors(pointPlus, pointMinus);
	pointFunction(a, b + epsilon, pointPlus);
	pointFunction(a, b - epsilon, pointMinus);
	derivativeB.subVectors(pointPlus, pointMinus);
	target.crossVectors(derivativeA, derivativeB);
	if (target.lengthSq() < 1e-20) return target.set(0, 1, 0);
	return target.normalize().multiplyScalar(orientation);
}

// Evaluates a grid once so several meshes (outer skin, inner shell, ribbons) can share it.
export function sampleGrid(pointFunction, aValues, bValues, orientation = 1) {
	const rows = aValues.length;
	const columns = bValues.length;
	const positions = new Float32Array(rows * columns * 3);
	const normals = new Float32Array(rows * columns * 3);
	const point = new THREE.Vector3();
	const normal = new THREE.Vector3();
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			const offset = (row * columns + column) * 3;
			pointFunction(aValues[row], bValues[column], point);
			surfaceNormal(pointFunction, aValues[row], bValues[column], normal, orientation);
			positions[offset] = point.x;
			positions[offset + 1] = point.y;
			positions[offset + 2] = point.z;
			normals[offset] = normal.x;
			normals[offset + 1] = normal.y;
			normals[offset + 2] = normal.z;
		}
	}
	return { aValues, bValues, rows, columns, positions, normals, orientation };
}

// Builds a mesh geometry from a sampled grid. classify(aMid, bMid) returns a material key or null.
// offset moves vertices along the normal (negative = inward). Returns { geometry, materialKeys }.
export function gridGeometry(grid, classify, { offset = 0, flipWinding = false } = {}) {
	const { aValues, bValues, rows, columns } = grid;
	const positions = new Float32Array(grid.positions.length);
	for (let index = 0; index < positions.length; index++) {
		positions[index] = grid.positions[index] + grid.normals[index] * offset;
	}
	const uvs = new Float32Array(rows * columns * 2);
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			const index = (row * columns + column) * 2;
			uvs[index] = aValues[row];
			uvs[index + 1] = bValues[column];
		}
	}
	// Descending sample arrays flip the parametric orientation relative to the grid order.
	const descending = (aValues[1] - aValues[0]) * (bValues[1] - bValues[0]) < 0;
	const forward = (grid.orientation > 0) !== flipWinding !== descending;
	const indicesByKey = new Map();
	for (let row = 0; row < rows - 1; row++) {
		const aMid = (aValues[row] + aValues[row + 1]) / 2;
		for (let column = 0; column < columns - 1; column++) {
			const key = classify(aMid, (bValues[column] + bValues[column + 1]) / 2);
			if (!key) continue;
			if (!indicesByKey.has(key)) indicesByKey.set(key, []);
			const indices = indicesByKey.get(key);
			const corner = row * columns + column;
			const nextRow = corner + columns;
			if (forward) {
				indices.push(corner, nextRow, corner + 1, corner + 1, nextRow, nextRow + 1);
			} else {
				indices.push(corner, corner + 1, nextRow, corner + 1, nextRow + 1, nextRow);
			}
		}
	}
	return assembleGroups(positions, grid.normals.slice(), uvs, indicesByKey);
}

function assembleGroups(positions, normals, uvs, indicesByKey) {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
	if (uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
	const allIndices = [];
	const materialKeys = [];
	for (const [key, indices] of indicesByKey) {
		geometry.addGroup(allIndices.length, indices.length, materialKeys.length);
		materialKeys.push(key);
		for (const index of indices) allIndices.push(index);
	}
	geometry.setIndex(allIndices);
	return { geometry, materialKeys };
}

// Side walls joining the outer grid border to the same border offset inward by thickness.
export function gridRibbonGeometry(grid, thickness) {
	const { rows, columns } = grid;
	const border = [];
	for (let column = 0; column < columns; column++) border.push(column);
	for (let row = 1; row < rows; row++) border.push(row * columns + columns - 1);
	for (let column = columns - 2; column >= 0; column--) border.push((rows - 1) * columns + column);
	for (let row = rows - 2; row > 0; row--) border.push(row * columns);
	border.push(border[0]);
	const positions = [];
	const indices = [];
	for (let index = 0; index < border.length; index++) {
		const vertex = border[index] * 3;
		for (const depth of [0, -thickness]) {
			positions.push(
				grid.positions[vertex] + grid.normals[vertex] * depth,
				grid.positions[vertex + 1] + grid.normals[vertex + 1] * depth,
				grid.positions[vertex + 2] + grid.normals[vertex + 2] * depth,
			);
		}
		if (index > 0) {
			const current = index * 2;
			const previous = current - 2;
			indices.push(previous, previous + 1, current, current, previous + 1, current + 1);
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}

// Flat polygon in a plane x = constant. outline: Vector2(z, y) list; facing: +1 faces +X, -1 faces -X.
export function planarPolygonGeometry(outline, planeX, facing) {
	const contour = THREE.ShapeUtils.isClockWise(outline) ? outline.slice().reverse() : outline;
	const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
	const positions = [];
	const normals = [];
	const uvs = [];
	for (const point of contour) {
		positions.push(planeX, point.y, point.x);
		normals.push(facing, 0, 0);
		uvs.push(point.x, point.y);
	}
	const indices = [];
	for (const [first, second, third] of triangles) {
		// Counter-clockwise in (z, y) faces -X once mapped to (x, y, z), so flip for +X.
		if (facing > 0) indices.push(first, third, second);
		else indices.push(first, second, third);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
	geometry.setIndex(indices);
	return geometry;
}

// Sutherland–Hodgman clip of a polygon against an axis-aligned rectangle (in Vector2 space).
export function clipPolygonToRectangle(polygon, minX, maxX, minY, maxY) {
	const planes = [
		[(point) => point.x - minX, 'x', minX],
		[(point) => maxX - point.x, 'x', maxX],
		[(point) => point.y - minY, 'y', minY],
		[(point) => maxY - point.y, 'y', maxY],
	];
	let output = polygon;
	for (const [distance] of planes) {
		const input = output;
		output = [];
		for (let index = 0; index < input.length; index++) {
			const current = input[index];
			const previous = input[(index + input.length - 1) % input.length];
			const currentDistance = distance(current);
			const previousDistance = distance(previous);
			if (currentDistance >= 0) {
				if (previousDistance < 0) output.push(intersect(previous, current, previousDistance, currentDistance));
				output.push(current);
			} else if (previousDistance >= 0) {
				output.push(intersect(previous, current, previousDistance, currentDistance));
			}
		}
		if (!output.length) return [];
	}
	return output;
}

function intersect(start, end, startDistance, endDistance) {
	const t = startDistance / (startDistance - endDistance);
	return new THREE.Vector2().lerpVectors(start, end, t);
}

// Decal outline helpers: map grid coordinates (a, b) ∈ [0, 1]² to projection-plane coordinates (u, v).
export function rectangleShape(uRange, vRange) {
	return (a, b) => [THREE.MathUtils.lerp(uRange[0], uRange[1], a), THREE.MathUtils.lerp(vRange[0], vRange[1], b)];
}

// Superellipse ("squircle") outline, sampled on a polar grid so its edge stays smooth.
// warp(x, y) may skew or taper the local offsets before they are added to the centre.
export function roundedShape(center, halfSize, { exponent = 4, warp = null } = {}) {
	return (a, b) => {
		const angle = a * Math.PI * 2;
		const cosine = Math.cos(angle);
		const sine = Math.sin(angle);
		let x = halfSize[0] * Math.sign(cosine) * Math.pow(Math.abs(cosine), 2 / exponent) * b;
		let y = halfSize[1] * Math.sign(sine) * Math.pow(Math.abs(sine), 2 / exponent) * b;
		if (warp) [x, y] = warp(x, y);
		return [center[0] + x, center[1] + y];
	};
}

// Projects a grid of rays onto target meshes and builds a decal that hugs the surface.
// shape(a, b) gives the projection-plane coordinates (u, v) of grid point (a, b) ∈ [0, 1]²;
// frame(u, v) returns { origin, direction } for that point in the targets' world space.
// Cells are grouped by the hit object so each decal piece can be re-parented to the moving
// part it sits on. Returns [{ object, geometry }] in world space.
// uvMode 'plane' uses the projection-plane coordinates (metres) as UVs, 'grid' uses (a, b).
export function projectDecal({ targets, frame, shape, uSteps, vSteps, offset = 0.003, uvMode = 'plane' }) {
	const raycaster = new THREE.Raycaster();
	const hits = [];
	const normalMatrix = new THREE.Matrix3();
	for (let row = 0; row <= vSteps; row++) {
		const hitRow = [];
		for (let column = 0; column <= uSteps; column++) {
			const [u, v] = shape(column / uSteps, row / vSteps);
			const { origin, direction } = frame(u, v);
			raycaster.set(origin, direction);
			const intersection = raycaster.intersectObjects(targets, false)[0];
			if (!intersection || !intersection.face) {
				hitRow.push(null);
				continue;
			}
			normalMatrix.getNormalMatrix(intersection.object.matrixWorld);
			const normal = intersection.face.normal.clone().applyMatrix3(normalMatrix).normalize();
			if (normal.dot(direction) > 0) normal.negate();
			hitRow.push({
				object: intersection.object,
				position: intersection.point.clone().addScaledVector(normal, offset),
				normal,
				u: uvMode === 'grid' ? column / uSteps : u,
				v: uvMode === 'grid' ? row / vSteps : v,
			});
		}
		hits.push(hitRow);
	}
	const pieces = new Map();
	const diagonalOne = new THREE.Vector3();
	const diagonalTwo = new THREE.Vector3();
	const faceNormal = new THREE.Vector3();
	for (let row = 0; row < vSteps; row++) {
		for (let column = 0; column < uSteps; column++) {
			const corners = [hits[row][column], hits[row][column + 1], hits[row + 1][column], hits[row + 1][column + 1]];
			if (corners.some((corner) => !corner)) continue;
			if (corners.some((corner) => corner.object !== corners[0].object)) continue;
			if (!pieces.has(corners[0].object)) pieces.set(corners[0].object, { positions: [], normals: [], uvs: [] });
			const piece = pieces.get(corners[0].object);
			const [bottomLeft, bottomRight, topLeft, topRight] = corners;
			// Wind each quad so its geometric normal agrees with the surface normal (diagonals stay
			// valid for the collapsed quads at the centre of polar grids).
			diagonalOne.subVectors(topRight.position, bottomLeft.position);
			diagonalTwo.subVectors(topLeft.position, bottomRight.position);
			faceNormal.crossVectors(diagonalOne, diagonalTwo);
			const order = faceNormal.dot(bottomLeft.normal) >= 0
				? [bottomLeft, bottomRight, topLeft, topLeft, bottomRight, topRight]
				: [bottomLeft, topLeft, bottomRight, topLeft, topRight, bottomRight];
			for (const corner of order) {
				piece.positions.push(corner.position.x, corner.position.y, corner.position.z);
				piece.normals.push(corner.normal.x, corner.normal.y, corner.normal.z);
				piece.uvs.push(corner.u, corner.v);
			}
		}
	}
	const result = [];
	for (const [object, piece] of pieces) {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(piece.positions, 3));
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(piece.normals, 3));
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(piece.uvs, 2));
		result.push({ object, geometry });
	}
	return result;
}

// Single ray hit against targets, returns { point, normal, object } or null.
export function castOnto(targets, origin, direction) {
	const raycaster = new THREE.Raycaster(origin, direction.clone().normalize());
	const intersection = raycaster.intersectObjects(targets, false)[0];
	if (!intersection || !intersection.face) return null;
	const normal = intersection.face.normal.clone()
		.applyMatrix3(new THREE.Matrix3().getNormalMatrix(intersection.object.matrixWorld)).normalize();
	if (normal.dot(direction) > 0) normal.negate();
	return { point: intersection.point.clone(), normal, object: intersection.object };
}
