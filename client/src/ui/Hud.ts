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

export class HUD {
  private scene: Phaser.Scene
  private W: number
  private H: number

  // Health
  private healthBarBg!: Phaser.GameObjects.Graphics
  private healthBarFill!: Phaser.GameObjects.Graphics
  private maxHp: number = 100
  private currentHp: number = 100

  // Spell slots
  private slotGraphics!: Phaser.GameObjects.Graphics
  private slotTexts: Phaser.GameObjects.Text[] = []
  private equippedSpells: string[] = []

  // Name tags — keyed by player id
  private nameTags: Map<string, Phaser.GameObjects.Text> = new Map()

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.W = scene.scale.width
    this.H = scene.scale.height
    this.createHealthBar()
    this.createSpellSlots()

    // Reposition on resize/fullscreen
    scene.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.W = gameSize.width
      this.H = gameSize.height
      this.drawSpellSlots()
    })
  }

  // ─── Health bar ───────────────────────────────────────────────────────────

  private createHealthBar() {
    const x = 16
    const y = 16
    const barW = 180
    const barH = 16

    this.healthBarBg = this.scene.add.graphics().setScrollFactor(0).setDepth(70)
    this.healthBarFill = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(71)

    // Background
    this.healthBarBg.fillStyle(0x000000, 0.5)
    this.healthBarBg.fillRoundedRect(x, y, barW, barH, 4)

    this.drawHealthFill()
  }

  private drawHealthFill() {
    const x = 16
    const y = 16
    const barW = 180
    const barH = 16
    const ratio = Math.max(0, this.currentHp / this.maxHp)

    this.healthBarFill.clear()

    // Colour shifts red → yellow → green based on HP
    const colour = ratio > 0.5 ? 0x44dd44 : ratio > 0.25 ? 0xffcc00 : 0xff3333
    this.healthBarFill.fillStyle(colour, 1)
    this.healthBarFill.fillRoundedRect(x, y, barW * ratio, barH, 4)

    // HP text
    if (!this.scene.children.getByName('hpText')) {
      this.scene.add
        .text(x + barW + 8, y, '', {
          fontSize: '13px',
          color: '#ffffff',
        })
        .setScrollFactor(0)
        .setDepth(72)
        .setName('hpText')
    }
    const hpText = this.scene.children.getByName(
      'hpText'
    ) as Phaser.GameObjects.Text
    if (hpText) hpText.setText(`${this.currentHp}/${this.maxHp}`)
  }

  setHealth(current: number, max: number = this.maxHp) {
    this.currentHp = Math.max(0, current)
    this.maxHp = max
    this.drawHealthFill()
  }

  // ─── Spell slots ──────────────────────────────────────────────────────────

  private createSpellSlots() {
    this.slotGraphics = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(70)
    this.drawSpellSlots()
  }

  private drawSpellSlots() {
    this.slotGraphics.clear()
    this.slotTexts.forEach((t) => t.destroy())
    this.slotTexts = []

    const slotW = 90
    const slotH = 48
    const gap = 8
    const totalW =
      this.equippedSpells.length * slotW +
      (this.equippedSpells.length - 1) * gap
    const startX = (this.W - totalW) / 2
    const y = this.H - slotH - 16

    for (let i = 0; i < Math.max(this.equippedSpells.length, 2); i++) {
      const x = startX + i * (slotW + gap)
      const spell = this.equippedSpells[i]
      const colour = spell ? (SPELL_COLOURS[spell] ?? 0x888888) : 0x333333

      // Slot background
      this.slotGraphics.fillStyle(0x000000, 0.6)
      this.slotGraphics.fillRoundedRect(x, y, slotW, slotH, 6)

      // Colour indicator strip at top of slot
      this.slotGraphics.fillStyle(colour, spell ? 1 : 0.2)
      this.slotGraphics.fillRoundedRect(x + 4, y + 4, slotW - 8, 6, 3)

      // Spell name
      const label = this.scene.add
        .text(x + slotW / 2, y + slotH / 2 + 4, spell ?? '—', {
          fontSize: '11px',
          color: spell ? '#ffffff' : '#555555',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(72)

      this.slotTexts.push(label)
    }
  }

  setSpells(spells: string[]) {
    this.equippedSpells = spells
    this.drawSpellSlots()
  }

  // ─── Name tags ────────────────────────────────────────────────────────────

  addNameTag(id: string, name: string, target: Phaser.GameObjects.Arc) {
    if (this.nameTags.has(id)) return
    const tag = this.scene.add
      .text(0, 0, name, {
        fontSize: '11px',
        color: '#ffffff',
        backgroundColor: '#00000066',
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setDepth(20)
    this.nameTags.set(id, tag)
  }

  removeNameTag(id: string) {
    const tag = this.nameTags.get(id)
    if (tag) {
      tag.destroy()
      this.nameTags.delete(id)
    }
  }

  // Call every frame to keep name tags above players
  updateNameTags(
    players: Map<string, Phaser.GameObjects.Arc>,
    localPlayer: Phaser.GameObjects.Arc,
    localName: string
  ) {
    // Local player tag
    const localTag = this.nameTags.get('local')
    if (localTag) {
      localTag.setPosition(localPlayer.x, localPlayer.y - 28)
    }

    // Other players
    for (const [id, sprite] of players) {
      const tag = this.nameTags.get(id)
      if (tag) tag.setPosition(sprite.x, sprite.y - 28)
    }
  }

  addLocalNameTag(name: string, target: Phaser.GameObjects.Arc) {
    if (this.nameTags.has('local')) return
    const tag = this.scene.add
      .text(0, 0, name, {
        fontSize: '11px',
        color: '#a78bfa',
        backgroundColor: '#00000066',
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setDepth(20)
    this.nameTags.set('local', tag)
  }
}
