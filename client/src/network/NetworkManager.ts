type MessageHandler = (data: any) => void

export class NetworkManager {
  private ws: WebSocket | null = null
  private handlers: Map<string, MessageHandler> = new Map()

  // Movement throttle — send at most 20 times/second (matches server tick rate)
  private lastMoveSent: number = 0
  private readonly MOVE_INTERVAL_MS = 50

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log('Connected to server')
        resolve()
      }

      this.ws.onerror = (err) => {
        console.error('WebSocket error:', err)
        reject(err)
      }

      this.ws.onmessage = (event) => {
        let data: any
        try {
          data = JSON.parse(event.data)
        } catch {
          console.warn('Received malformed message:', event.data)
          return
        }
        this.handleMessage(data)
      }

      this.ws.onclose = () => {
        console.log('Disconnected from server')
        this.handlers.get('disconnect')?.({ type: 'disconnect' })
      }
    })
  }

  // Register a handler for a specific message type
  // GameScene calls: network.on('playerMoved', (data) => { ... })
  on(type: string, handler: MessageHandler) {
    this.handlers.set(type, handler)
  }

  private handleMessage(data: any) {
    const handler = this.handlers.get(data.type)
    if (handler) {
      handler(data)
    } else {
      console.warn('Unhandled message type:', data.type)
    }
  }

  send(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  sendSpell(spell: string, x: number, y: number, dirX: number, dirY: number) {
    this.send({
      type: 'spellCast',
      spell,
      x: Math.round(x),
      y: Math.round(y),
      dirX,
      dirY,
    })
  }

  sendHit(spell: string, targetId: string, hitX: number, hitY: number) {
    this.send({
      type: 'spellHit',
      spell,
      targetId,
      hitX: Math.round(hitX),
      hitY: Math.round(hitY),
    })
  }

  // Call this every frame from GameScene.update()
  // Only actually sends if 50ms have passed since last send
  sendMove(x: number, y: number, facing: string) {
    const now = Date.now()
    if (now - this.lastMoveSent < this.MOVE_INTERVAL_MS) return
    this.lastMoveSent = now
    this.send({ type: 'move', x: Math.round(x), y: Math.round(y), facing })
  }

  createRoom(name: string) {
    this.send({ type: 'createRoom', name })
  }

  joinRoom(name: string, roomCode: string) {
    this.send({ type: 'joinRoom', name, roomCode })
  }

  startGame() {
    this.send({ type: 'startGame' })
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
