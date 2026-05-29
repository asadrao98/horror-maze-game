/**
 * MazeGenerator - Builds a perfect maze with recursive-backtracking,
 * then knocks out a handful of extra walls to create loops/rooms.
 *
 * Cell coords: integer grid (x = col, y = row).
 * World coords: x = col * cellSize, z = row * cellSize (with maze centered around origin).
 *
 * Each cell stores its walls as { N, S, E, W } booleans (true = wall present).
 * We also expose helper methods consumed by the renderer (Environment), the
 * pathfinder (MonsterAI), and the collision system.
 */
export class MazeGenerator {
  constructor({ cols, rows, cellSize, wallHeight }) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    this.wallHeight = wallHeight;
    this.cells = [];
    // Origin offset so maze is centered around (0,0)
    this.offsetX = -((cols - 1) * cellSize) / 2;
    this.offsetZ = -((rows - 1) * cellSize) / 2;
  }

  generate() {
    this.cells = [];
    for (let y = 0; y < this.rows; y++) {
      const row = [];
      for (let x = 0; x < this.cols; x++) {
        row.push({
          x, y,
          walls: { N: true, S: true, E: true, W: true },
          visited: false
        });
      }
      this.cells.push(row);
    }

    // Recursive backtracking
    const stack = [];
    const start = this.cells[0][0];
    start.visited = true;
    stack.push(start);

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const next = this.pickUnvisitedNeighbor(current);
      if (next) {
        this.removeWallBetween(current, next);
        next.visited = true;
        stack.push(next);
      } else {
        stack.pop();
      }
    }

    // Knock out extra walls (~12% of remaining interior walls) to make loops/rooms.
    // Loops break the "single solution" feel and give the monster more flanking
    // routes — both critical for tension in a horror maze.
    const extraRemovals = Math.floor(this.cols * this.rows * 0.12);
    for (let i = 0; i < extraRemovals; i++) {
      const cx = 1 + Math.floor(Math.random() * (this.cols - 2));
      const cy = 1 + Math.floor(Math.random() * (this.rows - 2));
      const cell = this.cells[cy][cx];
      const dirs = ['N', 'S', 'E', 'W'];
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      const neighbor = this.neighborInDir(cell, dir);
      if (neighbor) this.removeWallBetween(cell, neighbor);
    }
  }

  pickUnvisitedNeighbor(cell) {
    const neighbors = [];
    if (cell.y > 0 && !this.cells[cell.y - 1][cell.x].visited)
      neighbors.push({ cell: this.cells[cell.y - 1][cell.x], dir: 'N' });
    if (cell.y < this.rows - 1 && !this.cells[cell.y + 1][cell.x].visited)
      neighbors.push({ cell: this.cells[cell.y + 1][cell.x], dir: 'S' });
    if (cell.x < this.cols - 1 && !this.cells[cell.y][cell.x + 1].visited)
      neighbors.push({ cell: this.cells[cell.y][cell.x + 1], dir: 'E' });
    if (cell.x > 0 && !this.cells[cell.y][cell.x - 1].visited)
      neighbors.push({ cell: this.cells[cell.y][cell.x - 1], dir: 'W' });

    if (neighbors.length === 0) return null;
    return neighbors[Math.floor(Math.random() * neighbors.length)].cell;
  }

  neighborInDir(cell, dir) {
    if (dir === 'N' && cell.y > 0) return this.cells[cell.y - 1][cell.x];
    if (dir === 'S' && cell.y < this.rows - 1) return this.cells[cell.y + 1][cell.x];
    if (dir === 'E' && cell.x < this.cols - 1) return this.cells[cell.y][cell.x + 1];
    if (dir === 'W' && cell.x > 0) return this.cells[cell.y][cell.x - 1];
    return null;
  }

  removeWallBetween(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 1) { a.walls.E = false; b.walls.W = false; }
    else if (dx === -1) { a.walls.W = false; b.walls.E = false; }
    else if (dy === 1) { a.walls.S = false; b.walls.N = false; }
    else if (dy === -1) { a.walls.N = false; b.walls.S = false; }
  }

  cellToWorld(x, y) {
    return {
      x: this.offsetX + x * this.cellSize,
      z: this.offsetZ + y * this.cellSize
    };
  }

  worldToCell(wx, wz) {
    const cx = Math.round((wx - this.offsetX) / this.cellSize);
    const cy = Math.round((wz - this.offsetZ) / this.cellSize);
    return { x: cx, y: cy };
  }

  isInBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  getCell(x, y) {
    if (!this.isInBounds(x, y)) return null;
    return this.cells[y][x];
  }

  /** Returns true if there's a wall between cell (x,y) and its neighbor in `dir`. */
  hasWall(x, y, dir) {
    const cell = this.getCell(x, y);
    if (!cell) return true;
    return cell.walls[dir];
  }

  /** Yields neighbor cell coords that are reachable (no wall between). */
  getReachableNeighbors(x, y) {
    const out = [];
    const cell = this.getCell(x, y);
    if (!cell) return out;
    if (!cell.walls.N && y > 0) out.push({ x, y: y - 1 });
    if (!cell.walls.S && y < this.rows - 1) out.push({ x, y: y + 1 });
    if (!cell.walls.E && x < this.cols - 1) out.push({ x: x + 1, y });
    if (!cell.walls.W && x > 0) out.push({ x: x - 1, y });
    return out;
  }

  /** BFS distance from (sx,sy) to every cell. */
  distanceMapFrom(sx, sy) {
    const map = Array.from({ length: this.rows }, () => new Array(this.cols).fill(Infinity));
    map[sy][sx] = 0;
    const queue = [{ x: sx, y: sy }];
    while (queue.length) {
      const c = queue.shift();
      const d = map[c.y][c.x];
      for (const n of this.getReachableNeighbors(c.x, c.y)) {
        if (map[n.y][n.x] > d + 1) {
          map[n.y][n.x] = d + 1;
          queue.push(n);
        }
      }
    }
    return map;
  }

  /** Find a reachable cell at maximum distance from (sx,sy). */
  findFarCell(sx, sy) {
    const map = this.distanceMapFrom(sx, sy);
    let best = { x: sx, y: sy, d: 0 };
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (map[y][x] !== Infinity && map[y][x] > best.d) {
          best = { x, y, d: map[y][x] };
        }
      }
    }
    return best;
  }

  /** Pick a random cell whose BFS distance from start (0,0) >= minDist. */
  randomCellAtLeast(minDist, exclude = new Set()) {
    const map = this.distanceMapFrom(0, 0);
    const candidates = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (map[y][x] >= minDist && map[y][x] !== Infinity && !exclude.has(`${x},${y}`)) {
          candidates.push({ x, y });
        }
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Yields wall segments needed to render the maze.
   * Each segment: { x, z, length, axis } where axis is 'x' (runs along X) or 'z'.
   * We dedupe by only emitting N and W walls per cell, plus boundary S/E walls.
   */
  getWallSegments() {
    const segments = [];
    const cs = this.cellSize;
    const half = cs / 2;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const cell = this.cells[y][x];
        const world = this.cellToWorld(x, y);
        // North wall
        if (cell.walls.N) {
          segments.push({ x: world.x, z: world.z - half, length: cs, axis: 'x' });
        }
        // West wall
        if (cell.walls.W) {
          segments.push({ x: world.x - half, z: world.z, length: cs, axis: 'z' });
        }
        // South wall only on bottom row
        if (y === this.rows - 1 && cell.walls.S) {
          segments.push({ x: world.x, z: world.z + half, length: cs, axis: 'x' });
        }
        // East wall only on right column
        if (x === this.cols - 1 && cell.walls.E) {
          segments.push({ x: world.x + half, z: world.z, length: cs, axis: 'z' });
        }
      }
    }
    return segments;
  }
}
