import * as THREE from 'three';

/**
 * Environment - Builds and animates the static world: floor, ceiling, walls,
 * decals, and atmospheric lights. Textures are procedurally generated on
 * 2D canvases so the project runs with zero external assets.
 *
 * Walls are merged into a single InstancedMesh per orientation for cheap
 * draw calls. Floor and ceiling are single planes covering the maze area.
 *
 * `update()` is called each frame to flicker the emergency lights and
 * subtly pulse the fog density for tension.
 */
export class Environment {
  constructor(scene, maze) {
    this.scene = scene;
    this.maze = maze;

    this.emergencyLights = []; // { light, baseIntensity, phase }
    this.flickerLights = [];
    this.baseFogDensity = 0.04;
    this._tmpVec = new THREE.Vector3();
  }

  build() {
    this.buildTextures();
    this.buildFloorAndCeiling();
    this.buildWalls();
    this.placeDecals();
    this.placeEmergencyLights();
    this.addAmbient();
  }

  // --- Procedural textures -------------------------------------------------

  buildTextures() {
    this.floorTex = this.makeFloorTexture();
    this.wallTex = this.makeWallTexture();
    this.ceilingTex = this.makeCeilingTexture();
    this.bloodTex = this.makeBloodTexture();
    this.scratchTex = this.makeScratchTexture();
  }

  makeFloorTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    // Base dark concrete
    ctx.fillStyle = '#1a1612';
    ctx.fillRect(0, 0, 512, 512);
    // Noise grime
    for (let i = 0; i < 14000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const a = Math.random() * 0.12;
      ctx.fillStyle = `rgba(40,30,22,${a})`;
      ctx.fillRect(x, y, 1, 1);
    }
    // Cracks
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    for (let i = 0; i < 30; i++) {
      ctx.beginPath();
      let x = Math.random() * 512;
      let y = Math.random() * 512;
      ctx.moveTo(x, y);
      const segs = 4 + Math.floor(Math.random() * 4);
      for (let j = 0; j < segs; j++) {
        x += (Math.random() - 0.5) * 50;
        y += (Math.random() - 0.5) * 50;
        ctx.lineTo(x, y);
      }
      ctx.lineWidth = 0.5 + Math.random();
      ctx.stroke();
    }
    // Occasional stains
    for (let i = 0; i < 6; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, 40);
      grad.addColorStop(0, 'rgba(60,15,10,0.45)');
      grad.addColorStop(1, 'rgba(60,15,10,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 40, y - 40, 80, 80);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  makeWallTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2a221c';
    ctx.fillRect(0, 0, 512, 512);
    // Brick-like horizontal bands
    for (let y = 0; y < 512; y += 64) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, y, 512, 2);
      // Offset vertical lines
      const off = (y / 64) % 2 === 0 ? 0 : 64;
      for (let x = off; x < 512; x += 128) {
        ctx.fillRect(x, y, 2, 64);
      }
    }
    // Stains/water drips
    for (let i = 0; i < 25; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const h = 60 + Math.random() * 200;
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.4, 'rgba(15,10,8,0.5)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 2, y, 4, h);
    }
    // Speckle grime
    for (let i = 0; i < 8000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.18})`;
      ctx.fillRect(x, y, 1, 1);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  makeCeilingTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0e0b09';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.4})`;
      ctx.fillRect(x, y, 1, 1);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  makeBloodTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    // Splatters
    for (let i = 0; i < 18; i++) {
      const x = 128 + (Math.random() - 0.5) * 100;
      const y = 128 + (Math.random() - 0.5) * 100;
      const r = 6 + Math.random() * 30;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(110,15,15,0.95)');
      grad.addColorStop(1, 'rgba(60,5,5,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Drips
    for (let i = 0; i < 8; i++) {
      const x = 50 + Math.random() * 156;
      ctx.fillStyle = 'rgba(80,8,8,0.7)';
      ctx.fillRect(x, 120 + Math.random() * 40, 2, 30 + Math.random() * 50);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  makeScratchTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(20,15,12,0.85)';
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      const x = 30 + Math.random() * 200;
      const y = 30 + Math.random() * 200;
      const len = 40 + Math.random() * 80;
      const ang = (Math.random() - 0.5) * 0.6;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.lineWidth = 0.4 + Math.random() * 1.2;
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // --- Geometry ------------------------------------------------------------

  buildFloorAndCeiling() {
    const cs = this.maze.cellSize;
    const w = this.maze.cols * cs;
    const h = this.maze.rows * cs;

    const floorGeo = new THREE.PlaneGeometry(w, h);
    const floorTex = this.floorTex.clone();
    floorTex.needsUpdate = true;
    floorTex.repeat.set(this.maze.cols * 0.7, this.maze.rows * 0.7);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.9,
      metalness: 0.05,
      color: 0x9a8a7e
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ceilTex = this.ceilingTex.clone();
    ceilTex.needsUpdate = true;
    ceilTex.repeat.set(this.maze.cols, this.maze.rows);
    ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
    const ceilMat = new THREE.MeshStandardMaterial({
      map: ceilTex,
      roughness: 1.0,
      color: 0x3a3636
    });
    const ceiling = new THREE.Mesh(floorGeo, ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, this.maze.wallHeight, 0);
    this.scene.add(ceiling);
  }

  buildWalls() {
    const segments = this.maze.getWallSegments();
    const cs = this.maze.cellSize;
    const wh = this.maze.wallHeight;
    const thickness = 0.4;

    // We split segments by axis so the wall texture maps coherently along
    // the long dimension. Use one InstancedMesh per axis.
    const xSegs = segments.filter(s => s.axis === 'x');
    const zSegs = segments.filter(s => s.axis === 'z');

    const wallTex = this.wallTex.clone();
    wallTex.needsUpdate = true;
    wallTex.repeat.set(1, 1);
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.85,
      metalness: 0.05,
      color: 0x8a7a6e
    });

    // Wall geometry oriented along X (length on X axis)
    const geoX = new THREE.BoxGeometry(cs, wh, thickness);
    const geoZ = new THREE.BoxGeometry(thickness, wh, cs);

    const meshX = new THREE.InstancedMesh(geoX, wallMat, Math.max(xSegs.length, 1));
    const meshZ = new THREE.InstancedMesh(geoZ, wallMat, Math.max(zSegs.length, 1));
    meshX.castShadow = true; meshX.receiveShadow = true;
    meshZ.castShadow = true; meshZ.receiveShadow = true;

    const dummy = new THREE.Object3D();
    xSegs.forEach((seg, i) => {
      dummy.position.set(seg.x, wh / 2, seg.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      meshX.setMatrixAt(i, dummy.matrix);
    });
    zSegs.forEach((seg, i) => {
      dummy.position.set(seg.x, wh / 2, seg.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      meshZ.setMatrixAt(i, dummy.matrix);
    });
    meshX.instanceMatrix.needsUpdate = true;
    meshZ.instanceMatrix.needsUpdate = true;

    this.scene.add(meshX);
    this.scene.add(meshZ);
  }

  placeDecals() {
    // Decals are simple alpha-mapped planes layered just above the floor or
    // pressed against walls. We scatter ~20 across the maze.
    const decalCount = Math.min(28, this.maze.cols * this.maze.rows / 8);
    for (let i = 0; i < decalCount; i++) {
      const x = Math.floor(Math.random() * this.maze.cols);
      const y = Math.floor(Math.random() * this.maze.rows);
      const world = this.maze.cellToWorld(x, y);
      const isBlood = Math.random() < 0.55;
      const tex = (isBlood ? this.bloodTex : this.scratchTex).clone();
      tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: isBlood ? 0.85 : 0.7,
        depthWrite: false
      });
      const geo = new THREE.PlaneGeometry(1.4, 1.4);
      const m = new THREE.Mesh(geo, mat);
      // Half decals on floor, half on walls
      if (Math.random() < 0.5) {
        m.rotation.x = -Math.PI / 2;
        m.position.set(
          world.x + (Math.random() - 0.5) * 1.5,
          0.02,
          world.z + (Math.random() - 0.5) * 1.5
        );
      } else {
        m.position.set(
          world.x + (Math.random() - 0.5) * 1.5,
          1.2 + Math.random() * 0.8,
          world.z + (Math.random() - 0.5) * 1.5
        );
        m.rotation.y = Math.random() * Math.PI * 2;
      }
      m.renderOrder = 1;
      this.scene.add(m);
    }
  }

  placeEmergencyLights() {
    // Place a few red emergency lights at random reachable cells. They flicker.
    const count = Math.max(3, Math.floor(this.maze.cols * this.maze.rows / 50));
    const used = new Set(['0,0']);
    for (let i = 0; i < count; i++) {
      let x, y, key;
      let attempts = 0;
      do {
        x = Math.floor(Math.random() * this.maze.cols);
        y = Math.floor(Math.random() * this.maze.rows);
        key = `${x},${y}`;
        attempts++;
      } while (used.has(key) && attempts < 20);
      used.add(key);
      const pos = this.maze.cellToWorld(x, y);
      const light = new THREE.PointLight(0xff2200, 0.6, 6, 1.5);
      light.position.set(pos.x, this.maze.wallHeight - 0.4, pos.z);
      this.scene.add(light);
      // Small lamp housing
      const housing = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 6),
        new THREE.MeshStandardMaterial({
          color: 0x440000,
          emissive: 0xff1100,
          emissiveIntensity: 0.8
        })
      );
      housing.position.copy(light.position);
      this.scene.add(housing);

      this.emergencyLights.push({
        light,
        housing,
        baseIntensity: 0.6,
        phase: Math.random() * Math.PI * 2,
        flickerSeed: Math.random()
      });
    }
  }

  addAmbient() {
    // Bright enough to barely make out walls when the flashlight is off,
    // dark enough that the flashlight still feels essential.
    const ambient = new THREE.AmbientLight(0x6a6878, 1.1);
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0x8a88a0, 0x302828, 0.7);
    this.scene.add(hemi);
  }

  update(delta, elapsed, playerPos) {
    // Flicker emergency lights independently
    for (const l of this.emergencyLights) {
      const f = Math.sin(elapsed * 6 + l.phase) * 0.5 + 0.5;
      const flicker = 0.7 + f * 0.6 + (Math.random() < 0.02 ? -0.4 : 0);
      l.light.intensity = Math.max(0, l.baseIntensity * flicker);
      l.housing.material.emissiveIntensity = 0.5 + flicker * 0.7;
    }

    // Subtle fog density pulse — gives the impression the world is "breathing"
    if (this.scene.fog) {
      this.scene.fog.density = this.baseFogDensity + Math.sin(elapsed * 0.4) * 0.012;
    }
  }
}
