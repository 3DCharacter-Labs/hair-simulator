import {
  RawShaderMaterial,
  GLSL3,
  TextureLoader,
  DoubleSide,
} from "three";

const loader = new TextureLoader();
const blade = loader.load("./blade.jpg");

const vertexShader = `precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;
in mat4 instanceMatrix;

uniform mat3 normalMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

uniform float hairDirection;
uniform sampler2D curlMap;

out vec3 vNormal;
out vec2 vUv;
out float vHairDirection;
out float vShade;

float inCubic(float t) {
  return t * t * t;
}

void main() {
  vUv = vec2(uv.x, 1. - uv.y);
  vHairDirection = hairDirection;
  vNormal = normalMatrix * normal;

  // Per-strand shade from the curl/noise field (one texel per instance).
  // Drives lightness only - no geometry change, so hair stays still.
  vec2 size = vec2(textureSize(curlMap, 0));
  float id = float(gl_InstanceID);
  vec2 curlUv = (vec2(mod(id, size.x), floor(id / size.x)) + 0.5) / size;
  vShade = texture(curlMap, curlUv).a;

  // Strand length / bend target. hairDirection biases the tip up/left/right.
  float h = 800.;
  vec3 target = vec3(position.x, -h, -h * 2. + position.z);
  if (hairDirection == 1.0) {
    target = vec3(position.x - h, -h + position.y, -h * 2. + position.z);
  } else if (hairDirection == 2.0) {
    target = vec3(position.x + h, -h + position.y, -h * 2. + position.z);
  }

  // Bend from root to tip (eased); roots stay planted because f -> 0 there.
  float f = inCubic(position.z);
  vec3 offset = mix(position, target, f);

  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(offset, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}`;

