const { WebSocketServer } = require('ws')

const PORT = process.env.PORT || 3001
const wss = new WebSocketServer({ port: PORT })

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

const MAX_HIT_DISTANCE = 200 // pixels — server rejects hits beyond this

function broadcast(room, data, exclude = null) {
  const msg = JSON.stringify(data)
  for (const client of room) {
    if (client !== exclude && client.readyState === 1) client.send(msg)
  }
}

function getRoomPlayers(room) {
  return [...room].map((c) => ({
    id: c.id,
    name: c.name,
    x: c.x,
    y: c.y,
    facing: c.facing,
    hp: c.hp,
  }))
}

wss.on('connection', (ws) => {
  ws.id = Math.random().toString(36).slice(2)
  ws.name = 'Player'
  ws.room = null
  ws.x = 0
  ws.y = 0
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

    // --- JOIN ---
    if (data.type === 'join') {
      ws.name = (data.name || 'Player').toString().slice(0, 20)
      ws.x = data.x ?? 2800
      ws.y = data.y ?? 2800
      ws.hp = 100
      ws.alive = true

      const roomId = 'main'
      if (!rooms.has(roomId)) rooms.set(roomId, new Set())
      const room = rooms.get(roomId)

      if (room.size >= 8) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Room full' }))
        return
      }

      room.add(ws)
      ws.room = roomId

      ws.send(
        JSON.stringify({
          type: 'init',
          yourId: ws.id,
          players: getRoomPlayers(room),
        })
      )

      broadcast(
        room,
        {
          type: 'playerJoined',
          id: ws.id,
          name: ws.name,
          x: ws.x,
          y: ws.y,
          facing: ws.facing,
          hp: ws.hp,
          count: room.size,
        },
        ws
      )
    }

    // --- SPELL ---
    if (data.type === 'spellCast') {
      if (!ws.room || !ws.alive) return
      const room = rooms.get(ws.room)
      broadcast(
        room,
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
      if (!ws.room || !ws.alive) return
      const room = rooms.get(ws.room)

      // Find target
      const target = [...room].find((c) => c.id === data.targetId)
      if (!target || !target.alive) return

      // Validate hit distance — reject if target is too far from reported hit position
      const dx = target.x - data.hitX
      const dy = target.y - data.hitY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > MAX_HIT_DISTANCE) return

      const damage = SPELL_DAMAGE[data.spell] ?? 0
      if (damage === 0) return

      target.hp = Math.max(0, target.hp - damage)

      // Broadcast damage to all players
      broadcast(room, {
        type: 'playerDamaged',
        targetId: target.id,
        attackerId: ws.id,
        spell: data.spell,
        damage,
        hp: target.hp,
        hitX: data.hitX,
        hitY: data.hitY,
      })

      // Check elimination
      if (target.hp <= 0) {
        target.alive = false
        broadcast(room, {
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
      if (!ws.room || !ws.alive) return
      ws.x = data.x ?? ws.x
      ws.y = data.y ?? ws.y
      ws.facing = data.facing ?? ws.facing

      const room = rooms.get(ws.room)
      broadcast(
        room,
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
    if (ws.room && rooms.has(ws.room)) {
      const room = rooms.get(ws.room)
      room.delete(ws)
      broadcast(room, {
        type: 'playerLeft',
        id: ws.id,
        count: room.size,
      })
      if (room.size === 0) rooms.delete(ws.room)
    }
  })
})

console.log(`Gestura server running on port ${PORT}`)
