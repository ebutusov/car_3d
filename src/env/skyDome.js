// Sky overlay dome, drawn right after the Preetham Sky:
//  - fills everything below the horizon (and a haze band above it) with the fog colour,
//    so the ground blends seamlessly into the sky no matter the camera far plane;
//  - adds the night layer: dark blue gradient, warm light pollution, twinkling stars, the moon.
// Uses the same "z = w" trick as Sky.js, so it always sits on the far plane.
import * as THREE from 'three';

const vertexShader = /* glsl */`
varying vec3 vWorldPosition;
void main() {
	vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
	vWorldPosition = worldPosition.xyz;
	gl_Position = projectionMatrix * viewMatrix * worldPosition;
	gl_Position.z = gl_Position.w;
}
`;

const fragmentShader = /* glsl */`
uniform vec3 fogColor;
uniform float hazeHeight;
uniform float overcastVeil;
uniform vec3 sunDirection;
uniform float twilight;
uniform float nightFactor;
uniform float starVisibility;
uniform float cloudiness;
uniform vec3 moonDirection;
uniform float moonVisibility;
uniform float time;
uniform vec3 nightZenithColor;
uniform vec3 nightHorizonColor;
uniform vec3 lightPollutionColor;
varying vec3 vWorldPosition;

vec3 hash33( vec3 point ) {
	point = fract( point * vec3( 0.1031, 0.1030, 0.0973 ) );
	point += dot( point, point.yxz + 33.33 );
	return fract( ( point.xxy + point.yxx ) * point.zyx );
}

float hash12( vec2 point ) {
	vec3 point3 = fract( vec3( point.xyx ) * 0.1031 );
	point3 += dot( point3, point3.yzx + 33.33 );
	return fract( ( point3.x + point3.y ) * point3.z );
}

float valueNoise( vec2 point ) {
	vec2 cell = floor( point );
	vec2 fraction = fract( point );
	fraction = fraction * fraction * ( 3.0 - 2.0 * fraction );
	return mix( mix( hash12( cell ), hash12( cell + vec2( 1.0, 0.0 ) ), fraction.x ),
		mix( hash12( cell + vec2( 0.0, 1.0 ) ), hash12( cell + vec2( 1.0, 1.0 ) ), fraction.x ), fraction.y );
}

vec3 starLayer( vec3 direction, float cellsPerUnit, float density, float sizeScale ) {
	vec3 scaled = direction * cellsPerUnit;
	vec3 cell = floor( scaled );
	vec3 random = hash33( cell );
	if ( random.x > density ) return vec3( 0.0 );
	vec3 starPosition = cell + 0.25 + 0.5 * hash33( cell + 17.0 );
	float distanceToStar = length( scaled - starPosition );
	float magnitude = pow( random.y, 6.0 ) * 3.5 + 0.25;
	float twinkle = 0.75 + 0.25 * sin( time * ( 1.5 + random.z * 4.0 ) + random.y * 50.0 );
	float core = 1.0 - smoothstep( 0.0, 0.16 * sizeScale, distanceToStar );
	vec3 tint = mix( vec3( 0.75, 0.85, 1.0 ), vec3( 1.0, 0.88, 0.72 ), random.z );
	return tint * core * magnitude * twinkle;
}

void main() {
	vec3 direction = normalize( vWorldPosition - cameraPosition );
	float upness = direction.y;

	// ---- haze / below-horizon fill
	float fogAlpha = 1.0 - smoothstep( -0.012, hazeHeight, upness );
	fogAlpha = fogAlpha * fogAlpha * ( 3.0 - 2.0 * fogAlpha );
	// overcast: a flat grey cloud deck, brighter towards the zenith (CIE overcast sky ~ 1 : 2.5)
	float veilAlpha = overcastVeil * smoothstep( -0.03, 0.02, upness );
	vec3 overlayColor = fogColor * ( 1.0 + overcastVeil * 0.9 * smoothstep( 0.0, 0.8, upness ) );
	fogAlpha = max( fogAlpha, veilAlpha );

	// ---- night layer (linear radiance, added on top of the sky)
	vec3 nightColor = vec3( 0.0 );
	if ( nightFactor > 0.001 ) {
		float elevation = max( upness, 0.0 );
		vec3 gradient = mix( nightHorizonColor, nightZenithColor, pow( elevation, 0.45 ) );
		gradient += lightPollutionColor * exp( -elevation * 9.0 );
		// overcast night: clouds reflect the city glow
		gradient = mix( gradient, lightPollutionColor * 1.4 + nightHorizonColor, cloudiness * 0.6 );

		float aboveHorizon = smoothstep( 0.0, 0.12, upness );
		vec3 stars = starLayer( direction, 210.0, 0.22, 1.0 ) + starLayer( direction, 90.0, 0.08, 1.4 ) * 1.5;
		stars *= aboveHorizon * starVisibility * ( 1.0 - smoothstep( 0.2, 0.85, cloudiness ) );

		vec3 moon = vec3( 0.0 );
		float moonAngle = length( direction - moonDirection );
		const float moonRadius = 0.0135;
		if ( moonVisibility > 0.001 ) {
			vec3 tangentA = normalize( cross( moonDirection, vec3( 0.0, 1.0, 0.0 ) ) );
			vec3 tangentB = cross( tangentA, moonDirection );
			vec2 local = vec2( dot( direction - moonDirection, tangentA ), dot( direction - moonDirection, tangentB ) ) / moonRadius;
			float disc = 1.0 - smoothstep( 0.92, 1.04, length( local ) );
			float maria = valueNoise( local * 2.3 + 3.0 ) * 0.6 + valueNoise( local * 6.0 ) * 0.4;
			float limb = sqrt( max( 0.0, 1.0 - dot( local, local ) ) );
			vec3 surface = vec3( 1.0, 0.96, 0.88 ) * ( 0.62 + 0.38 * smoothstep( 0.35, 0.7, maria ) ) * ( 0.75 + 0.25 * limb );
			float cloudDimming = 1.0 - cloudiness * 0.85;
			moon = surface * disc * 2.4 * cloudDimming;
			moon += vec3( 0.55, 0.62, 0.8 ) * ( exp( -moonAngle * 35.0 ) * 0.08 + exp( -moonAngle * 6.0 ) * 0.025 ) * ( 0.4 + cloudiness );
			moon *= moonVisibility * smoothstep( -0.01, 0.03, upness );
		}
		nightColor = ( gradient + stars + moon ) * nightFactor;
	}

	// ---- civil twilight: the Preetham model goes black once the sun is down
	if ( twilight > 0.001 ) {
		vec2 sunFlat = normalize( sunDirection.xz + vec2( 1e-5 ) );
		vec2 viewFlat = normalize( direction.xz + vec2( 1e-5 ) );
		float towardSun = dot( sunFlat, viewFlat ) * 0.5 + 0.5;
		float elevation = max( upness, 0.0 );
		vec3 horizonGlow = mix( vec3( 0.05, 0.045, 0.07 ), vec3( 0.36, 0.15, 0.055 ), pow( towardSun, 2.5 ) );
		vec3 zenithBlue = vec3( 0.018, 0.034, 0.085 );
		vec3 twilightColor = mix( horizonGlow, zenithBlue, smoothstep( 0.0, 0.45 + 0.25 * towardSun, elevation ) );
		twilightColor *= 1.0 - cloudiness * 0.55;
		nightColor += twilightColor * twilight;
	}

	vec3 fogOutput = overlayColor;
	vec3 nightOutput = nightColor;
	#ifdef TONE_MAPPING
		fogOutput = toneMapping( fogOutput );
		nightOutput = toneMapping( nightOutput );
	#endif
	fogOutput = linearToOutputTexel( vec4( fogOutput, 1.0 ) ).rgb;
	nightOutput = linearToOutputTexel( vec4( nightOutput, 1.0 ) ).rgb;

	// premultiplied: result = night * (1 - a) + fog * a + destination * (1 - a)
	gl_FragColor = vec4( fogOutput * fogAlpha + nightOutput * ( 1.0 - fogAlpha ), fogAlpha );
}
`;

