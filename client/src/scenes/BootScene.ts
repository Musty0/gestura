import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    // assets will be loaded here later
  }

  create() {
    this.scene.start('LobbyScene')
  }
}
