import * as fflate from 'fflate'
;(window as any).fflate = fflate
;(globalThis as any).fflate = fflate

import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { LobbyScene } from './scenes/LobbyScene'
import { GameScene } from './scenes/GameScene'
import { SpectatorScene } from './scenes/SpectatorScene'

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
