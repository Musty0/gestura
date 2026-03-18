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

  // Health
  private healthBarBg!: Phaser.GameObjects.Graphics
  private healthBarFill!: Phaser.GameObjects.Graphics
  private hpText!: Phaser.GameObjects.Text
  private maxHp: number = 100
  private currentHp: number = 100

  // Spell slots
  private slotGraphics!: Phaser.GameObjects.Graphics
  private slotTexts: Phaser.GameObjects.Text[] = []
  private equippedSpells: string[] = []

  // Name tags
  private nameTags: Map<string, Phaser.GameObjects.Text> = new Map()

  // Lobby — HTML overlay
  private lobbyDiv!: HTMLDivElement
  private lobbyCreated: boolean = false

  // Countdown — Phaser text centred on canvas
  private countdownText!: Phaser.GameObjects.Text

  //HUD
  private hudCodeEl!: HTMLDivElement
  private hudPlayersEl!: HTMLDivElement
  private hudStartEl!: HTMLDivElement

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.createHealthBar()
    this.createSpellSlots()
    this.createCountdown()
    this.createLobbyHUD()

    scene.scale.on('resize', () => {
      this.drawSpellSlots()
      this.repositionCountdown()
    })

    scene.events.on('shutdown', () => this.destroyLobbyDiv())
    scene.events.on('destroy', () => this.destroyLobbyDiv())
  }

  // ─── Health bar ───────────────────────────────────────────────────────────

  private createHealthBar() {
    const x = 16
    const y = 16
    const barW = 180
    const barH = 16

    this.healthBarBg = this.scene.add.graphics().setScrollFactor(0).setDepth(70)
    this.healthBarBg.fillStyle(0x000000, 0.5)
    this.healthBarBg.fillRoundedRect(x, y, barW, barH, 4)

    this.healthBarFill = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(71)

    this.hpText = this.scene.add
      .text(x + barW + 8, y, '100/100', {
        fontSize: '13px',
        color: '#ffffff',
      })
      .setScrollFactor(0)
      .setDepth(72)

    this.drawHealthFill()
  }

  private drawHealthFill() {
    const x = 16
    const y = 16
    const barW = 180
    const barH = 16
    const ratio = Math.max(0, this.currentHp / this.maxHp)

    this.healthBarFill.clear()
    const colour = ratio > 0.5 ? 0x44dd44 : ratio > 0.25 ? 0xffcc00 : 0xff3333
    this.healthBarFill.fillStyle(colour, 1)
    this.healthBarFill.fillRoundedRect(x, y, barW * ratio, barH, 4)
    this.hpText.setText(`${this.currentHp}/${this.maxHp}`)
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

    const W = this.scene.scale.width
    const H = this.scene.scale.height
    const slotW = 90
    const slotH = 48
    const gap = 8
    const count = Math.max(this.equippedSpells.length, 2)
    const totalW = count * slotW + (count - 1) * gap
    const startX = (W - totalW) / 2
    const y = H - slotH - 16

    for (let i = 0; i < count; i++) {
      const x = startX + i * (slotW + gap)
      const spell = this.equippedSpells[i]
      const colour = spell ? (SPELL_COLOURS[spell] ?? 0x888888) : 0x333333

      this.slotGraphics.fillStyle(0x000000, 0.6)
      this.slotGraphics.fillRoundedRect(x, y, slotW, slotH, 6)

      this.slotGraphics.fillStyle(colour, spell ? 1 : 0.2)
      this.slotGraphics.fillRoundedRect(x + 4, y + 4, slotW - 8, 6, 3)

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

  removeNameTag(id: string) {
    const tag = this.nameTags.get(id)
    if (tag) {
      tag.destroy()
      this.nameTags.delete(id)
    }
  }

  updateNameTags(
    players: Map<string, Phaser.GameObjects.Arc>,
    localPlayer: Phaser.GameObjects.Arc,
    localName: string
  ) {
    const localTag = this.nameTags.get('local')
    if (localTag) localTag.setPosition(localPlayer.x, localPlayer.y - 28)

    for (const [id, sprite] of players) {
      const tag = this.nameTags.get(id)
      if (tag) tag.setPosition(sprite.x, sprite.y - 28)
    }
  }

  // ─── Countdown ────────────────────────────────────────────────────────────

  private createCountdown() {
    const W = this.scene.scale.width
    const H = this.scene.scale.height

    this.countdownText = this.scene.add
      .text(W / 2, H / 2, '', {
        fontSize: '96px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(80)
      .setVisible(false)
  }

  private repositionCountdown() {
    const W = this.scene.scale.width
    const H = this.scene.scale.height
    this.countdownText?.setPosition(W / 2, H / 2)
  }

  showCountdown(count: number) {
    this.countdownText.setText(String(count)).setVisible(true)
    this.scene.time.delayedCall(800, () => {
      this.countdownText.setVisible(false)
    })
  }

  hideCountdown() {
    this.countdownText.setVisible(false)
  }

  // ─── Lobby HTML overlay ───────────────────────────────────────────────────

  private createLobbyHUD() {
    // Remove any stale instance from previous session
    document.getElementById('gestura-lobby-hud')?.remove()
    this.lobbyDiv = document.createElement('div')
    this.lobbyDiv.id = 'gestura-lobby-hud'
    this.lobbyDiv.style.cssText = `
      position: fixed;
      top: max(12px, env(safe-area-inset-top, 12px));
      right: 12px;
      width: 200px;
      background: rgba(0,0,0,0.6);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 12px;
      color: #eaf2ff;
      font-family: monospace;
      z-index: 9999;
      pointer-events: none;
    `
    this.hudCodeEl = document.createElement('div')
    this.hudCodeEl.style.cssText =
      'color:#a78bfa;font-weight:bold;font-size:13px;margin-bottom:8px;'
    this.hudCodeEl.textContent = 'CODE: ----'

    this.hudPlayersEl = document.createElement('div')
    this.hudPlayersEl.style.cssText = 'font-size:11px;line-height:1.6;'
    this.hudPlayersEl.textContent = 'Waiting...'

    this.hudStartEl = document.createElement('div')
    this.hudStartEl.style.cssText = `
      display:none;
      margin-top:10px;
      text-align:center;
      color:#2dd4bf;
      font-weight:bold;
      font-size:13px;
      cursor:pointer;
      background:rgba(45,212,191,0.14);
      border:1px solid rgba(45,212,191,0.35);
      border-radius:6px;
      padding:6px 10px;
      pointer-events:auto;
    `
    this.hudStartEl.textContent = '▶ START GAME'

    this.lobbyDiv.appendChild(this.hudCodeEl)
    this.lobbyDiv.appendChild(this.hudPlayersEl)
    this.lobbyDiv.appendChild(this.hudStartEl)
    document.body.appendChild(this.lobbyDiv)

    this.hudStartEl.addEventListener('click', () => {
      const scene = this.scene as any
      scene.network?.startGame()
    })

    this.lobbyCreated = true
  }

  private destroyLobbyDiv() {
    this.lobbyDiv?.remove()
    this.lobbyCreated = false
  }

  setRoomCode(code: string) {
    this.hudCodeEl.textContent = `CODE: ${code}`
  }

  setPlayers(players: any[], myId: string) {
    this.hudPlayersEl.innerHTML = players
      .map((p) =>
        p.id === myId
          ? `<div><span style="color:#a78bfa">▶ ${p.name}</span> <span style="opacity:0.5;font-size:10px;">(you)</span></div>`
          : `<div><span style="opacity:0.75">${p.name}</span></div>`
      )
      .join('')
  }

  setCanStart(canStart: boolean) {
    this.hudStartEl.style.display = canStart ? 'block' : 'none'
  }

  hideLobby() {
    if (!this.lobbyCreated) return
    this.lobbyDiv.style.display = 'none'
  }
}