export function createSkyDome() {
	const material = new THREE.ShaderMaterial({
		name: 'EnvironmentSkyDome',
		uniforms: {
			fogColor: { value: new THREE.Color(0.6, 0.7, 0.8) },
			hazeHeight: { value: 0.12 },
			overcastVeil: { value: 0 },
			sunDirection: { value: new THREE.Vector3(0, 1, 0) },
			twilight: { value: 0 },
			nightFactor: { value: 0 },
			starVisibility: { value: 1 },
			cloudiness: { value: 0 },
			moonDirection: { value: new THREE.Vector3(0, 1, 0) },
			moonVisibility: { value: 0 },
			time: { value: 0 },
			nightZenithColor: { value: new THREE.Color(0.0016, 0.0032, 0.0095) },
			nightHorizonColor: { value: new THREE.Color(0.0075, 0.011, 0.02) },
			lightPollutionColor: { value: new THREE.Color(0.016, 0.0105, 0.006) }
		},
		vertexShader,
		fragmentShader,
		side: THREE.BackSide,
		depthWrite: false,
		depthTest: true,
		transparent: true,
		blending: THREE.CustomBlending,
		blendEquation: THREE.AddEquation,
		blendSrc: THREE.OneFactor,
		blendDst: THREE.OneMinusSrcAlphaFactor,
		blendSrcAlpha: THREE.OneFactor,
		blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
		fog: false
	});
	return material;
}

// A mesh that follows whatever camera renders it (main view or the PMREM cube camera).
export function createCameraFollowingMesh(geometry, material, scale) {
	const mesh = new THREE.Mesh(geometry, material);
	mesh.scale.setScalar(scale);
	mesh.frustumCulled = false;
	mesh.onBeforeRender = (renderer, scene, camera) => {
		camera.getWorldPosition(mesh.position);
		mesh.updateMatrixWorld();
	};
	return mesh;
}
