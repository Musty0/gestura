interface Point {
  x: number
  y: number
}

interface Result {
  name: string
  score: number
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

function distance(p1: Point, p2: Point): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
}

function pathLength(points: Point[]): number {
  let d = 0
  for (let i = 1; i < points.length; i++)
    d += distance(points[i - 1], points[i])
  return d
}

function centroid(points: Point[]): Point {
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  }
}

function boundingBox(points: Point[]) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }
}

function smooth(points: Point[], step = 4): Point[] {
  const out: Point[] = []
  for (let i = 0; i < points.length; i += step) out.push(points[i])
  return out
}

// ─── Core metrics ────────────────────────────────────────────────────────────

function linearityScore(points: Point[]): number {
  const direct = distance(points[0], points[points.length - 1])
  const total = pathLength(points)
  return total > 0 ? direct / total : 0
}

function gestureDirection(
  points: Point[]
): 'horizontal' | 'vertical' | 'diagonal' {
  const b = boundingBox(points)
  const ratio = b.width / (b.height || 1)
  if (ratio > 1.8) return 'horizontal'
  if (ratio < 0.55) return 'vertical'
  return 'diagonal'
}

function circleScore(points: Point[]): number {
  if (points.length < 8) return 0
  const c = centroid(points)
  const radii = points.map((p) => distance(p, c))
  const avg = radii.reduce((a, b) => a + b, 0) / radii.length
  if (avg < 10) return 0
  const variance = radii.reduce((a, b) => a + (b - avg) ** 2, 0) / radii.length
  const consistency = 1 - Math.sqrt(variance) / avg
  const closure = 1 - distance(points[0], points[points.length - 1]) / (avg * 2)
  return consistency * 0.6 + Math.max(0, closure) * 0.4
}

function countReversals(
  points: Point[],
  axis: 'x' | 'y',
  minDelta = 8
): number {
  const s = smooth(points, 3)
  let reversals = 0
  let lastDir = 0
  for (let i = 1; i < s.length; i++) {
    const delta = s[i][axis] - s[i - 1][axis]
    if (Math.abs(delta) < minDelta) continue
    const dir = delta > 0 ? 1 : -1
    if (lastDir !== 0 && dir !== lastDir) reversals++
    lastDir = dir
  }
  return reversals
}

function totalAngleTraversed(points: Point[]): number {
  const c = centroid(points)
  const angles = points.map((p) => Math.atan2(p.y - c.y, p.x - c.x))
  let total = 0
  for (let i = 1; i < angles.length; i++) {
    let da = angles[i] - angles[i - 1]
    if (da > Math.PI) da -= 2 * Math.PI
    if (da < -Math.PI) da += 2 * Math.PI
    total += Math.abs(da)
  }
  return total
}

// ─── Spell detectors ─────────────────────────────────────────────────────────

function detectFireball(points: Point[]): number {
  const lin = linearityScore(points)
  if (lin < 0.8) return 0
  if (gestureDirection(points) !== 'horizontal') return 0
  if (points[points.length - 1].x <= points[0].x) return 0
  return lin
}

function detectFrostBolt(points: Point[]): number {
  const lin = linearityScore(points)
  if (lin < 0.8) return 0
  if (gestureDirection(points) !== 'vertical') return 0
  if (points[points.length - 1].y <= points[0].y) return 0
  return lin
}

function detectWall(points: Point[]): number {
  const lin = linearityScore(points)
  if (lin < 0.8) return 0
  if (gestureDirection(points) !== 'vertical') return 0
  if (points[points.length - 1].y >= points[0].y) return 0
  return lin
}

function detectShield(points: Point[]): number {
  const score = circleScore(points)
  if (score < 0.45) return 0
  // circle start and end points should be close to each other
  const s = points[0]
  const e = points[points.length - 1]
  const b = boundingBox(points)
  const closureRatio = distance(s, e) / (b.width + b.height)
  if (closureRatio > 0.5) return 0
  return score
}

function detectChainLightning(points: Point[]): number {
  const lin = linearityScore(points)
  if (lin < 0.8) return 0
  if (gestureDirection(points) !== 'diagonal') return 0
  // must go bottom-left to top-right
  if (points[points.length - 1].x <= points[0].x) return 0
  if (points[points.length - 1].y >= points[0].y) return 0
  return lin
}

function detectMeteor(points: Point[]): number {
  const lin = linearityScore(points)
  if (lin < 0.8) return 0
  if (gestureDirection(points) !== 'diagonal') return 0
  // must go top-left to bottom-right
  if (points[points.length - 1].x <= points[0].x) return 0
  if (points[points.length - 1].y <= points[0].y) return 0
  return lin
}

function detectDoom(points: Point[]): number {
  const lin = linearityScore(points)
  if (lin < 0.8) return 0
  if (gestureDirection(points) !== 'diagonal') return 0
  // must go bottom-right to top-left
  if (points[points.length - 1].x >= points[0].x) return 0
  if (points[points.length - 1].y >= points[0].y) return 0
  return lin
}

