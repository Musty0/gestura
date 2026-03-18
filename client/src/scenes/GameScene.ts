import Phaser from 'phaser'
import { SpellRecogniser } from '../spells/SpellRecogniser'
import { NetworkManager } from '../network/NetworkManager'

interface Point {
  x: number
  y: number
}

const WORLD_WIDTH = 5600
const WORLD_HEIGHT = 5600
const PLAYER_SPEED = 220
const JOYSTICK_RADIUS = 65
const JOYSTICK_THUMB_RADIUS = 28
const CAMERA_LERP = 0.1

const isLocal = window.location.hostname === 'localhost'

const SERVER_URL = isLocal
  ? 'ws://localhost:3001'
  : `ws://${window.location.hostname}:3001`

export class GameScene extends Phaser.Scene {
  private recogniser: SpellRecogniser
  private network: NetworkManager = new NetworkManager()

  // Player
  private player!: Phaser.GameObjects.Arc
  private facing: string = 'right'

  // Other players — keyed by server-assigned id
  private otherPlayers: Map<string, Phaser.GameObjects.Arc> = new Map()

  // Joystick
  private joystickGraphics!: Phaser.GameObjects.Graphics
  private joystickActive: boolean = false
  private joystickPointerId: number = -1
  private joystickOrigin: Point = { x: 0, y: 0 }
  private joystickVector: Point = { x: 0, y: 0 }

  // Drawing (right half only)
  private drawPointerId: number = -1
  private isDrawing: boolean = false
  private currentPoints: Point[] = []
  private drawGraphics!: Phaser.GameObjects.Graphics

  // UI
  private resultText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text

  private activeSpells: string[] = [
    'Fireball',
    'FrostBolt',
    'Wall',
    'Shield',
    'Lightning',
    'Meteor',
    'Doom',
    'Inferno',
    'PoisonCloud',
    'Teleport',
    'Vortex',
    'Decoy',
    'CursedBolt',
  ]

  constructor() {
    super({ key: 'GameScene' })
    this.recogniser = new SpellRecogniser()
  }

  // ─── Preload ──────────────────────────────────────────────────────────────

