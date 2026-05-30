import * as THREE from 'three';

/**
 * FlashlightSystem - SpotLight rigged to the camera with a battery model.
 *
 * The light + its target are added to the camera as children, so it tracks
 * head movement automatically. We slightly offset the source down and right
 * so it reads as a handheld torch rather than a forehead beam.
 *
 * Battery is normalized [0..1]. When the battery drops below FLICKER_THRESHOLD
 * the light starts random dimming; below CRITICAL_THRESHOLD it gutters and
 * may briefly cut out. Hitting zero turns the light off entirely until the
 * player picks up a battery.
 */
export class FlashlightSystem {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;

    this.isOn = false;
    this.battery = 1.0; // 0..1
    this.drainRate = 0.007; // per second while on
    this.maxIntensity = 24;

    this.DIM_THRESHOLD = 0.20;
    this.FLICKER_THRESHOLD = 0.20;
    this.CRITICAL_THRESHOLD = 0.08;

    this.spot = new THREE.SpotLight(
      0xfff2cc,
      0,                  // intensity (driven by update)
      40,                 // distance
      Math.PI / 5,        // angle (cone)
      0.5,                // penumbra (softness)
      1.0                 // decay
    );
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.bias = -0.0005;
    this.spot.shadow.camera.near = 0.3;
    this.spot.shadow.camera.far = 36;

    // Place the light slightly below-and-right of the camera
    this.spot.position.set(0.25, -0.2, 0);
    // Aim down the camera's local -Z axis
    this.spot.target.position.set(0, 0, -1);
    this.camera.add(this.spot);
    this.camera.add(this.spot.target);

    // Faint, very short "fill" light from the player so they're not in pure
    // black when the flashlight is off — keeps the floor barely visible.
    this.fill = new THREE.PointLight(0xffeecc, 1.4, 10, 2);
    this.camera.add(this.fill);

    this._flickerNoise = 0;
  }

  turnOn() {
    if (this.battery <= 0) return;
    this.isOn = true;
  }

  turnOff() {
    this.isOn = false;
  }

  toggle() {
    if (this.isOn) this.turnOff();
    else this.turnOn();
  }

  recharge() {
    // Battery pickups always refill to 100%.
    this.battery = 1.0;
    // Auto-turn-on after recharge if it had died
    if (!this.isOn) this.isOn = true;
  }

  update(delta, player) {
    // Drain battery while on
    if (this.isOn && this.battery > 0) {
      this.battery = Math.max(0, this.battery - this.drainRate * delta);
      if (this.battery <= 0) this.isOn = false;
    }

    if (!this.isOn) {
      this.spot.intensity = 0;
      return;
    }

    // Full brightness until battery dips below DIM_THRESHOLD; then ramps down.
    let intensity = this.maxIntensity;
    if (this.battery < this.DIM_THRESHOLD) {
      const t = Math.max(0, this.battery) / this.DIM_THRESHOLD;
      intensity *= Math.max(0.15, t);
    }

    // Flicker at low battery
    if (this.battery < this.FLICKER_THRESHOLD) {
      this._flickerNoise += delta * (15 + (1 - this.battery) * 50);
      const noise = Math.sin(this._flickerNoise) * 0.5 + 0.5;
      const flicker = 0.6 + noise * 0.5;
      intensity *= flicker;
      // Below critical threshold, random brief cuts
      if (this.battery < this.CRITICAL_THRESHOLD && Math.random() < 0.05) {
        intensity *= 0.1;
      }
    }

    this.spot.intensity = intensity;
  }
}
