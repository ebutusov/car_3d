import * as THREE from 'three';

function createCanvasTexture(size, draw, { repeat = [1, 1], colorSpace = THREE.NoColorSpace } = {}) {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	draw(canvas.getContext('2d'), size);
	const texture = new THREE.CanvasTexture(canvas);
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(repeat[0], repeat[1]);
	texture.colorSpace = colorSpace;
	texture.anisotropy = 4;
	return texture;
}

// Hexagonal mesh used for the grille and air intakes.
function createHoneycombTexture() {
	return createCanvasTexture(256, (context, size) => {
		context.fillStyle = '#7a7a7a';
		context.fillRect(0, 0, size, size);
		const radius = size / 8;
		const rowHeight = radius * Math.sqrt(3);
		context.fillStyle = '#000';
		for (let row = -1; row < size / rowHeight + 1; row++) {
			for (let column = -1; column < size / (radius * 3) + 1; column++) {
				for (const shift of [0, 1]) {
					const centerX = column * radius * 3 + shift * radius * 1.5;
					const centerY = row * rowHeight + shift * rowHeight / 2;
					context.beginPath();
					for (let corner = 0; corner < 6; corner++) {
						const angle = Math.PI / 3 * corner;
						context.lineTo(centerX + Math.cos(angle) * radius * 0.78, centerY + Math.sin(angle) * radius * 0.78);
					}
					context.closePath();
					context.fill();
				}
			}
		}
	}, { repeat: [28, 28] });
}

// Tyre tread: grooves around the circumference plus lateral sipes.
export function createTreadTexture() {
	return createCanvasTexture(256, (context, size) => {
		context.fillStyle = '#fff';
		context.fillRect(0, 0, size, size);
		context.fillStyle = '#000';
		for (const position of [0.3, 0.45, 0.55, 0.7]) context.fillRect(position * size - 3, 0, 6, size);
		for (let row = 0; row < 16; row++) {
			const y = (row / 16) * size;
			context.fillRect(0.12 * size, y, 0.16 * size, 3);
			context.fillRect(0.72 * size, y + 8, 0.16 * size, 3);
			context.fillRect(0.47 * size, y + 4, 0.06 * size, 2);
		}
	}, { repeat: [1, 40] });
}

function createPlateTexture(text) {
	return createCanvasTexture(512, (context, size) => {
		context.fillStyle = '#f4f4f0';
		context.fillRect(0, 0, size, size);
		context.fillStyle = '#1d3f9e';
		context.fillRect(0, 0, size * 0.09, size);
		context.strokeStyle = '#111';
		context.lineWidth = 10;
		context.strokeRect(5, 5, size - 10, size - 10);
		context.fillStyle = '#111';
		context.font = `bold ${size * 0.62}px "DejaVu Sans Mono", monospace`;
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.save();
		context.scale(1, 1);
		context.fillText(text, size * 0.545, size * 0.54, size * 0.86);
		context.restore();
	}, { colorSpace: THREE.SRGBColorSpace });
}

