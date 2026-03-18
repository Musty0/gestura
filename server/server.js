const { WebSocketServer } = require('ws')

const PORT = process.env.PORT || 3001
const wss = new WebSocketServer({ port: PORT })

// roomCode -> { players: Set, state: 'waiting'|'playing', hostId, countdown }
const rooms = new Map()

const SPELL_DAMAGE = {
  Fireball: 25,
  FrostBolt: 20,
  Lightning: 35,
  Meteor: 60,
  Doom: 0,
  Inferno: 15,
  PoisonCloud: 10,
  Vortex: 20,
  CursedBolt: 0,
  Wall: 0,
  Shield: 0,
  Teleport: 0,
  Decoy: 0,
}

const MAX_HIT_DISTANCE = 200
const MIN_PLAYERS_TO_START = 4

// 8 spawn points spread around the 5600x5600 map — replace with real positions later
const SPAWN_POINTS = [
  { x: 1200, y: 1200 },
  { x: 4400, y: 1200 },
  { x: 1200, y: 4400 },
  { x: 4400, y: 4400 },
  { x: 2800, y: 1000 },
  { x: 2800, y: 4600 },
  { x: 1000, y: 2800 },
  { x: 4600, y: 2800 },
]

function makeRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 4; i++)
    code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function broadcast(players, data, exclude = null) {
  const msg = JSON.stringify(data)
  for (const client of players) {
    if (client !== exclude && client.readyState === 1) client.send(msg)
  }
}

function getRoomPlayers(players) {
  return [...players].map((c) => ({
    id: c.id,
    name: c.name,
    x: c.x,
    y: c.y,
    facing: c.facing,
    hp: c.hp,
    alive: c.alive,
  }))
}

function getRoom(roomCode) {
  return rooms.get(roomCode?.toUpperCase()) || null
}