  preload() {
    this.load.image(
      'floors_tiles',
      'assets/sprites/environment/tilesets/Floors_Tiles.png'
    )
    this.load.image(
      'water_tiles',
      'assets/sprites/environment/tilesets/Water_tiles.png'
    )
    this.load.image(
      'wall_tiles',
      'assets/sprites/environment/tilesets/Wall_Tiles.png'
    )
    this.load.image(
      'vegetation',
      'assets/sprites/environment/props/static/Vegetation.png'
    )
    this.load.image(
      'rocks',
      'assets/sprites/environment/props/static/Rocks.png'
    )
    this.load.image(
      'model_1',
      'assets/sprites/environment/props/static/trees/model_1.png'
    )
    this.load.image(
      'model_2',
      'assets/sprites/environment/props/static/trees/model_2.png'
    )
    this.load.image(
      'model_3',
      'assets/sprites/environment/props/static/trees/model_3.png'
    )
    this.load.text('mapRaw', 'assets/map.json')
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create() {
    const W = this.scale.width
    const H = this.scale.height

    // ── Map ──
    const rawJson = this.cache.text.get('mapRaw')
    const mapData = JSON.parse(rawJson)

    const fflate = (window as any).fflate
    for (const layer of mapData.layers) {
      if (layer.compression === 'gzip' && layer.data) {
        const binaryString = atob(layer.data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        const decompressed = fflate.decompressSync(bytes)
        const ints = new Int32Array(decompressed.buffer)
        layer.data = Array.from(ints)
        layer.compression = ''
        layer.encoding = ''
      }
    }

    this.cache.tilemap.add('mapDecompressed', {
      data: mapData,
      format: Phaser.Tilemaps.Formats.TILED_JSON,
    })
    const mapFinal = this.make.tilemap({ key: 'mapDecompressed' })

    const tilesetFloors = mapFinal.addTilesetImage(
      'Floors_Tiles',
      'floors_tiles'
    )!
    const tilesetWater = mapFinal.addTilesetImage('Water_tiles', 'water_tiles')!
    const tilesetWall = mapFinal.addTilesetImage('Wall_Tiles', 'wall_tiles')!
    const tilesetVeg = mapFinal.addTilesetImage('Vegetation', 'vegetation')!
    const tilesetRocks = mapFinal.addTilesetImage('Rocks', 'rocks')!
    const tilesetModel1 = mapFinal.addTilesetImage('model_1', 'model_1')!
    const tilesetModel2 = mapFinal.addTilesetImage('model_2', 'model_2')!
    const tilesetModel3 = mapFinal.addTilesetImage('model_3', 'model_3')!

    const allTilesets = [
      tilesetFloors,
      tilesetWater,
      tilesetWall,
      tilesetVeg,
      tilesetRocks,
      tilesetModel1,
      tilesetModel2,
      tilesetModel3,
    ]

    mapFinal.createLayer('Ground', allTilesets, 0, 0)
    mapFinal.createLayer('Water', allTilesets, 0, 0)
    mapFinal.createLayer('Above Water', allTilesets, 0, 0)
    mapFinal.createLayer('Bush', allTilesets, 0, 0)
    mapFinal.createLayer('Bush2', allTilesets, 0, 0)
    mapFinal.createLayer('Houses', allTilesets, 0, 0)
    mapFinal.createLayer('Decorations', allTilesets, 0, 0)

    // Debug grid — remove when map is in
    const grid = this.add.graphics()
    grid.lineStyle(1, 0x333333, 1)
    for (let x = 0; x <= WORLD_WIDTH; x += 200) {
      grid.lineBetween(x, 0, x, WORLD_HEIGHT)
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += 200) {
      grid.lineBetween(0, y, WORLD_WIDTH, y)
    }

    // ── Local player ──
    this.player = this.add.circle(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      20,
      0xa78bfa
    )

    // ── Camera ──
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.cameras.main.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP)

    // ── Graphics layers ──
    this.drawGraphics = this.add.graphics().setScrollFactor(0).setDepth(50)
    this.joystickGraphics = this.add.graphics().setScrollFactor(0).setDepth(50)

    // ── UI ──
    this.resultText = this.add
      .text(W * 0.75, H / 2, '', {
        fontSize: '48px',
        color: '#2dd4bf',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(60)

    this.scoreText = this.add
      .text(W * 0.75, H / 2 + 60, '', { fontSize: '20px', color: '#ffffff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(60)

    this.recogniser.setActiveSpells(this.activeSpells)

    // ── Input ──
    this.input.addPointer(2)
    this.input.on('pointerdown', this.onPointerDown, this)
    this.input.on('pointermove', this.onPointerMove, this)
    this.input.on('pointerup', this.onPointerUp, this)

    this.createFullscreenButton()

    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.scale.refresh(), 200)
    })

    // ── Networking ──
    this.registerNetworkHandlers()

    try {
      await this.network.connect(SERVER_URL)
      this.network.join('Player', this.player.x, this.player.y)
    } catch {
      console.warn('Could not connect to server — running offline')
    }
  }

  // ─── Network handlers ─────────────────────────────────────────────────────

  private registerNetworkHandlers() {
    // Server sends this to us on join — full snapshot of everyone already in the room
    this.network.on('init', (data) => {
      for (const p of data.players) {
        if (p.id === data.yourId) continue // that's us
        this.spawnOtherPlayer(p.id, p.x, p.y)
      }
    })

    // Someone new joined after us
    this.network.on('playerJoined', (data) => {
      this.spawnOtherPlayer(data.id, data.x, data.y)
    })

    // Someone moved
    this.network.on('playerMoved', (data) => {
      const sprite = this.otherPlayers.get(data.id)
      if (!sprite) return
      sprite.x = data.x
      sprite.y = data.y
    })

    // Someone left
    this.network.on('playerLeft', (data) => {
      const sprite = this.otherPlayers.get(data.id)
      if (sprite) {
        sprite.destroy()
        this.otherPlayers.delete(data.id)
      }
    })

    this.network.on('error', (data) => {
      console.warn('Server error:', data.msg)
    })

    this.network.on('disconnect', () => {
      console.warn('Lost connection to server')
    })
  }

  private spawnOtherPlayer(id: string, x: number, y: number) {
    if (this.otherPlayers.has(id)) return
    // Different colour so you can tell them apart from yourself
    const sprite = this.add.circle(x, y, 20, 0xf87171).setDepth(5)
    this.otherPlayers.set(id, sprite)
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    this.movePlayer(delta)
    this.renderJoystick()

    // Throttled — NetworkManager only actually sends every 50ms
    if (this.network.connected) {
      this.network.sendMove(this.player.x, this.player.y, this.facing)
    }
  }

  // ─── Player ───────────────────────────────────────────────────────────────

  private movePlayer(delta: number) {
    if (!this.joystickActive) return

    const dt = delta / 1000
    const newX = Phaser.Math.Clamp(
      this.player.x + this.joystickVector.x * PLAYER_SPEED * dt,
      0,
      WORLD_WIDTH
    )
    const newY = Phaser.Math.Clamp(
      this.player.y + this.joystickVector.y * PLAYER_SPEED * dt,
      0,
      WORLD_HEIGHT
    )

    this.player.x = newX
    this.player.y = newY

    if (Math.abs(this.joystickVector.x) > 0.1) {
      this.facing = this.joystickVector.x > 0 ? 'right' : 'left'
    }
  }

  // ─── Joystick ─────────────────────────────────────────────────────────────

  private renderJoystick() {
    this.joystickGraphics.clear()
    if (!this.joystickActive) return

    const ox = this.joystickOrigin.x
    const oy = this.joystickOrigin.y
    const thumbX = ox + this.joystickVector.x * JOYSTICK_RADIUS
    const thumbY = oy + this.joystickVector.y * JOYSTICK_RADIUS

    this.joystickGraphics.lineStyle(2, 0xffffff, 0.25)
    this.joystickGraphics.strokeCircle(ox, oy, JOYSTICK_RADIUS)
    this.joystickGraphics.fillStyle(0xffffff, 0.45)
    this.joystickGraphics.fillCircle(thumbX, thumbY, JOYSTICK_THUMB_RADIUS)
  }

  // ─── Input routing ────────────────────────────────────────────────────────

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    const W = this.scale.width

    if (pointer.x < W / 2) {
      if (!this.joystickActive) {
        this.joystickActive = true
        this.joystickPointerId = pointer.id
        this.joystickOrigin = { x: pointer.x, y: pointer.y }
        this.joystickVector = { x: 0, y: 0 }
      }
    } else {
      if (!this.isDrawing) {
        this.isDrawing = true
        this.drawPointerId = pointer.id
        this.currentPoints = []
        this.drawGraphics.clear()
        this.resultText.setText('')
        this.scoreText.setText('')
      }
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (pointer.id === this.joystickPointerId && this.joystickActive) {
      const dx = pointer.x - this.joystickOrigin.x
      const dy = pointer.y - this.joystickOrigin.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > JOYSTICK_RADIUS) {
        this.joystickVector = { x: dx / dist, y: dy / dist }
      } else {
        this.joystickVector = {
          x: dx / JOYSTICK_RADIUS,
          y: dy / JOYSTICK_RADIUS,
        }
      }
    }

    if (pointer.id === this.drawPointerId && this.isDrawing) {
      this.currentPoints.push({ x: pointer.x, y: pointer.y })
      this.redrawGestureTrail()
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    if (pointer.id === this.joystickPointerId) {
      this.joystickActive = false
      this.joystickPointerId = -1
      this.joystickVector = { x: 0, y: 0 }
    }

    if (pointer.id === this.drawPointerId) {
      this.endDraw()
      this.drawPointerId = -1
    }
  }

  // ─── Gesture drawing ──────────────────────────────────────────────────────

  private redrawGestureTrail() {
    this.drawGraphics.clear()
    if (this.currentPoints.length < 2) return
    this.drawGraphics.lineStyle(3, 0xa78bfa, 1)
    this.drawGraphics.beginPath()
    this.drawGraphics.moveTo(this.currentPoints[0].x, this.currentPoints[0].y)
    for (const p of this.currentPoints) {
      this.drawGraphics.lineTo(p.x, p.y)
    }
    this.drawGraphics.strokePath()
  }

  private endDraw() {
    if (!this.isDrawing) return
    this.isDrawing = false

    if (this.currentPoints.length < 5) {
      this.resultText.setText('Too short').setColor('#fb7185')
      return
    }

    const result = this.recogniser.recognise(this.currentPoints)

    if (result.name === 'Unknown') {
      this.resultText.setText('Unknown').setColor('#fb7185')
    } else {
      this.resultText.setText(result.name).setColor('#2dd4bf')
    }
    this.scoreText.setText(`Confidence: ${(result.score * 100).toFixed(0)}%`)

    this.time.delayedCall(1500, () => this.drawGraphics.clear())
  }

  // ─── Fullscreen ───────────────────────────────────────────────────────────

  private createFullscreenButton(): void {
    if (!this.scale.fullscreen.available) return

    const btn = document.createElement('button')
    btn.textContent = '⛶'
    btn.style.cssText = `
      position: fixed; top: 16px; right: 16px;
      font-size: 24px; background: rgba(0,0,0,0.4);
      color: white; border: none; padding: 6px 10px;
      cursor: pointer; z-index: 9999; touch-action: none;
    `

    btn.addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen()
        screen.orientation.unlock()
        btn.textContent = '⛶'
      } else {
        document.documentElement
          .requestFullscreen()
          .then(() => {
            btn.textContent = '✕'
            ;(screen.orientation as any).lock('landscape').catch(() => {})
          })
          .catch(() => {})
      }
    })

    document.body.appendChild(btn)
    this.events.on('shutdown', () => btn.remove())
  }
}