export function createCarMaterials() {
	const paint = new THREE.MeshPhysicalMaterial({
		color: 0x1b3f73,
		metalness: 0.55,
		roughness: 0.34,
		clearcoat: 1,
		clearcoatRoughness: 0.035,
		envMapIntensity: 1.1,
	});
	const paintDoubleSided = paint.clone();
	paintDoubleSided.side = THREE.DoubleSide;

	const honeycomb = createHoneycombTexture();
	const plate = createPlateTexture('CAY 3D');
	plate.repeat.set(1, 1);

	const materials = {
		paint,
		paintDoubleSided,
		trim: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.62, metalness: 0.0 }),
		trimDoubleSided: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide }),
		blackGloss: new THREE.MeshPhysicalMaterial({
			color: 0x060606, roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02,
		}),
		satinChrome: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.22, metalness: 1 }),
		chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.05, metalness: 1 }),
		glass: new THREE.MeshPhysicalMaterial({
			color: 0x05080a,
			metalness: 0,
			roughness: 0.02,
			transparent: true,
			opacity: 0.6,
			envMapIntensity: 1.6,
			side: THREE.DoubleSide,
			depthWrite: false,
			clearcoat: 1,
			clearcoatRoughness: 0,
		}),
		interior: new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: 0.88, metalness: 0, side: THREE.BackSide }),
		interiorFront: new THREE.MeshStandardMaterial({ color: 0x232120, roughness: 0.85, metalness: 0 }),
		leather: new THREE.MeshPhysicalMaterial({
			color: 0x2b2420, roughness: 0.55, metalness: 0, sheen: 0.4, sheenRoughness: 0.6, sheenColor: 0x6b5545,
		}),
		leatherAccent: new THREE.MeshPhysicalMaterial({ color: 0x8a5a3c, roughness: 0.5, metalness: 0 }),
		screen: new THREE.MeshStandardMaterial({
			color: 0x050608, roughness: 0.08, metalness: 0.2, emissive: 0x0d2340, emissiveIntensity: 0.6,
		}),
		engine: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.5, metalness: 0.35 }),
		engineMetal: new THREE.MeshStandardMaterial({ color: 0x8e9196, roughness: 0.35, metalness: 0.9 }),
		grille: new THREE.MeshStandardMaterial({
			color: 0x15161a, roughness: 0.55, metalness: 0.3, bumpMap: honeycomb, bumpScale: 3,
		}),
		headlightHousing: new THREE.MeshPhysicalMaterial({
			color: 0x15181c, roughness: 0.18, metalness: 0.85, clearcoat: 1, clearcoatRoughness: 0.0,
		}),
		headlightLens: new THREE.MeshStandardMaterial({
			color: 0xdfe8ff, roughness: 0.1, metalness: 0.6, emissive: 0xeaf2ff, emissiveIntensity: 0,
		}),
		drl: new THREE.MeshStandardMaterial({
			color: 0xffffff, roughness: 0.2, emissive: 0xf3f7ff, emissiveIntensity: 0.4,
		}),
		taillight: new THREE.MeshPhysicalMaterial({
			color: 0x5a0006, roughness: 0.15, metalness: 0.2, clearcoat: 1, emissive: 0xff1020, emissiveIntensity: 0.15,
		}),
		taillightBar: new THREE.MeshStandardMaterial({
			color: 0x3a0004, roughness: 0.2, emissive: 0xff1424, emissiveIntensity: 0.1,
		}),
		reflector: new THREE.MeshStandardMaterial({ color: 0x601010, roughness: 0.3 }),
		plate: new THREE.MeshStandardMaterial({ map: plate, roughness: 0.4, metalness: 0.1 }),
		tire: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }),
		tread: null,
		rim: new THREE.MeshPhysicalMaterial({
			color: 0x9ca1a6, roughness: 0.22, metalness: 1, clearcoat: 0.6, clearcoatRoughness: 0.08, side: THREE.DoubleSide,
		}),
		rimDark: new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.4, metalness: 0.8 }),
		brakeDisc: new THREE.MeshStandardMaterial({ color: 0x777a7d, roughness: 0.45, metalness: 0.9, side: THREE.DoubleSide }),
		caliper: new THREE.MeshPhysicalMaterial({ color: 0xc8102e, roughness: 0.3, metalness: 0.1, clearcoat: 1 }),
		mirror: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.0, metalness: 1 }),
		exhaust: new THREE.MeshStandardMaterial({ color: 0x9a9da1, roughness: 0.25, metalness: 1 }),
		exhaustInner: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 }),
	};
	const treadTexture = createTreadTexture();
	materials.tread = new THREE.MeshStandardMaterial({
		color: 0x141414, roughness: 0.95, metalness: 0, bumpMap: treadTexture, bumpScale: 2, side: THREE.DoubleSide,
	});
	return materials;
}
