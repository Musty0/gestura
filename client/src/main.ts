import * as fflate from 'fflate'
;(window as any).fflate = fflate
;(globalThis as any).fflate = fflate

import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { LobbyScene } from './scenes/LobbyScene'
import { GameScene } from './scenes/GameScene'
import { SpectatorScene } from './scenes/SpectatorScene'

// Read URL params — passed from index.html
const params = new URLSearchParams(window.location.search)
// Ensure each tab has a unique ID so multiple tabs aren't treated as the same session
if (!sessionStorage.getItem('gestura_tab_id')) {
  sessionStorage.setItem('gestura_tab_id', Math.random().toString(36).slice(2))
}
export const PLAYER_NAME =
  params.get('name') || sessionStorage.getItem('gestura_name') || 'Player'
export const ROOM_CODE = params.get('room') || ''
export const IS_CREATE = params.get('create') === '1'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#1a1a2e',
  scene: [BootScene, LobbyScene, GameScene, SpectatorScene],
  render: {
    pixelArt: false,
    antialias: true,
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
}

new Phaser.Game(config)
