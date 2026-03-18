import Phaser from 'phaser'

export const SPELL_COLOURS: Record<string, number> = {
  Fireball: 0xff6600,
  FrostBolt: 0x66ccff,
  Wall: 0xaaaaaa,
  Shield: 0x00ffcc,
  Lightning: 0xffff00,
  Meteor: 0xff3300,
  Doom: 0x9900ff,
  Inferno: 0xff4400,
  PoisonCloud: 0x44ff44,
  Teleport: 0xcc88ff,
  Vortex: 0x0044ff,
  Decoy: 0xffcc00,
  CursedBolt: 0xff0066,
}

const PROJECTILE_SPELLS = new Set([
  'Fireball',
  'FrostBolt',
  'Lightning',
  'Meteor',
  'Doom',
  'Vortex',
  'CursedBolt',
])

const AREA_SPELLS = new Set(['PoisonCloud', 'Inferno', 'Wall'])

// Travel time in ms — must match server expectation
const PROJECTILE_DURATION = 1500
const PROJECTILE_DIST = 600

type HitCallback = (spell: string, hitX: number, hitY: number) => void

export class SpellManager {
  private scene: Phaser.Scene
  private onHitDetected: HitCallback | null = null

  // Reference to other players for hit detection — set from GameScene
  private otherPlayers: Map<string, Phaser.GameObjects.Arc> = new Map()

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  setOtherPlayers(players: Map<string, Phaser.GameObjects.Arc>) {
    this.otherPlayers = players
  }

  setHitCallback(cb: HitCallback) {
    this.onHitDetected = cb
  }

  castSpell(
    spell: string,
    x: number,
    y: number,
    dirX: number = 1,
    dirY: number = 0,
    isLocal: boolean = false
  ) {
    const colour = SPELL_COLOURS[spell] ?? 0xffffff

    if (spell === 'Shield') {
      this.spawnShield(x, y, colour)
    } else if (spell === 'Teleport') {
      this.spawnTeleportFlash(x, y, colour)
    } else if (PROJECTILE_SPELLS.has(spell)) {
      this.spawnProjectile(x, y, dirX, dirY, colour, spell, isLocal)
    } else if (AREA_SPELLS.has(spell)) {
      this.spawnAreaEffect(x, y, colour, spell, isLocal)
    }
  }

  private spawnProjectile(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    colour: number,
    spell: string,
    isLocal: boolean
  ) {
    const endX = x + dirX * PROJECTILE_DIST
    const endY = y + dirY * PROJECTILE_DIST

    const circle = this.scene.add.circle(x, y, 10, colour).setDepth(10)

    this.scene.tweens.add({
      targets: circle,
      x: endX,
      y: endY,
      alpha: 0,
      duration: PROJECTILE_DURATION,
      ease: 'Linear',
      onUpdate: () => {
        if (!isLocal) return
        this.checkProjectileHit(spell, circle.x, circle.y)
      },
      onComplete: () => circle.destroy(),
    })
  }

  private checkProjectileHit(spell: string, projX: number, projY: number) {
    const HIT_RADIUS = 40
    for (const [id, sprite] of this.otherPlayers) {
      const dx = sprite.x - projX
      const dy = sprite.y - projY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < HIT_RADIUS) {
        this.onHitDetected?.(spell, projX, projY)
        // Remove from map temporarily to prevent multi-hit
        this.otherPlayers.delete(id)
        // Restore after 1s
        this.scene.time.delayedCall(1000, () => {
          this.otherPlayers.set(id, sprite)
        })
        return
      }
    }
  }

  private spawnAreaEffect(
    x: number,
    y: number,
    colour: number,
    spell: string,
    isLocal: boolean
  ) {
    const circle = this.scene.add.circle(x, y, 10, colour, 0.7).setDepth(10)

    // Check hit at cast point for area spells
    if (isLocal) {
      this.scene.time.delayedCall(200, () => {
        this.checkProjectileHit(spell, x, y)
      })
    }

    this.scene.tweens.add({
      targets: circle,
      scaleX: 8,
      scaleY: 8,
      alpha: 0,
      duration: 1000,
      ease: 'Cubic.Out',
      onComplete: () => circle.destroy(),
    })
  }

  private spawnShield(x: number, y: number, colour: number) {
    const ring = this.scene.add.circle(x, y, 30, colour, 0).setDepth(10)
    ring.setStrokeStyle(3, colour, 1)

    this.scene.tweens.add({
      targets: ring,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    })
  }

  private spawnTeleportFlash(x: number, y: number, colour: number) {
    const flash = this.scene.add.circle(x, y, 25, colour, 0.9).setDepth(10)

    this.scene.tweens.add({
      targets: flash,
      scaleX: 3,
      scaleY: 3,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.Out',
      onComplete: () => flash.destroy(),
    })
  }

  // Spawn floating damage number at world position
  spawnDamageNumber(
    x: number,
    y: number,
    damage: number,
    isLocalPlayer: boolean
  ) {
    const colour = isLocalPlayer ? '#ff4444' : '#ffffff'
    const text = this.scene.add
      .text(x, y - 20, `-${damage}`, {
        fontSize: '20px',
        color: colour,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(30)

    this.scene.tweens.add({
      targets: text,
      y: y - 70,
      alpha: 0,
      duration: 1000,
      ease: 'Cubic.Out',
      onComplete: () => text.destroy(),
    })
  }
}
