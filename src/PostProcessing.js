import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * PostProcessing - Composer pipeline producing the cinematic horror look.
 *
 *   RenderPass        — main scene render
 *   UnrealBloomPass   — soft glow around emissive surfaces (flashlight, eyes,
 *                       emergency lamps, exit door)
 *   Vignette          — heavy darken at the edges
 *   ChromaticAberration— color fringing, ramps up during chase
 *   FilmGrain         — moving noise overlay
 *   OutputPass        — colorspace conversion
 *
 * setChase() drives chromatic aberration + grain intensity based on whether
 * the monster is actively chasing the player.
 */
export class PostProcessing {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.composer.setSize(window.innerWidth, window.innerHeight);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.45,  // strength
      0.7,   // radius
      0.75   // threshold
    );
    this.composer.addPass(this.bloomPass);

    this.vignettePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        intensity: { value: 0.55 },
        smoothness: { value: 0.82 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float intensity;
        uniform float smoothness;
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          vec2 center = vUv - vec2(0.5);
          float dist = length(center);
          float vignette = smoothstep(smoothness, 0.95, dist) * intensity;
          color.rgb *= clamp(1.0 - vignette, 0.0, 1.0);
          gl_FragColor = color;
        }
      `
    });
    this.composer.addPass(this.vignettePass);

    this.chromaPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0.0025 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float amount;
        void main() {
          vec2 dir = vUv - vec2(0.5);
          float r = texture2D(tDiffuse, vUv + dir * amount).r;
          float g = texture2D(tDiffuse, vUv).g;
          float b = texture2D(tDiffuse, vUv - dir * amount).b;
          float a = texture2D(tDiffuse, vUv).a;
          gl_FragColor = vec4(r, g, b, a);
        }
      `
    });
    this.composer.addPass(this.chromaPass);

    this.grainPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        intensity: { value: 0.035 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float intensity;
        float rand(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          float n = rand(vUv * (1.0 + fract(time))) * 2.0 - 1.0;
          color.rgb += n * intensity;
          gl_FragColor = color;
        }
      `
    });
    this.composer.addPass(this.grainPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this._chaseT = 0;
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  setChase(isChasing, monsterDist) {
    // Smoothly ramp toward chase target
    const target = isChasing ? 1 : 0;
    this._chaseT += (target - this._chaseT) * 0.08;

    // Chromatic aberration ramps up significantly during chase
    this.chromaPass.uniforms.amount.value = 0.0018 + this._chaseT * 0.01;
    // Grain intensifies
    this.grainPass.uniforms.intensity.value = 0.035 + this._chaseT * 0.05;
    // Tighter vignette when monster is close
    const closenessVignette = monsterDist < 6 ? (6 - monsterDist) / 6 : 0;
    this.vignettePass.uniforms.intensity.value = 0.55 + closenessVignette * 0.4 + this._chaseT * 0.2;
  }

  render(delta) {
    this.grainPass.uniforms.time.value += delta;
    this.composer.render(delta);
  }
}
