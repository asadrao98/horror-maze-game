import * as THREE from 'three';

/**
 * MonsterAI - Tall humanoid stalker with a 3-state behavior tree:
 *
 *   patrol  - wanders between random cells. Slow, mostly indifferent.
 *   search  - heard / saw something. Moves toward last-known player cell.
 *   chase   - has line-of-sight or is very close. Fastest. Holds chase for a
 *             grace period after losing LOS so the player has to actually break
 *             contact and hide.
 *
 * Pathfinding uses BFS on the maze grid, recomputed when the target cell
 * changes. We step along the path in world space, with the same collision
 * system as the player so the monster can't clip through walls.
 *
 * Sensory model:
 *   - Direct line-of-sight (via CollisionSystem.hasLineOfSight) is the main
 *     trigger for chase.
 *   - The player's flashlight beam dramatically increases detection range
 *     when pointed at the monster.
 *   - Sprinting close to the monster ("noise") forces it into search even
 *     without LOS.
 *
 * Random teleport: every so often, while in patrol and far from the player,
 * the monster may relocate to a random distant cell. This is what produces
 * the "where did it come from?!" jumpscares without spamming the player.
 */
export class MonsterAI {
  constructor(scene, maze, collision, audio) {
    this.scene = scene;
    this.maze = maze;
    this.collision = collision;
    this.audio = audio;

    this.state = 'patrol';
    this.stateTimer = 0;
    this.path = [];
    this.pathIndex = 0;
    this.lastKnownPlayerCell = null;
    this.chaseGrace = 0; // remaining time to keep chasing after losing LOS

    this.patrolTarget = null;
    this.repositionTimer = 8 + Math.random() * 10;

    this.speeds = { patrol: 1.6, search: 2.4, chase: 3.6 };
    this.detectionRange = 7;
    this.flashlightRange = 18;
    this.noiseRange = 9;
    this.catchDistance = 1.1;

    this.mesh = this.buildMesh();
    this.scene.add(this.mesh);

    this._tmpVec = new THREE.Vector3();
    this._growlTimer = 0;
  }

  buildMesh() {
    const group = new THREE.Group();

    // Body: tall, gaunt, dark
    const bodyGeo = new THREE.CylinderGeometry(0.28, 0.35, 1.7, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 1.0,
      metalness: 0.0,
      emissive: 0x000000
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.85;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.22, 10, 8);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.85;
    head.castShadow = true;
    group.add(head);

    // Eyes — small emissive spheres, glow even in pitch black
    const eyeGeo = new THREE.SphereGeometry(0.035, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.08, 1.88, 0.2);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.08, 1.88, 0.2);
    group.add(rightEye);
    this.eyes = [leftEye, rightEye];

    // Faint point light just at the head — readable as eye-glow in fog
    const glow = new THREE.PointLight(0xff2200, 0.25, 2.0, 2);
    glow.position.set(0, 1.85, 0);
    group.add(glow);
    this.glowLight = glow;

