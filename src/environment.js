// Outdoor environment for the car showcase: physically based sky, sun/moon light,
// fog, reflections (PMREM of the sky), and a procedural plaza / road / park scene.
//
// Coordinate contract: Y up, meters, car at the origin facing +X.
// Ground at y = 0 is flat and unobstructed for x in [-9, 9], z in [-7, 7].
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildScenery, LIT_LAMPS } from './env/props.js';
import { createSkyDome, createCameraFollowingMesh } from './env/skyDome.js';

const PRESETS = {
	day: { timeOfDay: 11.5, cloudiness: 0.22 },
	sunset: { timeOfDay: 19.45, cloudiness: 0.3 },
	overcast: { timeOfDay: 13, cloudiness: 0.95 },
	night: { timeOfDay: 23, cloudiness: 0.15 }
};

const ENVIRONMENT_REFRESH_INTERVAL_MS = 300; // ~3 regenerations per second while dragging
const SUN_LIGHT_DISTANCE = 60;
const SHADOW_HALF_EXTENT = 12;

const SUN_TO_SKY_RATIO = 11.5; // sun irradiance vs. horizon radiance (~5:1 sun:sky irradiance at noon)
const MOON_INTENSITY = 1.0;
const NIGHT_EXPOSURE = 1.35;

const { smoothstep, lerp, clamp, degToRad } = THREE.MathUtils;

// Approximate horizon radiance of three's Sky shader (fitted to read-back values):
// it follows the shader's sun intensity term vSunE to the power 1.5.
function estimateSkyLuminance(sunElevationDegrees) {
	const zenithAngle = Math.PI / 2 - degToRad(sunElevationDegrees);
	const sunE = 1000 * Math.max(0, 1 - Math.exp(-(1.6110731556870734 - zenithAngle) / 1.5));
	return 6.07 * Math.pow(sunE / 487, 1.5);
}

// ---------------------------------------------------------------- celestial model

// Compass azimuth (0 = north = -Z, 90 = east = +X), elevation in degrees -> unit vector.
function directionFromAngles(elevationDegrees, azimuthDegrees, target = new THREE.Vector3()) {
	const elevation = degToRad(elevationDegrees);
	const azimuth = degToRad(azimuthDegrees);
	return target.set(
		Math.sin(azimuth) * Math.cos(elevation),
		Math.sin(elevation),
		-Math.cos(azimuth) * Math.cos(elevation)
	);
}

// Summer-like day: sunrise 06:00, solar noon 13:00, sunset ~20:00.
function computeCelestialState(hours) {
	const dayHours = ((hours % 24) + 24) % 24;
	let sunElevation;
	if (dayHours >= 6 && dayHours <= 20) {
		sunElevation = 58 * Math.sin(Math.PI * (dayHours - 6) / 14);
	} else {
		const hoursSinceSunset = dayHours > 20 ? dayHours - 20 : dayHours + 4;
		sunElevation = -32 * Math.sin(Math.PI * hoursSinceSunset / 10);
	}
	const sunAzimuth = 75 + ((dayHours - 6 + 24) % 24) / 14 * 210;

	// the moon rises ~17:30 and sets ~06:30
	const moonHours = dayHours < 12 ? dayHours + 24 : dayHours;
	const moonProgress = (moonHours - 17.5) / 13;
	const moonElevation = moonProgress >= 0 && moonProgress <= 1 ? 50 * Math.sin(Math.PI * moonProgress) : -10;
	const moonAzimuth = 105 + clamp(moonProgress, 0, 1) * 150;
	return { sunElevation, sunAzimuth, moonElevation, moonAzimuth };
}

// ---------------------------------------------------------------- main factory

