import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * Player - First-person controller.
 * Wraps the camera in PointerLockControls for mouse look, handles WASD
 * (and analog joystick) movement, applies subtle head-bob while walking.
 *
 * Movement is collision-aware via CollisionSystem.moveEntity which slides
 * along walls instead of stopping dead at them.
 */
export class Player {
  constructor(camera, domElement, collisionSystem, maze) {
    this.camera = camera;
    this.collision = collisionSystem;
    this.maze = maze;

    this.controls = new PointerLockControls(camera, domElement);
    this.object = this.controls.getObject(); // yaw container (a Group)

    this.velocity = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._moveDir = new THREE.Vector3();

    this.walkSpeed = 5.8;
    this.acceleration = 12;
    this.friction = 10;

    this.keys = {
      forward: false,
      back: false,
      left: false,
      right: false
    };

    // Analog input from a virtual joystick (mobile). x = strafe, z = forward.
    // Range ~[-1, 1] each; magnitude clamped to 1 when combined with keyboard.
    this.touchAxes = { x: 0, z: 0 };

    // Head bob state
    this.bobTime = 0;
    this.baseY = 1.6;
    this.isMoving = false;
    this.footstepTimer = 0;

    this.bindInput();
  }

  bindInput() {
    document.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.keys.forward = true; break;
        case 'KeyS': case 'ArrowDown': this.keys.back = true; break;
        case 'KeyA': case 'ArrowLeft': this.keys.left = true; break;
        case 'KeyD': case 'ArrowRight': this.keys.right = true; break;
      }
    });
    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.keys.forward = false; break;
        case 'KeyS': case 'ArrowDown': this.keys.back = false; break;
        case 'KeyA': case 'ArrowLeft': this.keys.left = false; break;
        case 'KeyD': case 'ArrowRight': this.keys.right = false; break;
      }
    });
  }

  setPosition(x, y, z) {
    this.object.position.set(x, y, z);
    this.baseY = y;
  }

  update(delta) {
    // Build world-space forward/right from the camera's actual orientation.
    // Reading rotation.y is unreliable here: PointerLockControls writes the
    // camera quaternion via YXZ Euler, but Object3D's rotation Euler decodes
    // as XYZ — so when pitched up/down the recovered "yaw" can flip sign and
    // invert WASD. Deriving from the world direction sidesteps that entirely.
    this.camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    if (this._forward.lengthSq() < 1e-6) {
      // Looking straight up/down — fall back to a sane forward
      this._forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this._forward.y = 0;
    }
    this._forward.normalize();
    this._right.crossVectors(this._forward, this._up).normalize();

    // Combine keyboard (unit booleans) with joystick (analog axes).
    let strafe  = (this.keys.right   ? 1 : 0) - (this.keys.left ? 1 : 0) + this.touchAxes.x;
    let forward = (this.keys.forward ? 1 : 0) - (this.keys.back ? 1 : 0) + this.touchAxes.z;
    const mag = Math.hypot(strafe, forward);
    if (mag > 1) { strafe /= mag; forward /= mag; }

    this._moveDir.set(0, 0, 0)
      .addScaledVector(this._forward, forward)
      .addScaledVector(this._right,   strafe);

    const inputMagnitude = Math.min(1, mag);
    this.isMoving = inputMagnitude > 0.01;

    const targetSpeed = this.walkSpeed;
    const worldDesiredX = this._moveDir.x * targetSpeed;
    const worldDesiredZ = this._moveDir.z * targetSpeed;

    // Simple lerped acceleration
    const accel = this.isMoving ? this.acceleration : this.friction;
    this.velocity.x += (worldDesiredX - this.velocity.x) * Math.min(1, accel * delta);
    this.velocity.z += (worldDesiredZ - this.velocity.z) * Math.min(1, accel * delta);

    // Apply movement through collision
    const dx = this.velocity.x * delta;
    const dz = this.velocity.z * delta;
    this.collision.moveEntity(this.object.position, dx, dz, this.collision.playerRadius);

    // Head bob (only when actually moving — sampled by horizontal velocity)
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const bobFreq = 8;
    const bobAmp = 0.06;
    if (speed > 0.5) {
      this.bobTime += delta * bobFreq;
      const bob = Math.sin(this.bobTime) * bobAmp;
      this.object.position.y = this.baseY + bob;
      this.footstepTimer += delta;
    } else {
      // Settle back to base height
      this.object.position.y += (this.baseY - this.object.position.y) * Math.min(1, 10 * delta);
      this.footstepTimer = 0;
    }
  }

  /** True if the player took a footstep this frame (consumed by AudioManager). */
  consumeFootstep() {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed < 0.5) return false;
    const interval = 0.38;
    if (this.footstepTimer >= interval) {
      this.footstepTimer = 0;
      return true;
    }
    return false;
  }
}
