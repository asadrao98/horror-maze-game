import * as THREE from 'three';
import { Player } from './Player.js';
import { MazeGenerator } from './MazeGenerator.js';
import { Environment } from './Environment.js';
import { FlashlightSystem } from './FlashlightSystem.js';
import { MonsterAI } from './MonsterAI.js';
import { AudioManager } from './AudioManager.js';
import { UI } from './UI.js';
import { PostProcessing } from './PostProcessing.js';
import { CollisionSystem } from './CollisionSystem.js';

/**
 * Game - Top-level orchestrator. Owns the scene, renderer, and all subsystems.
 * Handles the main loop, state transitions (menu / playing / paused / dead / win),
 * and routes input events into the right subsystem.
 */
export class Game {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | dead | win
    this.clock = new THREE.Clock();
    this.elapsed = 0;

    // Maze layout config
    this.mazeConfig = {
      cols: 15,
      rows: 15,
      cellSize: 4,
      wallHeight: 3.2
    };

    // Game progression
    this.keysCollected = 0;
    this.totalKeys = 3;
    this.pickups = []; // { mesh, type, gridX, gridY }
    this.exit = null;
  }

  init() {
    this.setupRenderer();
    this.setupScene();
    this.setupSystems();
    this.bindUI();
    this.bindResize();
    this.animate();
  }

  setupRenderer() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.6;
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x0a0a10, 0.04);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      80
    );
  }

  setupSystems() {
    // Maze first — its grid drives positions for everything else
    this.maze = new MazeGenerator(this.mazeConfig);
    this.maze.generate();

    this.collision = new CollisionSystem(this.maze);

    this.environment = new Environment(this.scene, this.maze);
    this.environment.build();

    this.player = new Player(this.camera, this.renderer.domElement, this.collision, this.maze);
    this.scene.add(this.player.object);

    this.flashlight = new FlashlightSystem(this.camera, this.scene);

    this.audio = new AudioManager(this.camera);

    this.monster = new MonsterAI(this.scene, this.maze, this.collision, this.audio);

    this.ui = new UI();

    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera);

    this.placePickupsAndExit();

    // Player starts at first cell, monster spawns far away
    const start = this.maze.cellToWorld(0, 0);
    this.player.setPosition(start.x, 1.6, start.z);
    const monsterCell = this.maze.findFarCell(0, 0);
    const monsterPos = this.maze.cellToWorld(monsterCell.x, monsterCell.y);
    this.monster.setPosition(monsterPos.x, 0, monsterPos.z);
  }

  /**
   * Spread keys and batteries across the maze. Keys are placed in cells far from
   * the start to force exploration; batteries scattered more liberally.
   */
  placePickupsAndExit() {
    const used = new Set();
    used.add('0,0');

    // Exit at far corner
    const exitCell = { x: this.mazeConfig.cols - 1, y: this.mazeConfig.rows - 1 };
    const exitPos = this.maze.cellToWorld(exitCell.x, exitCell.y);
    this.exit = this.createExit(exitPos);
    this.scene.add(this.exit);
    used.add(`${exitCell.x},${exitCell.y}`);

    // 3 keys
    for (let i = 0; i < this.totalKeys; i++) {
      const cell = this.maze.randomCellAtLeast(8, used);
      if (!cell) break;
      used.add(`${cell.x},${cell.y}`);
      const pos = this.maze.cellToWorld(cell.x, cell.y);
      const key = this.createKey(pos);
      this.scene.add(key);
      this.pickups.push({ mesh: key, type: 'key', gridX: cell.x, gridY: cell.y });
    }

    // 5 batteries
    for (let i = 0; i < 5; i++) {
      const cell = this.maze.randomCellAtLeast(3, used);
      if (!cell) break;
      used.add(`${cell.x},${cell.y}`);
      const pos = this.maze.cellToWorld(cell.x, cell.y);
      const battery = this.createBattery(pos);
      this.scene.add(battery);
      this.pickups.push({ mesh: battery, type: 'battery', gridX: cell.x, gridY: cell.y });
    }
  }

  createKey(pos) {
    const group = new THREE.Group();
    const geo = new THREE.TorusGeometry(0.15, 0.04, 8, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffcc44,
      emissive: 0xffaa22,
      emissiveIntensity: 0.6,
      metalness: 0.9,
      roughness: 0.3
    });
    const ring = new THREE.Mesh(geo, mat);
    const shaftGeo = new THREE.BoxGeometry(0.04, 0.04, 0.3);
    const shaft = new THREE.Mesh(shaftGeo, mat);
    shaft.position.z = 0.18;
    group.add(ring);
    group.add(shaft);

    // Glowing aura light
    const light = new THREE.PointLight(0xffaa22, 0.8, 3);
    light.position.set(0, 0, 0);
    group.add(light);

    group.position.set(pos.x, 1.2, pos.z);
    group.userData.bobOffset = Math.random() * Math.PI * 2;
    return group;
  }

  createBattery(pos) {
    const group = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.22, 12);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x224488,
      emissive: 0x1155aa,
      emissiveIntensity: 0.4,
      metalness: 0.7,
      roughness: 0.4
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);
    const tipGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.9 });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.y = 0.13;
    group.add(tip);

    const light = new THREE.PointLight(0x4488ff, 0.6, 2.5);
    group.add(light);

    group.position.set(pos.x, 1.2, pos.z);
    group.userData.bobOffset = Math.random() * Math.PI * 2;
    return group;
  }

  createExit(pos) {
    const group = new THREE.Group();
    const doorGeo = new THREE.BoxGeometry(1.6, 2.6, 0.15);
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x442211,
      emissive: 0x110000,
      emissiveIntensity: 0.2,
      roughness: 0.95
    });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.y = 1.3;
    door.castShadow = true;
    group.add(door);

    // Red glow around exit
    const light = new THREE.PointLight(0xff2200, 1.4, 6);
    light.position.set(0, 2.3, 0);
    group.add(light);
    group.userData.exitLight = light;

    group.position.set(pos.x, 0, pos.z);
    return group;
  }

  // --- UI bindings ---

  bindUI() {
    document.getElementById('start-button').addEventListener('click', () => this.startGame());
    document.getElementById('resume-button').addEventListener('click', () => this.resumeGame());
    document.getElementById('restart-button').addEventListener('click', () => this.restart());
    document.getElementById('retry-button').addEventListener('click', () => this.restart());
    document.getElementById('play-again-button').addEventListener('click', () => this.restart());

    document.addEventListener('pointerlockchange', () => {
      if (this.state !== 'playing') return;
      if (document.pointerLockElement !== this.renderer.domElement) {
        this.pauseGame();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state === 'playing') this.pauseGame();
      }
      if (this.state !== 'playing') return;

      if (e.code === 'KeyF') this.flashlight.toggle();
      if (e.code === 'KeyE') this.tryInteract();
    });
  }

  bindResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.postProcessing.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // --- Game state ---

  startGame() {
    document.getElementById('start-menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.audio.init();
    this.audio.startAmbient();
    this.player.controls.lock();
    this.state = 'playing';
    this.flashlight.turnOn();
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    document.getElementById('pause-menu').classList.remove('hidden');
    this.player.controls.unlock();
  }

  resumeGame() {
    document.getElementById('pause-menu').classList.add('hidden');
    this.state = 'playing';
    this.player.controls.lock();
  }

  restart() {
    // Tear down scene contents and rebuild
    document.getElementById('death-screen').classList.add('hidden');
    document.getElementById('win-screen').classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');

    this.clearScene();
    this.keysCollected = 0;
    this.pickups = [];
    this.setupSystems();
    this.ui.setKeys(0, this.totalKeys);
    this.ui.setBattery(1.0);
    this.ui.setObjective('Find the keys. Escape the maze.');
    this.startGame();
  }

  clearScene() {
    // Remove everything except the camera. Dispose geometries/materials.
    while (this.scene.children.length > 0) {
      const obj = this.scene.children[0];
      this.scene.remove(obj);
      this.disposeObject(obj);
    }
  }

  disposeObject(obj) {
    obj.traverse?.((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }

  die() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.audio.playJumpscare();
    this.ui.showJumpscare();
    this.player.controls.unlock();
    setTimeout(() => {
      document.getElementById('death-screen').classList.remove('hidden');
    }, 700);
  }

  win() {
    if (this.state !== 'playing') return;
    this.state = 'win';
    this.audio.playWin();
    this.player.controls.unlock();
    document.getElementById('win-screen').classList.remove('hidden');
  }

  // --- Interactions ---

  tryInteract() {
    const playerPos = this.player.object.position;
    const reach = 1.8;

    // Try pickups first
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const dx = p.mesh.position.x - playerPos.x;
      const dz = p.mesh.position.z - playerPos.z;
      if (Math.hypot(dx, dz) < reach) {
        this.collectPickup(p);
        this.pickups.splice(i, 1);
        return;
      }
    }

    // Try exit
    if (this.exit) {
      const dx = this.exit.position.x - playerPos.x;
      const dz = this.exit.position.z - playerPos.z;
      if (Math.hypot(dx, dz) < reach + 0.5) {
        if (this.keysCollected >= this.totalKeys) {
          this.win();
        } else {
          this.ui.showWarning(`NEED ${this.totalKeys - this.keysCollected} MORE KEY${this.totalKeys - this.keysCollected > 1 ? 'S' : ''}`);
        }
      }
    }
  }

  collectPickup(pickup) {
    this.scene.remove(pickup.mesh);
    this.disposeObject(pickup.mesh);

    if (pickup.type === 'key') {
      this.keysCollected++;
      this.ui.setKeys(this.keysCollected, this.totalKeys);
      this.audio.playPickup(true);
      if (this.keysCollected >= this.totalKeys) {
        this.ui.setObjective('All keys found. Reach the exit.');
      }
    } else if (pickup.type === 'battery') {
      this.flashlight.recharge(0.4);
      this.audio.playPickup(false);
    }
  }

  // --- Main loop ---

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += delta;

    if (this.state === 'playing') {
      this.update(delta);
    }

    this.postProcessing.render(delta);
  }

  update(delta) {
    this.player.update(delta);
    this.flashlight.update(delta, this.player);
    this.monster.update(delta, this.player, this.flashlight);
    this.environment.update(delta, this.elapsed, this.player.object.position);

    this.updatePickups(delta);
    this.updateAudio();
    this.updatePostFX();
    this.checkMonsterCatch();
    this.updateInteractPrompt();
  }

  updatePickups(delta) {
    for (const p of this.pickups) {
      const m = p.mesh;
      m.position.y = 1.2 + Math.sin(this.elapsed * 2 + m.userData.bobOffset) * 0.1;
      m.rotation.y += delta * 1.2;
    }
    if (this.exit) {
      const light = this.exit.userData.exitLight;
      if (light) {
        light.intensity = 1.2 + Math.sin(this.elapsed * 4) * 0.4;
      }
    }
  }

  updateAudio() {
    const dist = this.monster.distanceTo(this.player.object.position);
    this.audio.setMonsterProximity(dist);
    this.audio.setHeartbeatIntensity(this.monster.state === 'chase' ? 1 : Math.max(0, 1 - dist / 14));
  }

  updatePostFX() {
    const monsterDist = this.monster.distanceTo(this.player.object.position);
    const chasing = this.monster.state === 'chase';
    // Camera shake on chase + chromatic aberration ramp
    this.postProcessing.setChase(chasing, monsterDist);
    if (chasing) {
      const shake = 0.04;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }
    // Red damage vignette when monster very close
    const vignette = document.getElementById('damage-vignette');
    if (monsterDist < 4) vignette.classList.add('active');
    else vignette.classList.remove('active');

    // Battery warning UI
    this.ui.setBattery(this.flashlight.battery);
    if (this.flashlight.battery < 0.15 && this.flashlight.isOn) {
      this.ui.showWarning('LOW BATTERY');
    } else {
      this.ui.hideWarning();
    }
  }

  checkMonsterCatch() {
    const dist = this.monster.distanceTo(this.player.object.position);
    if (dist < 1.1) this.die();
  }

  updateInteractPrompt() {
    const playerPos = this.player.object.position;
    const reach = 1.8;
    let label = null;

    for (const p of this.pickups) {
      const dx = p.mesh.position.x - playerPos.x;
      const dz = p.mesh.position.z - playerPos.z;
      if (Math.hypot(dx, dz) < reach) {
        label = p.type === 'key' ? '[E] Pick Up Key' : '[E] Pick Up Battery';
        break;
      }
    }
    if (!label && this.exit) {
      const dx = this.exit.position.x - playerPos.x;
      const dz = this.exit.position.z - playerPos.z;
      if (Math.hypot(dx, dz) < reach + 0.5) {
        label = this.keysCollected >= this.totalKeys ? '[E] Escape' : '[E] Locked';
      }
    }

    this.ui.setInteractPrompt(label);
  }

  dispose() {
    this.renderer?.dispose();
    this.audio?.dispose();
  }
}
