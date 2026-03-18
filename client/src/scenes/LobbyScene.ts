import Phaser from 'phaser'

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LobbyScene' })
  }

  create() {
    this.scene.start('GameScene')
  }
}