function detectPoisonCloud(points: Point[]): number {
  if (points.length < 10) return 0
  const lin = linearityScore(points)
  if (lin > 0.7) return 0
  const b = boundingBox(points)
  if (b.width < 40 || b.height < 20) return 0
  const s = points[0]
  const e = points[points.length - 1]
  // start and end must be in bottom half
  const lowerThreshold = b.y + b.height * 0.55
  if (s.y < lowerThreshold || e.y < lowerThreshold) return 0
  // start and end should NOT be close together (would be a circle)
  const closureRatio = distance(s, e) / (b.width + b.height)
  if (closureRatio < 0.15) return 0
  // the top of the gesture must be in upper half
  const topY = Math.min(...points.map((p) => p.y))
  if (topY > b.y + b.height * 0.5) return 0
  // must be wider than tall — U shape is wide
  if (b.width / (b.height || 1) < 0.8) return 0
  // start and end should be on opposite sides horizontally
  const midX = b.x + b.width / 2
  const sidesOpposite = (s.x < midX && e.x > midX) || (s.x > midX && e.x < midX)
  if (!sidesOpposite) return 0
  return 0.85
}

function detectInferno(points: Point[]): number {
  const lin = linearityScore(points)
  if (lin < 0.8) return 0
  if (gestureDirection(points) !== 'horizontal') return 0
  if (points[points.length - 1].x >= points[0].x) return 0
  return lin
}

function detectTeleport(points: Point[]): number {
  if (points.length < 30) return 0
  // reject straight lines and nearly straight
  if (linearityScore(points) > 0.5) return 0
  // reject simple circles
  if (circleScore(points) > 0.6) return 0

  const c = centroid(points)

  // Calculate radius at each point from centroid
  const radii = points.map((p) => distance(p, c))
  const maxRadius = Math.max(...radii)
  const minRadius = Math.min(...radii)

  // Spiral must have significant radius change — not just a circle
  if (maxRadius - minRadius < 25) return 0

  // Check total angle traversed — spiral needs at least 1.5 full rotations
  const totalAngle = totalAngleTraversed(points)
  if (totalAngle < Math.PI * 3) return 0

  // Radius must consistently change in one direction (shrinking or growing)
  // Split into quarters and check radius trend
  const quarter = Math.floor(points.length / 4)
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
  const r1 = avg(radii.slice(0, quarter))
  const r2 = avg(radii.slice(quarter, quarter * 2))
  const r3 = avg(radii.slice(quarter * 2, quarter * 3))
  const r4 = avg(radii.slice(quarter * 3))

  // Each quarter radius should be consistently different from previous
  const shrinking = r1 > r2 && r2 > r3 && r3 > r4
  const growing = r1 < r2 && r2 < r3 && r3 < r4
  if (!shrinking && !growing) return 0

  return 0.85
}

function detectVortex(points: Point[]): number {
  const lin = linearityScore(points)
  if (lin < 0.8) return 0
  if (gestureDirection(points) !== 'diagonal') return 0
  // must go top-right to bottom-left
  if (points[points.length - 1].x >= points[0].x) return 0
  if (points[points.length - 1].y <= points[0].y) return 0
  return lin
}

function detectDecoy(points: Point[]): number {
  // ) shape — bulges LEFT, start and end on right
  if (points.length < 8) return 0
  if (circleScore(points) > 0.45) return 0
  if (linearityScore(points) > 0.8) return 0
  const b = boundingBox(points)
  if (b.width < 15 || b.height < 25) return 0
  const s = points[0]
  const e = points[points.length - 1]
  const midX = b.x + b.width / 2
  const minX = Math.min(...points.map((p) => p.x))
  if (minX > midX) return 0
  if (s.x < minX + b.width * 0.15) return 0
  if (e.x < minX + b.width * 0.15) return 0
  if (Math.abs(s.y - e.y) < b.height * 0.2) return 0
  return 0.82
}

function detectCursedBolt(points: Point[]): number {
  // ( shape — bulges RIGHT, start and end on left
  if (points.length < 8) return 0
  if (circleScore(points) > 0.45) return 0
  if (linearityScore(points) > 0.8) return 0
  const b = boundingBox(points)
  if (b.width < 15 || b.height < 25) return 0
  const s = points[0]
  const e = points[points.length - 1]
  const midX = b.x + b.width / 2
  const maxX = Math.max(...points.map((p) => p.x))
  if (maxX < midX) return 0
  if (s.x > maxX - b.width * 0.15) return 0
  if (e.x > maxX - b.width * 0.15) return 0
  if (Math.abs(s.y - e.y) < b.height * 0.2) return 0
  return 0.82
}

// ─── Detector map ────────────────────────────────────────────────────────────

const DETECTORS: Record<string, (points: Point[]) => number> = {
  Fireball: detectFireball,
  FrostBolt: detectFrostBolt,
  Wall: detectWall,
  Shield: detectShield,
  Lightning: detectChainLightning,
  Inferno: detectInferno,
  Meteor: detectMeteor,
  Doom: detectDoom,
  PoisonCloud: detectPoisonCloud,
  Teleport: detectTeleport,
  Vortex: detectVortex,
  Decoy: detectDecoy,
  CursedBolt: detectCursedBolt,
}

// ─── Recogniser class ────────────────────────────────────────────────────────

export class SpellRecogniser {
  private activeSpells: string[] = []

  setActiveSpells(spells: string[]) {
    this.activeSpells = spells
  }

  recognise(points: Point[]): Result {
    if (points.length < 5) return { name: 'Unknown', score: 0 }
    let best: Result = { name: 'Unknown', score: 0 }
    for (const spell of this.activeSpells) {
      const detector = DETECTORS[spell]
      if (!detector) continue
      const score = detector(points)
      if (score > best.score) best = { name: spell, score }
    }
    if (best.score < 0.6) return { name: 'Unknown', score: best.score }
    return best
  }
}