wss.on('connection', (ws) => {
  ws.id = Math.random().toString(36).slice(2)
  ws.name = 'Player'
  ws.roomCode = null
  ws.x = 2800
  ws.y = 2800
  ws.facing = 'right'
  ws.hp = 100
  ws.alive = true

  ws.on('message', (raw) => {
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return
    }

    // --- CREATE ROOM ---
    if (data.type === 'createRoom') {
      ws.name = (data.name || 'Player').toString().slice(0, 8)

      // Generate unique code
      let code = makeRoomCode()
      while (rooms.has(code)) code = makeRoomCode()

      rooms.set(code, {
        players: new Set([ws]),
        state: 'waiting',
        hostId: ws.id,
        countdown: null,
      })

      ws.roomCode = code
      ws.hp = 100
      ws.alive = true

      ws.send(
        JSON.stringify({
          type: 'roomCreated',
          roomCode: code,
          yourId: ws.id,
          players: getRoomPlayers([ws]),
          isHost: true,
        })
      )

      console.log(`Room ${code} created by ${ws.name}`)
    }

    // --- JOIN ROOM ---
    if (data.type === 'joinRoom') {
      ws.name = (data.name || 'Player').toString().slice(0, 8)
      const code = (data.roomCode || '').toString().toUpperCase().slice(0, 4)
      const room = getRoom(code)

      if (!room) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Room not found' }))
        return
      }
      if (room.state === 'playing') {
        ws.send(
          JSON.stringify({ type: 'error', msg: 'Game already in progress' })
        )
        return
      }
      if (room.players.size >= 8) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Room full' }))
        return
      }

      const nameTaken = [...room.players].some(
        (p) => p.name.toLowerCase() === ws.name.toLowerCase()
      )
      if (nameTaken) {
        ws.send(
          JSON.stringify({
            type: 'error',
            msg: 'Name already taken in this room',
          })
        )
        return
      }

      room.players.add(ws)
      ws.roomCode = code
      ws.hp = 100
      ws.alive = true

      // Send joiner current room state
      ws.send(
        JSON.stringify({
          type: 'roomJoined',
          roomCode: code,
          yourId: ws.id,
          players: getRoomPlayers(room.players),
          isHost: room.hostId === ws.id,
          canStart: room.players.size >= MIN_PLAYERS_TO_START,
        })
      )

      // Tell everyone else
      broadcast(
        room.players,
        {
          type: 'playerJoined',
          id: ws.id,
          name: ws.name,
          x: ws.x,
          y: ws.y,
          facing: ws.facing,
          hp: ws.hp,
          count: room.players.size,
          canStart: room.players.size >= MIN_PLAYERS_TO_START,
          players: getRoomPlayers(room.players),
        },
        ws
      )

      console.log(
        `${ws.name} joined room ${code} (${room.players.size} players)`
      )
    }

    // --- START GAME ---
    if (data.type === 'startGame') {
      if (!ws.roomCode) return
      const room = getRoom(ws.roomCode)
      if (!room) return
      if (room.hostId !== ws.id) return
      if (room.state !== 'waiting') return
      if (room.players.size < MIN_PLAYERS_TO_START) {
        ws.send(
          JSON.stringify({
            type: 'error',
            msg: `Need at least ${MIN_PLAYERS_TO_START} players`,
          })
        )
        return
      }

      room.state = 'playing'

      // Assign spawn points
      const spawnAssignments = {}
      let spawnIndex = 0
      for (const player of room.players) {
        const spawn = SPAWN_POINTS[spawnIndex % SPAWN_POINTS.length]
        player.x = spawn.x
        player.y = spawn.y
        player.hp = 100
        player.alive = true
        spawnAssignments[player.id] = spawn
        spawnIndex++
      }

      // 3 second countdown then game starts
      let count = 3
      const tick = () => {
        broadcast(room.players, { type: 'countdown', count })
        count--
        if (count < 0) {
          broadcast(room.players, {
            type: 'gameStart',
            spawnAssignments,
            players: getRoomPlayers(room.players),
          })
        } else {
          room.countdown = setTimeout(tick, 1000)
        }
      }
      tick()
    }

    // --- SPELL ---
    if (data.type === 'spellCast') {
      if (!ws.roomCode || !ws.alive) return
      const room = getRoom(ws.roomCode)
      if (!room) return

      broadcast(
        room.players,
        {
          type: 'spellCast',
          id: ws.id,
          spell: data.spell,
          x: data.x,
          y: data.y,
          dirX: data.dirX,
          dirY: data.dirY,
        },
        ws
      )
    }

    // --- HIT ---
    if (data.type === 'spellHit') {
      if (!ws.roomCode || !ws.alive) return
      const room = getRoom(ws.roomCode)
      if (!room) return

      // No damage in lobby
      if (room.state === 'waiting') return

      const target = [...room.players].find((c) => c.id === data.targetId)
      if (!target || !target.alive) return

      const dx = target.x - data.hitX
      const dy = target.y - data.hitY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > MAX_HIT_DISTANCE) return

      const damage = SPELL_DAMAGE[data.spell] ?? 0
      if (damage === 0) return

      target.hp = Math.max(0, target.hp - damage)

      broadcast(room.players, {
        type: 'playerDamaged',
        targetId: target.id,
        attackerId: ws.id,
        spell: data.spell,
        damage,
        hp: target.hp,
        hitX: data.hitX,
        hitY: data.hitY,
      })

      if (target.hp <= 0) {
        target.alive = false
        broadcast(room.players, {
          type: 'playerEliminated',
          targetId: target.id,
          attackerId: ws.id,
          attackerName: ws.name,
          targetName: target.name,
          spell: data.spell,
        })
      }
    }

    // --- MOVE ---
    if (data.type === 'move') {
      if (!ws.roomCode) return
      const room = getRoom(ws.roomCode)
      if (!room) return
      if (room.state === 'playing' && !ws.alive) return

      ws.x = data.x ?? ws.x
      ws.y = data.y ?? ws.y
      ws.facing = data.facing ?? ws.facing

      broadcast(
        room.players,
        {
          type: 'playerMoved',
          id: ws.id,
          x: ws.x,
          y: ws.y,
          facing: ws.facing,
        },
        ws
      )
    }
  })

  ws.on('close', () => {
    if (!ws.roomCode) return
    const room = getRoom(ws.roomCode)
    if (!room) return

    room.players.delete(ws)

    // If host left, assign new host
    if (room.hostId === ws.id && room.players.size > 0) {
      room.hostId = [...room.players][0].id
      broadcast(room.players, {
        type: 'hostChanged',
        newHostId: room.hostId,
      })
    }

    broadcast(room.players, {
      type: 'playerLeft',
      id: ws.id,
      count: room.players.size,
      canStart: room.players.size >= MIN_PLAYERS_TO_START,
      players: getRoomPlayers(room.players),
    })

    if (room.players.size === 0) {
      if (room.countdown) clearTimeout(room.countdown)
      rooms.delete(ws.roomCode)
      console.log(`Room ${ws.roomCode} deleted`)
    }
  })
})

console.log(`Gestura server running on port ${PORT}`)
