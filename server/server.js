const { WebSocketServer } = require('ws')

const PORT = process.env.PORT || 3001
const wss = new WebSocketServer({ port: PORT })

const rooms = new Map()

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
  }))
}

wss.on('connection', (ws) => {
  ws.id = Math.random().toString(36).slice(2)
  ws.name = 'Player'
  ws.room = null
  ws.x = 0
  ws.y = 0
  ws.facing = 'right'

  ws.on('message', (raw) => {
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return
    }

    if (data.type === 'join') {
      ws.name = (data.name || 'Player').toString().slice(0, 20)
      ws.x = data.x ?? 2800
      ws.y = data.y ?? 2800

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
          count: room.size,
        },
        ws
      )
    }

    // --- SPELL ---
    if (data.type === 'spellCast') {
      if (!ws.room) return
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

    if (data.type === 'move') {
      if (!ws.room) return
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