export function createEnvironment({ scene, renderer, quality = 'high' }) {
	const isHighQuality = quality !== 'low';
	const maxAnisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
	const anisotropy = isHighQuality ? Math.min(8, maxAnisotropy) : 1;

	const state = {
		timeOfDay: PRESETS.day.timeOfDay,
		cloudiness: PRESETS.day.cloudiness,
		preset: 'day',
		nightFactor: 0
	};
	const changeListeners = new Set();
	const sunDirection = new THREE.Vector3();
	const moonDirection = new THREE.Vector3();
	const lightDirection = new THREE.Vector3(0, 1, 0);

	const previous = {
		fog: scene.fog,
		background: scene.background,
		environment: scene.environment,
		environmentIntensity: scene.environmentIntensity,
		exposure: renderer.toneMappingExposure
	};

	// ------------------------------------------------ sky (main view)
	const sky = new Sky();
	sky.name = 'environment-sky';
	sky.scale.setScalar(1000);
	sky.frustumCulled = false;
	sky.renderOrder = -10;
	sky.onBeforeRender = (activeRenderer, activeScene, camera) => {
		camera.getWorldPosition(sky.position);
		sky.updateMatrixWorld();
	};
	scene.add(sky);

	const skyDomeMaterial = createSkyDome();
	const domeGeometry = new THREE.SphereGeometry(1, 48, 24);
	const skyDome = createCameraFollowingMesh(domeGeometry, skyDomeMaterial, 900);
	skyDome.name = 'environment-sky-dome';
	skyDome.renderOrder = -9;
	scene.add(skyDome);

	// ------------------------------------------------ lights
	const sunLight = new THREE.DirectionalLight(0xffffff, 3);
	sunLight.name = 'environment-sun';
	sunLight.castShadow = true;
	const shadowMapSize = isHighQuality ? 2048 : 1024;
	sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
	const shadowCamera = sunLight.shadow.camera;
	shadowCamera.left = -SHADOW_HALF_EXTENT;
	shadowCamera.right = SHADOW_HALF_EXTENT;
	shadowCamera.top = SHADOW_HALF_EXTENT;
	shadowCamera.bottom = -SHADOW_HALF_EXTENT;
	shadowCamera.near = 1;
	shadowCamera.far = SUN_LIGHT_DISTANCE + 40;
	shadowCamera.updateProjectionMatrix();
	sunLight.shadow.bias = -0.0004;
	sunLight.shadow.normalBias = 0.03;
	sunLight.target.position.set(0, 0, 0);
	scene.add(sunLight, sunLight.target);

	const hemisphereLight = new THREE.HemisphereLight(0xbfd6ff, 0x5a5040, 0.3);
	hemisphereLight.name = 'environment-fill';
	scene.add(hemisphereLight);

	// ------------------------------------------------ scenery
	const scenery = buildScenery({ quality: isHighQuality ? 'high' : 'low', anisotropy });
	scene.add(scenery.group);

	// lamp SpotLights (no shadows): 4 lights + sun + hemisphere = 6 dynamic lights
	const lampColor = new THREE.Color(1.0, 0.8, 0.58);
	const lampLights = scenery.lamps.lightPositions.map((lightPosition, index) => {
		const spotLight = new THREE.SpotLight(lampColor, 0, 30, degToRad(50), 0.8, 2);
		spotLight.name = `environment-lamp-light-${index}`;
		spotLight.castShadow = false;
		spotLight.position.copy(lightPosition);
		const towardCenter = new THREE.Vector3(-Math.sign(lightPosition.x) * 1.5, 0, -Math.sign(lightPosition.z) * 1.5);
		spotLight.target.position.set(lightPosition.x + towardCenter.x, 0, lightPosition.z + towardCenter.z);
		scene.add(spotLight, spotLight.target);
		return spotLight;
	});

	// ------------------------------------------------ reflection environment (sky-only scene)
	const environmentScene = new THREE.Scene();
	const environmentSky = new Sky();
	environmentSky.scale.setScalar(1000);
	environmentSky.frustumCulled = false;
	environmentSky.material.uniforms.showSunDisc.value = 0;
	environmentSky.onBeforeRender = (activeRenderer, activeScene, camera) => {
		camera.getWorldPosition(environmentSky.position);
		environmentSky.updateMatrixWorld();
	};
	environmentScene.add(environmentSky);
	const environmentDome = createCameraFollowingMesh(domeGeometry, skyDomeMaterial, 900);
	environmentDome.renderOrder = 1;
	environmentScene.add(environmentDome);
	// ground seen in reflections (darker than the horizon haze)
	const environmentGroundMaterial = new THREE.MeshBasicMaterial({ color: 0x222222, fog: false });
	const environmentGround = new THREE.Mesh(new THREE.CircleGeometry(70, 32), environmentGroundMaterial);
	environmentGround.rotation.x = -Math.PI / 2;
	environmentGround.position.y = -0.9;
	environmentScene.add(environmentGround);
	// glowing lamp heads seen in reflections at night
	const environmentLampMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
	const environmentLampGeometry = new THREE.BoxGeometry(0.35, 0.12, 0.8);
	for (const lightPosition of scenery.lamps.lightPositions) {
		const lampProxy = new THREE.Mesh(environmentLampGeometry, environmentLampMaterial);
		lampProxy.position.copy(lightPosition).add(new THREE.Vector3(0, -0.9, 0));
		environmentScene.add(lampProxy);
	}

	const pmremGenerator = new THREE.PMREMGenerator(renderer);
	let environmentRenderTarget = null;
	const environmentSize = isHighQuality ? 512 : 256;

	// ------------------------------------------------ horizon colour readback (for fog)
	const horizonTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
	const horizonCamera = new THREE.PerspectiveCamera(8, 1, 0.1, 10);
	const horizonScene = new THREE.Scene();
	const horizonSky = new Sky();
	horizonSky.scale.setScalar(5);
	horizonSky.material.uniforms.showSunDisc.value = 0;
	horizonScene.add(horizonSky);
	const horizonPixels = new Uint16Array(4 * 4 * 4);
	// float/half-float render targets must be readable, otherwise use the analytic estimate
	let horizonReadbackWorks = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
	const fogColor = new THREE.Color();
	const sampledColor = new THREE.Color();

	function sampleHorizonColor(target) {
		target.setRGB(0, 0, 0);
		const previousTarget = renderer.getRenderTarget();
		const previousXr = renderer.xr.enabled;
		renderer.xr.enabled = false;
		let samples = 0;
		try {
			for (let sampleIndex = 0; sampleIndex < 4; sampleIndex++) {
				const azimuth = sampleIndex * 90 + 45;
				const lookDirection = directionFromAngles(3, azimuth);
				horizonCamera.position.set(0, 0, 0);
				horizonCamera.lookAt(lookDirection);
				horizonCamera.updateMatrixWorld();
				renderer.setRenderTarget(horizonTarget);
				renderer.render(horizonScene, horizonCamera);
				horizonPixels.fill(0x7e00); // half-float NaN: an unreadable target falls through to the estimate
				renderer.readRenderTargetPixels(horizonTarget, 1, 1, 2, 2, horizonPixels);
				for (let pixel = 0; pixel < 4; pixel++) {
					sampledColor.setRGB(
						THREE.DataUtils.fromHalfFloat(horizonPixels[pixel * 4]),
						THREE.DataUtils.fromHalfFloat(horizonPixels[pixel * 4 + 1]),
						THREE.DataUtils.fromHalfFloat(horizonPixels[pixel * 4 + 2]),
						THREE.LinearSRGBColorSpace
					);
					if (Number.isFinite(sampledColor.r) && Number.isFinite(sampledColor.g) && Number.isFinite(sampledColor.b)) {
						target.r += sampledColor.r;
						target.g += sampledColor.g;
						target.b += sampledColor.b;
						samples++;
					}
				}
			}
		} catch (error) {
			horizonReadbackWorks = false;
		}
		renderer.setRenderTarget(previousTarget);
		renderer.xr.enabled = previousXr;
		if (samples === 0) return false;
		target.multiplyScalar(1 / samples);
		return true;
	}

	// fallback when float readback is not available: rough horizon radiance by sun elevation
	function estimateHorizonColor(sunElevation, cloudiness, target) {
		const warm = 1 - smoothstep(sunElevation, 2, 18);
		target.setRGB(0.62, 1.05, 1.25).lerp(new THREE.Color(1.2, 0.95, 0.8), warm);
		target.lerp(new THREE.Color(1.0, 1.0, 1.0), cloudiness * 0.7);
		return target.multiplyScalar(estimateSkyLuminance(sunElevation));
	}

	// ------------------------------------------------ derived lighting state

	const derived = {
		sunElevation: 0,
		moonElevation: 0,
		exposure: 0.6,
		sunIntensity: 0,
		lampLevel: 0,
		twilight: 0,
		horizonLuminance: 1
	};

	function applyAtmosphere(skyUniforms, sunElevation, cloudiness, time) {
		const lowSun = 1 - smoothstep(sunElevation, 0, 22);
		skyUniforms.turbidity.value = 2.4 + 4.5 * lowSun + 7 * cloudiness;
		skyUniforms.rayleigh.value = 1.1 + 1.6 * lowSun + 1.2 * cloudiness;
		skyUniforms.mieCoefficient.value = 0.004 + 0.004 * lowSun + 0.012 * cloudiness;
		skyUniforms.mieDirectionalG.value = 0.8 + 0.06 * lowSun - 0.2 * cloudiness;
		skyUniforms.cloudCoverage.value = 0.1 + 0.88 * cloudiness;
		skyUniforms.cloudDensity.value = 0.3 + 0.65 * cloudiness;
		skyUniforms.cloudElevation.value = 0.5;
		skyUniforms.time.value = time;
		skyUniforms.sunPosition.value.copy(sunDirection);
	}

	function applyState() {
		const { sunElevation, sunAzimuth, moonElevation, moonAzimuth } = computeCelestialState(state.timeOfDay);
		const cloudiness = state.cloudiness;
		directionFromAngles(sunElevation, sunAzimuth, sunDirection);
		directionFromAngles(Math.max(moonElevation, -10), moonAzimuth, moonDirection);
		derived.sunElevation = sunElevation;
		derived.moonElevation = moonElevation;

		const nightFactor = 1 - smoothstep(sunElevation, -7, 3);
		state.nightFactor = nightFactor;
		const cloudTime = 120; // static cloud field: reflections always match the background

		applyAtmosphere(sky.material.uniforms, sunElevation, cloudiness, cloudTime);
		applyAtmosphere(environmentSky.material.uniforms, sunElevation, cloudiness, cloudTime);
		applyAtmosphere(horizonSky.material.uniforms, sunElevation, cloudiness, cloudTime);

		// --- sky dome (night layer + haze)
		const domeUniforms = skyDomeMaterial.uniforms;
		domeUniforms.nightFactor.value = nightFactor;
		domeUniforms.cloudiness.value = cloudiness;
		domeUniforms.moonDirection.value.copy(moonDirection);
		domeUniforms.sunDirection.value.copy(sunDirection);
		derived.twilight = smoothstep(sunElevation, -12, -3.5) * (1 - smoothstep(sunElevation, -1, 4));
		domeUniforms.twilight.value = derived.twilight;
		domeUniforms.moonVisibility.value = smoothstep(moonElevation, -2, 3);
		domeUniforms.hazeHeight.value = lerp(0.1, 0.2, cloudiness);
		domeUniforms.overcastVeil.value = 0.85 * smoothstep(cloudiness, 0.45, 1.0);

		// --- direct light: the sun by day, the moon by night (fades through zero when switching)
		// The Preetham sky is in absolute-ish units (horizon radiance ~6 at noon, ~0.5 at sunset),
		// so sun intensity and exposure are derived from the same model to keep ratios physical.
		const horizonLuminance = estimateSkyLuminance(sunElevation);
		derived.horizonLuminance = horizonLuminance;
		const sunVisibility = smoothstep(sunElevation, -1.5, 4);
		const lowSunFactor = 1 - smoothstep(sunElevation, 2, 30);
		const overcastAmount = smoothstep(cloudiness, 0.3, 1.0);
		const cloudAttenuation = 1 - 0.9 * overcastAmount;
		const sunColor = new THREE.Color(1.0, 0.96, 0.9).lerp(new THREE.Color(1.0, 0.55, 0.27), lowSunFactor * lowSunFactor);
		if (sunElevation > -2) {
			lightDirection.copy(sunDirection);
			if (lightDirection.y < 0.02) lightDirection.y = 0.02;
			sunLight.color.copy(sunColor).lerp(new THREE.Color(0.85, 0.88, 0.95), cloudiness * 0.6);
			derived.sunIntensity = SUN_TO_SKY_RATIO * horizonLuminance * sunVisibility * cloudAttenuation;
			sunLight.shadow.intensity = lerp(0.95, 0.35, overcastAmount);
		} else {
			const moonStrength = (1 - smoothstep(sunElevation, -9, -3)) * smoothstep(moonElevation, 0, 12);
			lightDirection.copy(moonDirection);
			if (lightDirection.y < 0.05) lightDirection.y = 0.05;
			sunLight.color.setRGB(0.55, 0.68, 1.0);
			derived.sunIntensity = MOON_INTENSITY * moonStrength * (1 - 0.75 * cloudiness);
			sunLight.shadow.intensity = 0.75;
		}
		lightDirection.normalize();
		sunLight.intensity = derived.sunIntensity;
		sunLight.shadow.radius = lerp(2.5, 9, cloudiness);
		positionSunLight();

		// --- hemisphere fill (the PMREM environment does most of the ambient work)
		const dayHemisphere = new THREE.Color(0.75, 0.85, 1.0);
		const nightHemisphere = new THREE.Color(0.32, 0.42, 0.7);
		hemisphereLight.color.copy(dayHemisphere).lerp(nightHemisphere, nightFactor).lerp(new THREE.Color(0.85, 0.87, 0.9), cloudiness * (1 - nightFactor));
		hemisphereLight.groundColor.setRGB(0.32, 0.29, 0.24).lerp(new THREE.Color(0.12, 0.1, 0.09), nightFactor);
		hemisphereLight.intensity = lerp(lerp(0.2, 0.55, cloudiness), 0.12, nightFactor);

		// --- exposure for ACES: map the horizon to a pleasant brightness, capped for night
		const exposureTarget = 0.62 * (1 + 0.7 * overcastAmount) / Math.max(horizonLuminance, 1e-4);
		derived.exposure = clamp(exposureTarget, 0.07, NIGHT_EXPOSURE);
		renderer.toneMappingExposure = derived.exposure;
		scene.environmentIntensity = lerp(1.0, 1.5, nightFactor);

		// --- fog density
		const fogDensity = lerp(lerp(0.001, 0.0032, cloudiness), 0.0022, nightFactor);
		scene.fog.density = fogDensity;

		// --- night lighting: lamps and windows
		const lampLevel = smoothstep(nightFactor, 0.25, 0.75);
		derived.lampLevel = lampLevel;
		lampLights.forEach((spotLight) => { spotLight.intensity = 190 * lampLevel; });
		scenery.lamps.lensMaterial.emissiveIntensity = 14 * lampLevel;
		scenery.lamps.poolMaterial.color.setRGB(0.32 * lampLevel, 0.2 * lampLevel, 0.1 * lampLevel);
		for (const facadeMaterial of scenery.facadeMaterials) facadeMaterial.emissiveIntensity = 1.1 * smoothstep(nightFactor, 0.1, 0.8);
		environmentLampMaterial.color.setRGB(8 * lampLevel, 5.5 * lampLevel, 3 * lampLevel);
	}

	function positionSunLight() {
		sunLight.position.copy(sunLight.target.position).addScaledVector(lightDirection, SUN_LIGHT_DISTANCE);
		sunLight.target.updateMatrixWorld();
	}

	// ------------------------------------------------ throttled environment regeneration

	let lastEnvironmentUpdate = -Infinity;
	let environmentDirty = false;

	function regenerateEnvironment() {
		lastEnvironmentUpdate = performance.now();
		environmentDirty = false;

		// fog colour = average sky radiance just above the horizon (+ night layer)
		const readbackOk = horizonReadbackWorks && sampleHorizonColor(fogColor);
		if (!readbackOk) estimateHorizonColor(derived.sunElevation, state.cloudiness, fogColor);
		const domeUniforms = skyDomeMaterial.uniforms;
		const nightHorizon = domeUniforms.nightHorizonColor.value;
		const lightPollution = domeUniforms.lightPollutionColor.value;
		fogColor.r += (nightHorizon.r + lightPollution.r * (0.75 + state.cloudiness * 0.6)) * state.nightFactor;
		fogColor.g += (nightHorizon.g + lightPollution.g * (0.75 + state.cloudiness * 0.6)) * state.nightFactor;
		fogColor.b += (nightHorizon.b + lightPollution.b * (0.75 + state.cloudiness * 0.6)) * state.nightFactor;
		// average twilight glow around the horizon (matches skyDome.js)
		const twilightFactor = derived.twilight * (1 - state.cloudiness * 0.55);
		fogColor.r += 0.13 * twilightFactor;
		fogColor.g += 0.07 * twilightFactor;
		fogColor.b += 0.06 * twilightFactor;
		// overcast: desaturate towards grey
		const overcastGrey = 0.85 * smoothstep(state.cloudiness, 0.35, 1.0) * (1 - state.nightFactor);
		const horizonLuminanceMeasured = 0.2126 * fogColor.r + 0.7152 * fogColor.g + 0.0722 * fogColor.b;
		fogColor.lerp(sampledColor.setRGB(horizonLuminanceMeasured, horizonLuminanceMeasured * 1.01, horizonLuminanceMeasured * 1.04), overcastGrey);
		scene.fog.color.copy(fogColor);
		domeUniforms.fogColor.value.copy(fogColor);

		// reflected ground: albedo * (sun + sky irradiance)
		const groundAlbedo = 0.11;
		const sunIrradiance = derived.sunElevation > -2 ? derived.sunIntensity * Math.max(sunDirection.y, 0) : derived.sunIntensity * Math.max(moonDirection.y, 0);
		environmentGroundMaterial.color.copy(fogColor).multiplyScalar(groundAlbedo * 1.6);
		environmentGroundMaterial.color.r += groundAlbedo / Math.PI * sunIrradiance * sunLight.color.r + derived.lampLevel * 0.012;
		environmentGroundMaterial.color.g += groundAlbedo / Math.PI * sunIrradiance * sunLight.color.g + derived.lampLevel * 0.008;
		environmentGroundMaterial.color.b += groundAlbedo / Math.PI * sunIrradiance * sunLight.color.b + derived.lampLevel * 0.004;

		// stars are too small to matter in a blurred reflection map
		const starVisibility = domeUniforms.starVisibility.value;
		domeUniforms.starVisibility.value = 0;
		const previousTarget = environmentRenderTarget;
		environmentRenderTarget = pmremGenerator.fromScene(environmentScene, 0, 0.1, 1000, { size: environmentSize, position: new THREE.Vector3(0, 0, 0) });
		domeUniforms.starVisibility.value = starVisibility;
		scene.environment = environmentRenderTarget.texture;
		if (previousTarget) previousTarget.dispose();
	}

	function requestEnvironmentUpdate() {
		const now = performance.now();
		if (now - lastEnvironmentUpdate >= ENVIRONMENT_REFRESH_INTERVAL_MS) {
			regenerateEnvironment();
		} else {
			environmentDirty = true;
		}
	}

	function notifyChange() {
		const payload = { timeOfDay: state.timeOfDay, preset: state.preset, nightFactor: state.nightFactor };
		for (const listener of changeListeners) {
			try {
				listener(payload);
			} catch (error) {
				console.warn('environment onChange listener failed', error);
			}
		}
	}

	function commitChange(regenerateImmediately = false) {
		applyState();
		if (regenerateImmediately) regenerateEnvironment();
		else requestEnvironmentUpdate();
		notifyChange();
	}

	// ------------------------------------------------ initial state
	scene.fog = new THREE.FogExp2(0xa0b0c0, 0.002);
	scene.background = null;
	// ------------------------------------------------ public API
	const environment = {
		sunLight,

		update(deltaSeconds, elapsedSeconds) {
			skyDomeMaterial.uniforms.time.value = elapsedSeconds || 0;
			positionSunLight();
			if (environmentDirty && performance.now() - lastEnvironmentUpdate >= ENVIRONMENT_REFRESH_INTERVAL_MS) {
				regenerateEnvironment();
			}
		},

		setTimeOfDay(hours) {
			const normalized = ((Number(hours) % 24) + 24) % 24;
			if (!Number.isFinite(normalized)) return;
			if (normalized === state.timeOfDay && state.preset === 'custom') return;
			state.timeOfDay = normalized;
			state.preset = 'custom';
			commitChange();
		},

		getTimeOfDay() {
			return state.timeOfDay;
		},

		setPreset(name) {
			const preset = PRESETS[name];
			if (!preset) {
				console.warn(`environment: unknown preset "${name}"`);
				return;
			}
			state.timeOfDay = preset.timeOfDay;
			state.cloudiness = preset.cloudiness;
			state.preset = name;
			// presets are discrete clicks: fog and reflections must match on the very next frame
			commitChange(true);
		},

		getPreset() {
			return state.preset;
		},

		setCloudiness(value) {
			const cloudiness = clamp(Number(value) || 0, 0, 1);
			if (cloudiness === state.cloudiness) return;
			state.cloudiness = cloudiness;
			state.preset = 'custom';
			commitChange();
		},

		getCloudiness() {
			return state.cloudiness;
		},

		get nightFactor() {
			return state.nightFactor;
		},

		onChange(callback) {
			changeListeners.add(callback);
			return () => changeListeners.delete(callback);
		},

		dispose() {
			changeListeners.clear();
			scene.remove(sky, skyDome, sunLight, sunLight.target, hemisphereLight, scenery.group);
			lampLights.forEach((spotLight) => {
				scene.remove(spotLight, spotLight.target);
				spotLight.dispose();
			});
			sunLight.dispose();
			hemisphereLight.dispose();
			scenery.dispose();
			sky.geometry.dispose();
			sky.material.dispose();
			environmentSky.geometry.dispose();
			environmentSky.material.dispose();
			horizonSky.geometry.dispose();
			horizonSky.material.dispose();
			domeGeometry.dispose();
			skyDomeMaterial.dispose();
			environmentGround.geometry.dispose();
			environmentGroundMaterial.dispose();
			environmentLampGeometry.dispose();
			environmentLampMaterial.dispose();
			horizonTarget.dispose();
			if (environmentRenderTarget) environmentRenderTarget.dispose();
			pmremGenerator.dispose();
			scene.fog = previous.fog;
			scene.background = previous.background;
			scene.environment = previous.environment;
			scene.environmentIntensity = previous.environmentIntensity;
			renderer.toneMappingExposure = previous.exposure;
		}
	};

	// state should start from a named preset
	environment.setPreset('day');
	return environment;
}