const fragmentShader = `precision highp float;

in vec2 vUv;
in vec3 vNormal;
in float vHairDirection;
in float vShade;

uniform sampler2D blade;
uniform float shadeStrength;

out vec4 fragColor;

void main() {
  // Use smooth texture sampling to reduce pixelation
  vec4 c = texture(blade, vUv);
  
  // Natural black hair color palette with realistic undertones
  vec3 hairDark = vec3(0.02, 0.02, 0.025);     // Very dark black/blue-black at roots
  vec3 hairMid = vec3(0.05, 0.05, 0.06);       // Dark charcoal with blue undertones
  vec3 hairLight = vec3(0.12, 0.12, 0.15);     // Dark gray with blue highlights
  vec3 hairHighlight = vec3(0.3, 0.3, 0.4);    // Blue-gray highlights for natural black hair
  
  // Create random variation per hair strand
  float randomSeed = vHairDirection * 12.9898 + vUv.x * 78.233;
  float randomValue = fract(sin(randomSeed) * 43758.5453);
  
  // Create depth-based color variation along hair strand
  float depth = vUv.y;
  
  // Add randomness to depth progression for natural variation
  depth = clamp(depth + (randomValue - 0.5) * 0.2, 0.0, 0.95);
  
  // Base hair color gradient from root to tip with random variation
  vec3 baseColor = mix(hairDark, hairMid, depth * 0.8);
  baseColor = mix(baseColor, hairLight, pow(depth, 1.2 + randomValue * 0.5));
  
  // Add random color shifts to individual strands for natural black hair variation
  vec3 colorShift = vec3(
    0.95 + randomValue * 0.1,                    // Subtle red undertones
    0.95 + sin(randomValue * 6.28) * 0.05,      // Minimal green variation
    1.0 + cos(randomValue * 6.28) * 0.1         // Blue undertones for black hair
  );
  baseColor *= colorShift;
  
  // Add subtle texture variation
  float texVariation = (c.r + c.g + c.b) / 3.0;
  baseColor *= (0.9 + 0.2 * texVariation);
  
  // Improved lighting calculation
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
  vec3 normal = normalize(vNormal);
  
  // Basic diffuse lighting with better falloff
  float NdotL = max(0.0, dot(normal, lightDir));
  float diffuse = 0.4 + 0.6 * NdotL;
  
  // Random hair direction variation
  float directionVariation = sin(randomValue * 6.28) * 0.3;
  vec3 tangent = normalize(vec3(directionVariation, 1.0, directionVariation * 0.5));
  
  // Calculate view direction properly for better highlights
  vec3 viewDir = normalize(vec3(0.0, 0.0, 1.0));
  vec3 halfVector = normalize(lightDir + viewDir);
  
  // Primary sharp highlight along hair strand
  float TdotH = dot(tangent, halfVector);
  float aniso1 = pow(max(0.0, sqrt(1.0 - TdotH * TdotH)), 8.0 + randomValue * 8.0) * 0.4;
  
  // Secondary softer highlight
  float aniso2 = pow(max(0.0, sqrt(1.0 - TdotH * TdotH)), 3.0 + randomValue * 3.0) * 0.2;
  
  // Hair strand geometry - make edges slightly brighter to show strand shape
  float strandFactor = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float strandShape = mix(0.7, 1.0, pow(strandFactor, 0.3));
  
  // Enhanced opacity for better scalp coverage
  float depthOpacity = 1.0;
  
  // Near the roots (low vUv.y), increase opacity significantly
  if (depth < 0.3) {
    depthOpacity = 1.0 + (0.3 - depth) * 2.0; // Increase density near roots
  }
  
  // Multiple layer effect - some strands are denser to hide scalp
  float layerDensity = 1.0 + sin(randomValue * 12.56) * 0.5;
  if (layerDensity > 1.3) {
    depthOpacity *= 1.5; // Make some strands much more opaque
  }
  
  // Minimal subsurface scattering for black hair
  float backlight = max(0.0, dot(normal, -lightDir));
  vec3 subsurface = hairHighlight * backlight * 0.2 * depth;
  
  // Fresnel effect for realistic hair reflection
  float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 1.5);
  
  // Combine all lighting components
  vec3 finalColor = baseColor * diffuse * strandShape;
  
  // Add highlights with random intensity - more subtle for black hair
  finalColor += hairHighlight * aniso1 * (0.2 + fresnel * 0.3) * (0.4 + randomValue * 0.4);
  finalColor += hairLight * aniso2 * 0.5 * (0.6 + randomValue * 0.3);
  
  // Add minimal subsurface scattering
  finalColor += subsurface;
  
  // Very subtle variation to prevent banding
  float variation = sin(vUv.y * 6.0 + randomValue * 6.28) * 0.02;
  finalColor *= (1.0 + variation);
  
  // Random color temperature shifts for natural black hair variation
  if (randomValue > 0.7) {
    finalColor *= vec3(1.02, 1.0, 0.98); // Slightly warmer (brown undertones)
  } else if (randomValue < 0.3) {
    finalColor *= vec3(0.98, 0.99, 1.05); // Cooler blue-black tones
  }
  
  // Per-strand lightness variation from the curl/noise field for natural,
  // clumped highlights and shadows across the hair.
  finalColor *= mix(1.0 - shadeStrength, 1.0 + shadeStrength, vShade);
  
  // Ensure minimum brightness
  finalColor = max(finalColor, vec3(0.01));
  
  // Enhanced alpha for better scalp coverage
  float alpha = c.a * depthOpacity;
  
  // Anti-aliasing for thin hair strands
  float edgeAlpha = smoothstep(0.1, 0.8, strandFactor);

  
  // Boost alpha near roots for better coverage
  alpha *= (1.0 + (1.0 - depth) * 2.8);
  
  // Clamp alpha to prevent over-brightening
  alpha = min(alpha, 1.0);
  
  fragColor = vec4(finalColor, alpha);
}`;

class HairMaterial extends RawShaderMaterial {
  constructor(options) {
    super({
      vertexShader,
      fragmentShader,
      glslVersion: GLSL3,
      ...options,
      uniforms: {
        curlMap: { value: null },
        blade: { value: blade },
        hairDirection: { value: 0 },
        // Per-strand lightness variation from the curl/noise field (0 = uniform).
        shadeStrength: { value: 0.35 },
      },
      side: DoubleSide,
      transparent: true,
    });
  }
}

export { HairMaterial };
