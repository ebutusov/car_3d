// Procedural textures for the environment (no external assets).
// Every generator works on a square, seamlessly tiling canvas.
import * as THREE from 'three';

// ---------------------------------------------------------------- helpers

export function createRandomGenerator(seed = 1) {
	let state = seed >>> 0 || 1;
	return function nextRandom() {
		// mulberry32
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed = state;
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}

function smootherStep(value) {
	return value * value * value * (value * (value * 6 - 15) + 10);
}

// Tileable fractal value noise, returns Float32Array(size*size) in roughly [0, 1].
export function createFbmField(size, { baseCells = 4, octaves = 5, persistence = 0.5, seed = 1 } = {}) {
	const random = createRandomGenerator(seed);
	const field = new Float32Array(size * size);
	let amplitude = 1;
	let amplitudeSum = 0;
	for (let octave = 0; octave < octaves; octave++) {
		const cells = baseCells << octave;
		const lattice = new Float32Array(cells * cells);
		for (let index = 0; index < lattice.length; index++) lattice[index] = random();
		const cellScale = cells / size;
		for (let pixelY = 0; pixelY < size; pixelY++) {
			const latticeY = pixelY * cellScale;
			const y0 = Math.floor(latticeY);
			const fractionY = smootherStep(latticeY - y0);
			const rowA = (y0 % cells) * cells;
			const rowB = ((y0 + 1) % cells) * cells;
			for (let pixelX = 0; pixelX < size; pixelX++) {
				const latticeX = pixelX * cellScale;
				const x0 = Math.floor(latticeX);
				const fractionX = smootherStep(latticeX - x0);
				const columnA = x0 % cells;
				const columnB = (x0 + 1) % cells;
				const top = lattice[rowA + columnA] + (lattice[rowA + columnB] - lattice[rowA + columnA]) * fractionX;
				const bottom = lattice[rowB + columnA] + (lattice[rowB + columnB] - lattice[rowB + columnA]) * fractionX;
				field[pixelY * size + pixelX] += (top + (bottom - top) * fractionY) * amplitude;
			}
		}
		amplitudeSum += amplitude;
		amplitude *= persistence;
	}
	for (let index = 0; index < field.length; index++) field[index] /= amplitudeSum;
	return field;
}

function createCanvas(size) {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	return canvas;
}

function finishTexture(canvas, { colorSpace = THREE.NoColorSpace, anisotropy = 8 } = {}) {
	const texture = new THREE.CanvasTexture(canvas);
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.colorSpace = colorSpace;
	texture.anisotropy = anisotropy;
	texture.generateMipmaps = true;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.needsUpdate = true;
	return texture;
}

// Builds a tangent-space normal map from a tiling height field.
export function createNormalMapFromHeight(heightField, size, strength = 2, anisotropy = 8) {
	const canvas = createCanvas(size);
	const context = canvas.getContext('2d');
	const imageData = context.createImageData(size, size);
	const pixels = imageData.data;
	for (let pixelY = 0; pixelY < size; pixelY++) {
		const upRow = ((pixelY - 1 + size) % size) * size;
		const downRow = ((pixelY + 1) % size) * size;
		const row = pixelY * size;
		for (let pixelX = 0; pixelX < size; pixelX++) {
			const left = (pixelX - 1 + size) % size;
			const right = (pixelX + 1) % size;
			const slopeX = (heightField[row + right] - heightField[row + left]) * strength;
			// canvas Y grows downward while texture V grows upward
			const slopeY = (heightField[upRow + pixelX] - heightField[downRow + pixelX]) * strength;
			const inverseLength = 1 / Math.sqrt(slopeX * slopeX + slopeY * slopeY + 1);
			const offset = (row + pixelX) * 4;
			pixels[offset] = (-slopeX * inverseLength * 0.5 + 0.5) * 255;
			pixels[offset + 1] = (-slopeY * inverseLength * 0.5 + 0.5) * 255;
			pixels[offset + 2] = (inverseLength * 0.5 + 0.5) * 255;
			pixels[offset + 3] = 255;
		}
	}
	context.putImageData(imageData, 0, 0);
	return finishTexture(canvas, { anisotropy });
}

function writeColorAndRoughness(size, sampleFunction, anisotropy) {
	const colorCanvas = createCanvas(size);
	const roughnessCanvas = createCanvas(size);
	const colorContext = colorCanvas.getContext('2d');
	const roughnessContext = roughnessCanvas.getContext('2d');
	const colorData = colorContext.createImageData(size, size);
	const roughnessData = roughnessContext.createImageData(size, size);
	const heightField = new Float32Array(size * size);
	const sample = { red: 0, green: 0, blue: 0, roughness: 1, metalness: 0, height: 0 };
	for (let pixelIndex = 0; pixelIndex < size * size; pixelIndex++) {
		sampleFunction(pixelIndex % size, Math.floor(pixelIndex / size), pixelIndex, sample);
		const offset = pixelIndex * 4;
		colorData.data[offset] = sample.red;
		colorData.data[offset + 1] = sample.green;
		colorData.data[offset + 2] = sample.blue;
		colorData.data[offset + 3] = 255;
		roughnessData.data[offset] = 255;
		roughnessData.data[offset + 1] = sample.roughness * 255;
		roughnessData.data[offset + 2] = sample.metalness * 255;
		roughnessData.data[offset + 3] = 255;
		heightField[pixelIndex] = sample.height;
	}
	colorContext.putImageData(colorData, 0, 0);
	roughnessContext.putImageData(roughnessData, 0, 0);
	return {
		map: finishTexture(colorCanvas, { colorSpace: THREE.SRGBColorSpace, anisotropy }),
		roughnessMap: finishTexture(roughnessCanvas, { anisotropy }),
		heightField
	};
}

// ---------------------------------------------------------------- surfaces

// Asphalt: dark binder with light/dark aggregate speckles, tar-smoothed patches.
export function createAsphaltTextures(size, anisotropy, seed = 11) {
	const largeNoise = createFbmField(size, { baseCells: 4, octaves: 4, seed });
	const fineNoise = createFbmField(size, { baseCells: 64, octaves: 3, seed: seed + 1 });
	const random = createRandomGenerator(seed + 2);
	const speckle = new Float32Array(size * size);
	const speckleCount = size * size * 0.06;
	for (let index = 0; index < speckleCount; index++) {
		const centerX = Math.floor(random() * size);
		const centerY = Math.floor(random() * size);
		const brightness = random() < 0.65 ? random() * 0.9 + 0.3 : -(random() * 0.6);
		const radius = random() < 0.85 ? 0 : 1;
		for (let offsetY = -radius; offsetY <= radius; offsetY++) {
			for (let offsetX = -radius; offsetX <= radius; offsetX++) {
				const wrappedX = (centerX + offsetX + size) % size;
				const wrappedY = (centerY + offsetY + size) % size;
				speckle[wrappedY * size + wrappedX] = brightness;
			}
		}
	}
	const textures = writeColorAndRoughness(size, (pixelX, pixelY, pixelIndex, sample) => {
		const large = largeNoise[pixelIndex];
		const fine = fineNoise[pixelIndex];
		const grain = speckle[pixelIndex];
		const tarPatch = THREE.MathUtils.smoothstep(large, 0.55, 0.7);
		let base = 62 + (fine - 0.5) * 34 + (large - 0.5) * 22 - tarPatch * 10;
		base += grain * 42;
		sample.red = THREE.MathUtils.clamp(base + 1, 0, 255);
		sample.green = THREE.MathUtils.clamp(base + 1, 0, 255);
		sample.blue = THREE.MathUtils.clamp(base + 3, 0, 255);
		sample.roughness = THREE.MathUtils.clamp(0.9 - tarPatch * 0.22 + (fine - 0.5) * 0.12 - Math.max(grain, 0) * 0.08, 0.45, 1);
		sample.height = fine * 0.6 + Math.abs(grain) * 0.9;
	}, anisotropy);
	textures.normalMap = createNormalMapFromHeight(textures.heightField, size, 2.2, anisotropy);
	delete textures.heightField;
	return textures;
}

// Grass seen from above: mixed greens with dry patches and blade-scale noise.
export function createGrassTextures(size, anisotropy, seed = 21) {
	const largeNoise = createFbmField(size, { baseCells: 3, octaves: 4, seed });
	const bladeNoise = createFbmField(size, { baseCells: 96, octaves: 2, seed: seed + 1 });
	const clumpNoise = createFbmField(size, { baseCells: 16, octaves: 3, seed: seed + 2 });
	const textures = writeColorAndRoughness(size, (pixelX, pixelY, pixelIndex, sample) => {
		const large = largeNoise[pixelIndex];
		const blade = bladeNoise[pixelIndex];
		const clump = clumpNoise[pixelIndex];
		const dryness = THREE.MathUtils.smoothstep(large, 0.52, 0.75) * 0.6;
		const shade = 0.65 + blade * 0.55 + (clump - 0.5) * 0.35;
		sample.red = THREE.MathUtils.clamp((48 + dryness * 60) * shade, 0, 255);
		sample.green = THREE.MathUtils.clamp((78 + dryness * 22) * shade, 0, 255);
		sample.blue = THREE.MathUtils.clamp((30 + dryness * 10) * shade, 0, 255);
		sample.roughness = 0.92 + blade * 0.08;
		sample.height = blade * 0.8 + clump * 0.4;
	}, anisotropy);
	textures.normalMap = createNormalMapFromHeight(textures.heightField, size, 3, anisotropy);
	delete textures.heightField;
	return textures;
}

// Concrete paver slabs. The texture covers tilesPerSide x tilesPerSide slabs.
export function createPaverTextures(size, anisotropy, tilesPerSide = 4, seed = 31) {
	const fineNoise = createFbmField(size, { baseCells: 48, octaves: 3, seed });
	const stainNoise = createFbmField(size, { baseCells: 4, octaves: 4, seed: seed + 1 });
	const random = createRandomGenerator(seed + 2);
	const tileTints = [];
	for (let index = 0; index < tilesPerSide * tilesPerSide; index++) tileTints.push((random() - 0.5) * 18);
	const tileSize = size / tilesPerSide;
	const jointHalfWidth = Math.max(1, size / 512 * 2.2);
	const textures = writeColorAndRoughness(size, (pixelX, pixelY, pixelIndex, sample) => {
		const tileX = Math.floor(pixelX / tileSize);
		const tileY = Math.floor(pixelY / tileSize);
		const insideX = pixelX - tileX * tileSize;
		const insideY = pixelY - tileY * tileSize;
		const edgeDistance = Math.min(insideX, insideY, tileSize - insideX, tileSize - insideY);
		const jointFactor = 1 - THREE.MathUtils.smoothstep(edgeDistance, jointHalfWidth * 0.5, jointHalfWidth * 1.6);
		const fine = fineNoise[pixelIndex];
		const stain = stainNoise[pixelIndex];
		let base = 150 + tileTints[tileY * tilesPerSide + tileX] + (fine - 0.5) * 26 - THREE.MathUtils.smoothstep(stain, 0.55, 0.8) * 24;
		base = base * (1 - jointFactor * 0.55);
		sample.red = THREE.MathUtils.clamp(base + 2, 0, 255);
		sample.green = THREE.MathUtils.clamp(base, 0, 255);
		sample.blue = THREE.MathUtils.clamp(base - 4, 0, 255);
		sample.roughness = 0.82 + fine * 0.15 + jointFactor * 0.05;
		sample.height = (1 - jointFactor) * 0.9 + fine * 0.25;
	}, anisotropy);
	textures.normalMap = createNormalMapFromHeight(textures.heightField, size, 2.5, anisotropy);
	delete textures.heightField;
	return textures;
}

// Plain cast concrete (curbs, lamp bases, roofs).
export function createConcreteTextures(size, anisotropy, seed = 41) {
	const fineNoise = createFbmField(size, { baseCells: 32, octaves: 4, seed });
	const stainNoise = createFbmField(size, { baseCells: 3, octaves: 4, seed: seed + 1 });
	const textures = writeColorAndRoughness(size, (pixelX, pixelY, pixelIndex, sample) => {
		const fine = fineNoise[pixelIndex];
		const stain = stainNoise[pixelIndex];
		const base = 168 + (fine - 0.5) * 30 - THREE.MathUtils.smoothstep(stain, 0.5, 0.85) * 30;
		sample.red = THREE.MathUtils.clamp(base, 0, 255);
		sample.green = THREE.MathUtils.clamp(base - 1, 0, 255);
		sample.blue = THREE.MathUtils.clamp(base - 3, 0, 255);
		sample.roughness = 0.85 + fine * 0.12;
		sample.height = fine;
	}, anisotropy);
	textures.normalMap = createNormalMapFromHeight(textures.heightField, size, 1.5, anisotropy);
	delete textures.heightField;
	return textures;
}

// Worn road paint: white mask with abrasion; used as a color multiplier for markings.
export function createPaintWearTexture(size, anisotropy, seed = 51) {
	const wearNoise = createFbmField(size, { baseCells: 8, octaves: 5, seed });
	const canvas = createCanvas(size);
	const context = canvas.getContext('2d');
	const imageData = context.createImageData(size, size);
	for (let pixelIndex = 0; pixelIndex < size * size; pixelIndex++) {
		const wear = THREE.MathUtils.smoothstep(wearNoise[pixelIndex], 0.3, 0.62);
		const value = 120 + wear * 135;
		const offset = pixelIndex * 4;
		imageData.data[offset] = value;
		imageData.data[offset + 1] = value;
		imageData.data[offset + 2] = value;
		imageData.data[offset + 3] = 255;
	}
	context.putImageData(imageData, 0, 0);
	return finishTexture(canvas, { colorSpace: THREE.SRGBColorSpace, anisotropy });
}

// Bark: vertical streaks.
export function createBarkTextures(size, anisotropy, seed = 61) {
	const streakNoise = createFbmField(size, { baseCells: 6, octaves: 4, seed });
	const fineNoise = createFbmField(size, { baseCells: 32, octaves: 3, seed: seed + 1 });
	const textures = writeColorAndRoughness(size, (pixelX, pixelY, pixelIndex, sample) => {
		// stretch: sample the streak field compressed vertically
		const stretchedIndex = (Math.floor(pixelY / 8) * 8 % size) * size + pixelX;
		const streak = streakNoise[stretchedIndex] * 0.6 + fineNoise[pixelIndex] * 0.4;
		const base = 52 + streak * 50;
		sample.red = base + 6;
		sample.green = base;
		sample.blue = base - 8;
		sample.roughness = 0.95;
		sample.height = streak;
	}, anisotropy);
	textures.normalMap = createNormalMapFromHeight(textures.heightField, size, 4, anisotropy);
	delete textures.heightField;
	return textures;
}

// Leaf clumps: speckled light/dark (used with vertex colors).
export function createFoliageTextures(size, anisotropy, seed = 71) {
	const leafNoise = createFbmField(size, { baseCells: 24, octaves: 3, persistence: 0.65, seed });
	const clusterNoise = createFbmField(size, { baseCells: 6, octaves: 3, seed: seed + 1 });
	const textures = writeColorAndRoughness(size, (pixelX, pixelY, pixelIndex, sample) => {
		const leaf = leafNoise[pixelIndex];
		const cluster = clusterNoise[pixelIndex];
		const gap = 1 - THREE.MathUtils.smoothstep(leaf, 0.22, 0.32);
		const value = THREE.MathUtils.clamp(140 + (leaf - 0.5) * 220 + (cluster - 0.5) * 70 - gap * 90, 20, 255);
		sample.red = value;
		sample.green = value;
		sample.blue = value;
		sample.roughness = 0.75 + (1 - leaf) * 0.2;
		sample.height = leaf * 0.8 + cluster * 0.4;
	}, anisotropy);
	textures.normalMap = createNormalMapFromHeight(textures.heightField, size, 5, anisotropy);
	delete textures.heightField;
	return textures;
}

// Building facades. One texture holds a grid of cellsX x cellsY window bays.
// style: 'glass' (curtain wall) or 'concrete' (punched windows).
// Returns { map, emissiveMap, roughnessMap (G = roughness, B = metalness) }.
export function createFacadeTextures(size, style, seed = 81, cellsPerSide = 8) {
	const random = createRandomGenerator(seed);
	const colorCanvas = createCanvas(size);
	const emissiveCanvas = createCanvas(size);
	const surfaceCanvas = createCanvas(size);
	const colorContext = colorCanvas.getContext('2d');
	const emissiveContext = emissiveCanvas.getContext('2d');
	const surfaceContext = surfaceCanvas.getContext('2d');
	const cellSize = size / cellsPerSide;
	const isGlass = style === 'glass';
	const wallColor = isGlass ? '#7c8288' : (random() < 0.5 ? '#c9c3b8' : '#a9a49c');

	colorContext.fillStyle = wallColor;
	colorContext.fillRect(0, 0, size, size);
	emissiveContext.fillStyle = '#000';
	emissiveContext.fillRect(0, 0, size, size);
	// wall: rough (G ~0.85), non metal
	surfaceContext.fillStyle = 'rgb(255, 216, 0)';
	surfaceContext.fillRect(0, 0, size, size);

	const windowInsetX = isGlass ? cellSize * 0.06 : cellSize * 0.2;
	const windowInsetTop = isGlass ? cellSize * 0.08 : cellSize * 0.22;
	const windowInsetBottom = isGlass ? cellSize * 0.16 : cellSize * 0.3;
	for (let cellY = 0; cellY < cellsPerSide; cellY++) {
		// whole floors tend to be lit or dark together
		const floorOccupancy = random();
		for (let cellX = 0; cellX < cellsPerSide; cellX++) {
			const left = cellX * cellSize + windowInsetX;
			const top = cellY * cellSize + windowInsetTop;
			const width = cellSize - windowInsetX * 2;
			const height = cellSize - windowInsetTop - windowInsetBottom;
			const glassShade = isGlass ? 40 + random() * 22 : 34 + random() * 18;
			colorContext.fillStyle = `rgb(${glassShade * 0.8}, ${glassShade * 0.92}, ${glassShade * 1.1})`;
			colorContext.fillRect(left, top, width, height);
			// glass: smooth and partly metallic so it reflects the sky
			surfaceContext.fillStyle = `rgb(255, ${isGlass ? 25 : 40}, ${isGlass ? 200 : 120})`;
			surfaceContext.fillRect(left, top, width, height);
			if (random() < floorOccupancy * 0.75) {
				const warmth = random();
				const brightness = 0.55 + random() * 0.45;
				const red = Math.round(255 * brightness);
				const green = Math.round((175 + warmth * 50) * brightness);
				const blue = Math.round((95 + warmth * 90) * brightness);
				const gradient = emissiveContext.createLinearGradient(0, top, 0, top + height);
				gradient.addColorStop(0, `rgb(${red * 0.75}, ${green * 0.75}, ${blue * 0.75})`);
				gradient.addColorStop(1, `rgb(${red}, ${green}, ${blue})`);
				emissiveContext.fillStyle = gradient;
				emissiveContext.fillRect(left, top, width, height);
			}
		}
		if (isGlass) {
			// spandrel band between floors
			colorContext.fillStyle = 'rgba(40, 46, 52, 0.85)';
			colorContext.fillRect(0, (cellY + 1) * cellSize - cellSize * 0.16, size, cellSize * 0.1);
		}
	}
	return {
		map: finishTexture(colorCanvas, { colorSpace: THREE.SRGBColorSpace, anisotropy: 4 }),
		emissiveMap: finishTexture(emissiveCanvas, { colorSpace: THREE.SRGBColorSpace, anisotropy: 4 }),
		roughnessMap: finishTexture(surfaceCanvas, { anisotropy: 4 })
	};
}

// Adds low-frequency world-space variation to a material so tiling is not visible.
export function addMacroVariation(material, { scale = 0.03, strength = 0.18 } = {}) {
	material.onBeforeCompile = (shader) => {
		shader.uniforms.macroScale = { value: scale };
		shader.uniforms.macroStrength = { value: strength };
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vMacroWorldPosition;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMacroWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>
varying vec3 vMacroWorldPosition;
uniform float macroScale;
uniform float macroStrength;
float macroHash( vec2 point ) { return fract( sin( dot( point, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float macroNoise( vec2 point ) {
	vec2 cell = floor( point );
	vec2 fraction = fract( point );
	fraction = fraction * fraction * ( 3.0 - 2.0 * fraction );
	return mix( mix( macroHash( cell ), macroHash( cell + vec2( 1.0, 0.0 ) ), fraction.x ),
		mix( macroHash( cell + vec2( 0.0, 1.0 ) ), macroHash( cell + vec2( 1.0, 1.0 ) ), fraction.x ), fraction.y );
}`)
			.replace('#include <map_fragment>', `#include <map_fragment>
{
	vec2 macroPoint = vMacroWorldPosition.xz * macroScale;
	float macroValue = macroNoise( macroPoint ) * 0.6 + macroNoise( macroPoint * 3.7 + 13.0 ) * 0.4;
	diffuseColor.rgb *= 1.0 + ( macroValue - 0.5 ) * 2.0 * macroStrength;
}`);
	};
	material.customProgramCacheKey = () => 'macroVariation';
	return material;
}
