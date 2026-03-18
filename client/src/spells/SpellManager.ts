import Phaser from 'phaser'

const SPELL_COLOURS: Record<string, number> = {
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

export class SpellManager {
  private scene: Phaser.Scene

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  // dirX/dirY is a normalised direction vector — defaults to facing right
  castSpell(
    spell: string,
    x: number,
    y: number,
    dirX: number = 1,
    dirY: number = 0
  ) {
    const colour = SPELL_COLOURS[spell] ?? 0xffffff

    if (spell === 'Shield') {
      this.spawnShield(x, y, colour)
    } else if (spell === 'Teleport') {
      this.spawnTeleportFlash(x, y, colour)
    } else if (PROJECTILE_SPELLS.has(spell)) {
      this.spawnProjectile(x, y, dirX, dirY, colour)
    } else if (AREA_SPELLS.has(spell)) {
      this.spawnAreaEffect(x, y, colour)
    }
  }

  private spawnProjectile(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    colour: number
  ) {
    const dist = 600
    const duration = 1500

    const circle = this.scene.add.circle(x, y, 10, colour).setDepth(10)

    this.scene.tweens.add({
      targets: circle,
      x: x + dirX * dist,
      y: y + dirY * dist,
      alpha: 0,
      duration,
      ease: 'Linear',
      onComplete: () => circle.destroy(),
    })
  }

  private spawnAreaEffect(x: number, y: number, colour: number) {
    const circle = this.scene.add.circle(x, y, 10, colour, 0.7).setDepth(10)

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
}
