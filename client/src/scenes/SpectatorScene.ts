import Phaser from 'phaser'

export class SpectatorScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SpectatorScene' })
  }

  create() {
    this.add.text(100, 100, 'Gestura — Spectator', {
      fontSize: '32px',
      color: '#ffffff',
    })
  }
}
