/**
 * CollisionSystem - Grid-aware collision resolution against maze walls.
 *
 * We treat each cell as a square of size `cellSize`. Walls sit on cell edges
 * with thickness `wallThickness`. To check if a position is valid we:
 *   1. Determine the cell at that position.
 *   2. For each of the 4 walls of that cell that actually exist,
 *      test the entity AABB against the wall AABB.
 *   3. Also test the 8 surrounding cells' walls in case the entity overlaps
 *      a cell boundary near a wall.
 *
 * Resolution uses simple axis-separated sliding: try X movement, then Z
 * movement, so walking into a corner still slides along the wall.
 */
export class CollisionSystem {
  constructor(maze) {
    this.maze = maze;
    this.wallThickness = 0.4;
    this.playerRadius = 0.35;
    this.monsterRadius = 0.55;
  }

  /**
   * Move an entity by (dx, dz) with collision sliding.
   * @param pos THREE.Vector3 — mutated in place
   */
  moveEntity(pos, dx, dz, radius = this.playerRadius) {
    // Try X
    const tryX = pos.x + dx;
    if (!this.collidesAt(tryX, pos.z, radius)) {
      pos.x = tryX;
    }
    // Try Z
    const tryZ = pos.z + dz;
    if (!this.collidesAt(pos.x, tryZ, radius)) {
      pos.z = tryZ;
    }
  }

  /** True if a circle at (wx,wz) with radius r overlaps any wall. */
  collidesAt(wx, wz, r) {
    const { x: cx, y: cy } = this.maze.worldToCell(wx, wz);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const tx = cx + ox;
        const ty = cy + oy;
        if (!this.maze.isInBounds(tx, ty)) {
          // Outside-of-maze counts as solid
          if (this.outerBoundaryCollides(wx, wz, r, tx, ty)) return true;
          continue;
        }
        if (this.cellWallsCollide(tx, ty, wx, wz, r)) return true;
      }
    }
    return false;
  }

  cellWallsCollide(cx, cy, wx, wz, r) {
    const cs = this.maze.cellSize;
    const half = cs / 2;
    const cell = this.maze.getCell(cx, cy);
    if (!cell) return false;
    const center = this.maze.cellToWorld(cx, cy);

    // North wall (along X)
    if (cell.walls.N) {
      if (this.circleVsAABB(wx, wz, r,
        center.x - half, center.z - half - this.wallThickness / 2,
        center.x + half, center.z - half + this.wallThickness / 2)) return true;
    }
    if (cell.walls.S) {
      if (this.circleVsAABB(wx, wz, r,
        center.x - half, center.z + half - this.wallThickness / 2,
        center.x + half, center.z + half + this.wallThickness / 2)) return true;
    }
    if (cell.walls.W) {
      if (this.circleVsAABB(wx, wz, r,
        center.x - half - this.wallThickness / 2, center.z - half,
        center.x - half + this.wallThickness / 2, center.z + half)) return true;
    }
    if (cell.walls.E) {
      if (this.circleVsAABB(wx, wz, r,
        center.x + half - this.wallThickness / 2, center.z - half,
        center.x + half + this.wallThickness / 2, center.z + half)) return true;
    }
    return false;
  }

  /** When the entity is outside the maze grid entirely, treat the outer boundary as solid. */
  outerBoundaryCollides(wx, wz, r, cx, cy) {
    // Place a virtual "wall ring" matching outer dimensions
    const cs = this.maze.cellSize;
    const half = cs / 2;
    const minX = this.maze.offsetX - half;
    const maxX = this.maze.offsetX + (this.maze.cols - 1) * cs + half;
    const minZ = this.maze.offsetZ - half;
    const maxZ = this.maze.offsetZ + (this.maze.rows - 1) * cs + half;
    if (wx - r < minX) return true;
    if (wx + r > maxX) return true;
    if (wz - r < minZ) return true;
    if (wz + r > maxZ) return true;
    return false;
  }

  circleVsAABB(cx, cz, r, minX, minZ, maxX, maxZ) {
    const closestX = Math.max(minX, Math.min(cx, maxX));
    const closestZ = Math.max(minZ, Math.min(cz, maxZ));
    const dx = cx - closestX;
    const dz = cz - closestZ;
    return (dx * dx + dz * dz) < r * r;
  }

  /**
   * Line-of-sight check between two world points. Returns true if a straight
   * line between them is unobstructed by walls. Used by the monster to decide
   * whether it can "see" the player.
   *
   * We sample along the segment in small steps; if any sample collides with
   * a wall (radius=0), the line is blocked.
   */
  hasLineOfSight(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    const steps = Math.ceil(dist / 0.25);
    if (steps === 0) return true;
    const sx = dx / steps;
    const sz = dz / steps;
    let cx = ax, cz = az;
    for (let i = 1; i < steps; i++) {
      cx += sx;
      cz += sz;
      if (this.collidesAt(cx, cz, 0.01)) return false;
    }
    return true;
  }
}