    // Long arms — two thin cylinders dangling
    const armGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.1, 6);
    const leftArm = new THREE.Mesh(armGeo, bodyMat);
    leftArm.position.set(-0.32, 1.0, 0);
    leftArm.castShadow = true;
    group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, bodyMat);
    rightArm.position.set(0.32, 1.0, 0);
    rightArm.castShadow = true;
    group.add(rightArm);
    this.arms = [leftArm, rightArm];

    return group;
  }

  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
  }

  distanceTo(pos) {
    const dx = pos.x - this.mesh.position.x;
    const dz = pos.z - this.mesh.position.z;
    return Math.hypot(dx, dz);
  }

  update(delta, player, flashlight) {
    this.stateTimer += delta;
    this._growlTimer -= delta;

    const playerPos = player.object.position;
    const monsterPos = this.mesh.position;
    const dist = this.distanceTo(playerPos);

    // --- Sensing --------------------------------------------------------------
    const hasLOS = this.collision.hasLineOfSight(
      monsterPos.x, monsterPos.z, playerPos.x, playerPos.z
    );

    // Effective detection: short by default, much longer when flashlight beam
    // is on the monster or when the monster is in the cone of light.
    let detectDist = this.detectionRange;
    if (flashlight.isOn) {
      // Is the monster within the flashlight cone, as seen from the camera?
      const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(flashlight.camera.quaternion);
      const toMonster = this._tmpVec.set(
        monsterPos.x - playerPos.x,
        0,
        monsterPos.z - playerPos.z
      );
      const distXZ = toMonster.length();
      if (distXZ > 0.01) toMonster.normalize();
      const dot = toMonster.dot(camForward.setY(0).normalize());
      if (dot > 0.55) detectDist = this.flashlightRange;
    }

    const noisy = player.isSprinting && dist < this.noiseRange;
    const seesPlayer = hasLOS && dist < detectDist;

    // --- State transitions ----------------------------------------------------
    if (this.state !== 'chase' && seesPlayer) {
      this.enterChase(playerPos);
    } else if (this.state === 'chase') {
      if (seesPlayer) {
        this.lastKnownPlayerCell = this.maze.worldToCell(playerPos.x, playerPos.z);
        this.chaseGrace = 3.0;
      } else {
        this.chaseGrace -= delta;
        if (this.chaseGrace <= 0) {
          this.enterSearch(this.lastKnownPlayerCell);
        }
      }
    } else if (this.state === 'patrol' && noisy) {
      this.enterSearch(this.maze.worldToCell(playerPos.x, playerPos.z));
    } else if (this.state === 'search') {
      // Reached target or timed out
      if (this.path.length === 0 || this.stateTimer > 10) {
        this.enterPatrol();
      }
    }

    // Random "reposition" while patrolling, if monster has been calm a while
    // and isn't near the player. This adds unpredictability.
    if (this.state === 'patrol') {
      this.repositionTimer -= delta;
      if (this.repositionTimer <= 0 && dist > 12) {
        const cell = this.maze.findFarCell(
          this.maze.worldToCell(playerPos.x, playerPos.z).x,
          this.maze.worldToCell(playerPos.x, playerPos.z).y
        );
        // Teleport partway between current and far cell to feel like it's stalking
        const pos = this.maze.cellToWorld(cell.x, cell.y);
        this.setPosition(pos.x, 0, pos.z);
        this.path = [];
        this.repositionTimer = 15 + Math.random() * 10;
      }
    }

    // --- Movement -------------------------------------------------------------
    this.followPath(delta);
    this.animateLimbs(delta);
    this.faceMovement();

    // Audio cues — distance/state driven
    if (this._growlTimer <= 0) {
      if (this.state === 'chase') {
        this.audio?.playGrowl(true);
        this._growlTimer = 1.8 + Math.random() * 0.8;
      } else if (this.state === 'search' && dist < 12) {
        this.audio?.playGrowl(false);
        this._growlTimer = 4 + Math.random() * 2;
      } else if (dist < 9 && Math.random() < 0.4) {
        this.audio?.playGrowl(false);
        this._growlTimer = 5 + Math.random() * 4;
      } else {
        this._growlTimer = 2;
      }
    }
  }

  enterPatrol() {
    this.state = 'patrol';
    this.stateTimer = 0;
    this.repositionTimer = 8 + Math.random() * 8;
    // Pick a random reachable cell
    const target = this.maze.randomCellAtLeast(3, new Set());
    if (target) {
      const here = this.maze.worldToCell(this.mesh.position.x, this.mesh.position.z);
      this.computePath(here, target);
    } else {
      this.path = [];
    }
  }

  enterSearch(targetCell) {
    this.state = 'search';
    this.stateTimer = 0;
    if (!targetCell) {
      this.enterPatrol();
      return;
    }
    const here = this.maze.worldToCell(this.mesh.position.x, this.mesh.position.z);
    this.computePath(here, targetCell);
  }

  enterChase(playerPos) {
    this.state = 'chase';
    this.stateTimer = 0;
    this.chaseGrace = 3.0;
    this.lastKnownPlayerCell = this.maze.worldToCell(playerPos.x, playerPos.z);
    const here = this.maze.worldToCell(this.mesh.position.x, this.mesh.position.z);
    this.computePath(here, this.lastKnownPlayerCell);
    this.audio?.playGrowl(true);
  }

  /** BFS on the maze grid; stores world-space waypoints in this.path. */
  computePath(from, to) {
    if (!from || !to || (from.x === to.x && from.y === to.y)) {
      this.path = [];
      this.pathIndex = 0;
      return;
    }
    const visited = new Map();
    const key = (x, y) => `${x},${y}`;
    const queue = [from];
    visited.set(key(from.x, from.y), null);

    let found = false;
    while (queue.length) {
      const c = queue.shift();
      if (c.x === to.x && c.y === to.y) { found = true; break; }
      for (const n of this.maze.getReachableNeighbors(c.x, c.y)) {
        const k = key(n.x, n.y);
        if (!visited.has(k)) {
          visited.set(k, { x: c.x, y: c.y });
          queue.push(n);
        }
      }
    }

    if (!found) {
      this.path = [];
      this.pathIndex = 0;
      return;
    }

    // Reconstruct
    const cells = [];
    let cur = to;
    while (cur) {
      cells.push(cur);
      cur = visited.get(key(cur.x, cur.y));
    }
    cells.reverse();
    // Skip the very first cell since it's where we already are
    this.path = cells.slice(1).map(c => this.maze.cellToWorld(c.x, c.y));
    this.pathIndex = 0;
  }

  followPath(delta) {
    if (this.path.length === 0) return;
    const speed = this.speeds[this.state] || this.speeds.patrol;
    const target = this.path[this.pathIndex];
    if (!target) return;

    const dx = target.x - this.mesh.position.x;
    const dz = target.z - this.mesh.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.2) {
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) {
        this.path = [];
        this.pathIndex = 0;
      }
      return;
    }

    const moveX = (dx / dist) * speed * delta;
    const moveZ = (dz / dist) * speed * delta;
    this.collision.moveEntity(
      this.mesh.position,
      moveX,
      moveZ,
      this.collision.monsterRadius
    );
    this.lastMoveDir = { x: moveX, z: moveZ };
  }

  faceMovement() {
    if (!this.lastMoveDir) return;
    const { x, z } = this.lastMoveDir;
    if (Math.hypot(x, z) < 0.001) return;
    const yaw = Math.atan2(x, z) + Math.PI;
    // Smooth turn toward yaw
    let delta = yaw - this.mesh.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.mesh.rotation.y += delta * 0.12;
  }

  animateLimbs(delta) {
    if (!this.arms) return;
    const moving = !!this.lastMoveDir && Math.hypot(this.lastMoveDir.x, this.lastMoveDir.z) > 0.001;
    const speedFactor = this.speeds[this.state] || 1;
    if (moving) {
      this._limbTime = (this._limbTime || 0) + delta * speedFactor * 3;
      const swing = Math.sin(this._limbTime) * 0.35;
      this.arms[0].rotation.x = swing;
      this.arms[1].rotation.x = -swing;
    }
    // Pulse glow with state intensity
    if (this.glowLight) {
      const base = this.state === 'chase' ? 0.6 : this.state === 'search' ? 0.35 : 0.2;
      this.glowLight.intensity = base + Math.sin(performance.now() * 0.006) * 0.1;
    }
  }
}
