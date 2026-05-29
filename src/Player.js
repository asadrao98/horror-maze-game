import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * Player - First-person controller.
 * Wraps the camera in PointerLockControls for mouse look, handles WASD
 * movement with sprint, applies subtle head-bob while walking, and amplifies
 * head-bob into a "breathing" effect while sprinting.
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
    this.direction = new THREE.Vector3();

    this.walkSpeed = 3.4;
    this.sprintSpeed = 5.8;
    this.acceleration = 12;
    this.friction = 10;

    this.keys = {
      forward: false,
      back: false,
      left: false,
      right: false,
      sprint: false
    };

    // Head bob / breathing state
    this.bobTime = 0;
    this.baseY = 1.6;

    // Stamina governs sprint duration. Drains while sprinting, regens at rest.
    this.stamina = 1.0;
    this.isSprinting = false;
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
        case 'ShiftLeft': case 'ShiftRight': this.keys.sprint = true; break;
      }
    });
    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.keys.forward = false; break;
        case 'KeyS': case 'ArrowDown': this.keys.back = false; break;
        case 'KeyA': case 'ArrowLeft': this.keys.left = false; break;
        case 'KeyD': case 'ArrowRight': this.keys.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.keys.sprint = false; break;
      }
    });
  }

  setPosition(x, y, z) {
    this.object.position.set(x, y, z);
    this.baseY = y;
  }

  update(delta) {
    // Input vector (camera-space)
    this.direction.x = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    this.direction.z = (this.keys.back ? 1 : 0) - (this.keys.forward ? 1 : 0);
    this.direction.y = 0;
    const inputMagnitude = this.direction.length();
    this.isMoving = inputMagnitude > 0.01;
    if (this.isMoving) this.direction.normalize();

    this.isSprinting = this.keys.sprint && this.isMoving && this.keys.forward && this.stamina > 0.05;
    const targetSpeed = this.isSprinting ? this.sprintSpeed : this.walkSpeed;

    // Stamina
    if (this.isSprinting) {
      this.stamina = Math.max(0, this.stamina - delta * 0.25);
    } else {
      this.stamina = Math.min(1, this.stamina + delta * 0.15);
    }

    // Accelerate toward target velocity
    const desired = new THREE.Vector3();
    if (this.isMoving) {
      desired.copy(this.direction).multiplyScalar(targetSpeed);
    }

    // Convert desired (local) to world-space via the camera's yaw
    const yaw = this.object.rotation.y;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const worldDesiredX = desired.x * cosY - desired.z * sinY;
    const worldDesiredZ = desired.x * sinY + desired.z * cosY;

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
    const bobFreq = this.isSprinting ? 9 : 6;
    const bobAmp = this.isSprinting ? 0.08 : 0.04;
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
    const interval = this.isSprinting ? 0.32 : 0.5;
    if (this.footstepTimer >= interval) {
      this.footstepTimer = 0;
      return true;
    }
    return false;
  }
}
