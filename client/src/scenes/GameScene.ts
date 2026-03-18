import Phaser from 'phaser'
import { SpellRecogniser } from '../spells/SpellRecogniser'
import { NetworkManager } from '../network/NetworkManager'
import { SpellManager } from '../spells/SpellManager'
import { HUD } from '../ui/HUD'
import { PLAYER_NAME, ROOM_CODE, IS_CREATE } from '../main'

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
  network: NetworkManager = new NetworkManager()
  private spellManager!: SpellManager
  private myId: string = ''
  private myHp: number = 100
  private hud!: HUD

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
  private castDirX: number = 1
  private castDirY: number = 0
  private lastDirX: number = 1
  private lastDirY: number = 0

  // Drawing (right half only)
  private drawPointerId: number = -1
  private isDrawing: boolean = false
  private currentPoints: Point[] = []
  private drawGraphics!: Phaser.GameObjects.Graphics

  // UI
  private resultText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private playerName: string = PLAYER_NAME
  private roomCode: string = ROOM_CODE
  private isCreate: boolean = IS_CREATE
  private isHost: boolean = false
  private gameState: 'waiting' | 'playing' = 'waiting'

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

    // ── Spell manager ──
    this.spellManager = new SpellManager(this)
    this.spellManager.setOtherPlayers(this.otherPlayers)
    this.spellManager.setHitCallback((spell, hitX, hitY) => {
      // Find which player was hit
      for (const [id, sprite] of this.otherPlayers) {
        const dx = sprite.x - hitX
        const dy = sprite.y - hitY
        if (Math.sqrt(dx * dx + dy * dy) < 40) {
          this.network.sendHit(spell, id, hitX, hitY)
          break
        }
      }
    })

    // ── HUD ──
    this.hud = new HUD(this)
    this.hud.setSpells(['Fireball', 'FrostBolt'])
    this.hud.addLocalNameTag(this.playerName, this.player)

    // ── Networking ──
    this.registerNetworkHandlers()

    try {
      await this.network.connect(SERVER_URL)
      // If we already have a room code saved, rejoin instead of creating a new one
      const savedCode = sessionStorage.getItem('gestura_room')
      if (savedCode) {
        this.network.joinRoom(this.playerName, savedCode)
      } else if (this.isCreate) {
        this.network.createRoom(this.playerName)
      } else {
        this.network.joinRoom(this.playerName, this.roomCode)
      }
    } catch {
      console.warn('Could not connect to server — running offline')
    }
  }

  // ─── Network handlers ─────────────────────────────────────────────────────

  private registerNetworkHandlers() {
    // Server sends this to us on join — full snapshot of everyone already in the room
    // Room created (we are host)
    this.network.on('roomCreated', (data) => {
      this.myId = data.yourId
      this.isHost = true
      sessionStorage.setItem('gestura_room', data.roomCode)
      // Update URL so sharing it lets others join this room
      window.history.replaceState(
        {},
        '',
        `game.html?name=${encodeURIComponent(this.playerName)}&room=${data.roomCode}`
      )
      this.hud.setRoomCode(data.roomCode)
      this.hud.setPlayers(data.players, this.myId)
      this.hud.setCanStart(false)
    })

    // Room joined (we are not host, or host rejoining)
    this.network.on('roomJoined', (data) => {
      this.myId = data.yourId
      this.isHost = data.isHost
      sessionStorage.setItem('gestura_room', data.roomCode)
      this.hud.setRoomCode(data.roomCode)
      this.hud.setPlayers(data.players, this.myId)
      this.hud.setCanStart(data.canStart && this.isHost)
      // Spawn all existing players
      for (const p of data.players) {
        if (p.id === this.myId) continue
        this.spawnOtherPlayer(p.id, p.x, p.y, p.name)
      }
    })

    // Someone new joined
    this.network.on('playerJoined', (data) => {
      this.spawnOtherPlayer(data.id, data.x, data.y, data.name)
      this.hud.setCanStart(data.canStart && this.isHost)
      this.hud.setPlayers(data.players, this.myId)
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
        this.hud.removeNameTag(data.id)
      }
      if (this.gameState === 'waiting') {
        this.hud.setCanStart(data.canStart && this.isHost)
        this.hud.setPlayers(data.players, this.myId)
      }
    })

    // Someone cast a spell
    this.network.on('spellCast', (data) => {
      this.spellManager.castSpell(
        data.spell,
        data.x,
        data.y,
        data.dirX,
        data.dirY
      )
    })

    // Someone took damage
    this.network.on('playerDamaged', (data) => {
      // Spawn damage number at hit position
      const isMe = data.targetId === this.myId
      this.spellManager.spawnDamageNumber(
        data.hitX,
        data.hitY,
        data.damage,
        isMe
      )

      if (isMe) {
        // Update my health bar
        this.myHp = data.hp
        this.hud.setHealth(this.myHp)
      }
    })

    // Someone was eliminated
    this.network.on('playerEliminated', (data) => {
      if (data.targetId === this.myId) {
        // I died — show message
        this.resultText.setText('You died!').setColor('#ff4444')
        this.scoreText.setText(
          `Killed by ${data.attackerName} with ${data.spell}`
        )
      } else {
        // Someone else died — remove their sprite
        const sprite = this.otherPlayers.get(data.targetId)
        if (sprite) {
          sprite.destroy()
          this.otherPlayers.delete(data.targetId)
          this.hud.removeNameTag(data.targetId)
        }
        // Show kill feed message briefly
        this.resultText
          .setText(`${data.targetName} eliminated!`)
          .setColor('#ffcc00')
        this.scoreText.setText(`by ${data.attackerName} — ${data.spell}`)
        this.time.delayedCall(2000, () => {
          this.resultText.setText('')
          this.scoreText.setText('')
        })
      }
    })

    // Host changed
    this.network.on('hostChanged', (data) => {
      if (data.newHostId === this.myId) {
        this.isHost = true
        this.hud.setCanStart(true)
      }
    })

    // Countdown tick
    this.network.on('countdown', (data) => {
      this.hud.showCountdown(data.count)
    })

    // Game starting — teleport to spawn point
    this.network.on('gameStart', (data) => {
      this.gameState = 'playing'
      sessionStorage.removeItem('gestura_room')
      const mySpawn = data.spawnAssignments[this.myId]
      if (mySpawn) {
        this.player.x = mySpawn.x
        this.player.y = mySpawn.y
      }
      // Update other players' positions to their spawns
      for (const p of data.players) {
        if (p.id === this.myId) continue
        const sprite = this.otherPlayers.get(p.id)
        if (sprite) {
          sprite.x = p.x
          sprite.y = p.y
        }
      }
      this.hud.hideCountdown()
      this.hud.hideLobby()
      this.hud.setHealth(100)
      this.myHp = 100
    })

    this.network.on('error', (data) => {
      console.warn('Server error:', data.msg)
      if (data.msg === 'Room not found') {
        sessionStorage.removeItem('gestura_room')
        if (this.isCreate) {
          this.network.createRoom(this.playerName)
        } else {
          this.network.joinRoom(this.playerName, this.roomCode)
        }
      } else if (data.msg === 'Name already taken in this room') {
        sessionStorage.removeItem('gestura_room')
        window.location.href = `index.html?error=name_taken`
      }
    })

    this.network.on('disconnect', () => {
      console.warn('Lost connection to server')
    })
  }

  private spawnOtherPlayer(
    id: string,
    x: number,
    y: number,
    name: string = 'Player'
  ) {
    if (this.otherPlayers.has(id)) return
    const sprite = this.add.circle(x, y, 20, 0xf87171).setDepth(5)
    this.otherPlayers.set(id, sprite)
    this.hud.addNameTag(id, name, sprite)
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    this.movePlayer(delta)
    this.renderJoystick()

    // Throttled — NetworkManager only actually sends every 50ms
    if (this.network.connected) {
      this.network.sendMove(this.player.x, this.player.y, this.facing)
    }
    this.hud.updateNameTags(this.otherPlayers, this.player, this.playerName)
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
    // Always store last known movement direction
    const mag = Math.sqrt(
      this.joystickVector.x ** 2 + this.joystickVector.y ** 2
    )
    if (mag > 0.1) {
      this.lastDirX = this.joystickVector.x
      this.lastDirY = this.joystickVector.y
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

        // Snapshot direction at the moment drawing starts
        const mag = Math.sqrt(
          this.joystickVector.x ** 2 + this.joystickVector.y ** 2
        )
        if (mag > 0.1) {
          // Joystick still active — use current vector
          this.castDirX = this.joystickVector.x
          this.castDirY = this.joystickVector.y
        } else {
          // Joystick released — use last known direction
          this.castDirX = this.lastDirX
          this.castDirY = this.lastDirY
        }
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
      this.scoreText.setText(`Confidence: ${(result.score * 100).toFixed(0)}%`)
    } else {
      this.resultText.setText(result.name).setColor('#2dd4bf')
      this.scoreText.setText(`Confidence: ${(result.score * 100).toFixed(0)}%`)

      const dirX = this.castDirX
      const dirY = this.castDirY

      // Fire the spell locally — isLocal=true enables hit detection
      this.spellManager.castSpell(
        result.name,
        this.player.x,
        this.player.y,
        dirX,
        dirY,
        true
      )

      // Broadcast to other players
      if (this.network.connected) {
        this.network.sendSpell(
          result.name,
          this.player.x,
          this.player.y,
          dirX,
          dirY
        )
      }
    }

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
