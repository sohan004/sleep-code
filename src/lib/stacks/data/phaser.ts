import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "phaser",
  project: "neon-drifter",
  branch: "feat/bullet-pooling",
  indent: "Spaces: 2",
  files: [
    "index.html",
    "package.json",
    "vite.config.ts",
    "src/main.ts",
    "src/constants.ts",
    "src/scenes/BootScene.ts",
    "src/scenes/GameScene.ts",
    "src/scenes/HudScene.ts",
    "src/objects/PlayerShip.ts",
  ],
  snippets: [
    {
      filename: "src/scenes/GameScene.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import Phaser from "phaser";
import { PlayerShip } from "../objects/PlayerShip";
import { EventKeys, SceneKeys, TextureKeys } from "../constants";

const MAX_BULLETS = 40;
const BULLET_SPEED = 620;
const ENEMY_SPAWN_MS = 900;

type ArcadeImage = Phaser.Physics.Arcade.Image;

export class GameScene extends Phaser.Scene {
  private player!: PlayerShip;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private score = 0;

  constructor() {
    super({ key: SceneKeys.Game });
  }

  create(): void {
    const { width, height } = this.scale;
    this.physics.world.setBounds(0, 0, width, height);

    this.player = new PlayerShip(this, width / 2, height - 80);
    this.cursors = this.input.keyboard!.createCursorKeys();

    this.bullets = this.physics.add.group({
      defaultKey: TextureKeys.Bullet,
      maxSize: MAX_BULLETS,
    });
    this.enemies = this.physics.add.group({ defaultKey: TextureKeys.Drone, maxSize: 30 });

    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => {
      this.recycle(b as ArcadeImage);
      this.recycle(e as ArcadeImage);
      this.addScore(10);
    });
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => {
      this.recycle(e as ArcadeImage);
      this.player.hit();
    });

    this.time.addEvent({ delay: ENEMY_SPAWN_MS, loop: true, callback: () => this.spawnEnemy() });
    this.player.once(EventKeys.PlayerDied, () => {
      this.scene.start(SceneKeys.GameOver, { score: this.score });
    });
    this.scene.launch(SceneKeys.Hud);
  }

  update(time: number, delta: number): void {
    this.player.steer(this.cursors, delta);

    if (this.cursors.space.isDown && this.player.canFire(time)) {
      this.fireBullet();
    }

    const bottom = this.scale.height + 32;
    this.bullets.children.iterate((child) => {
      const bullet = child as ArcadeImage;
      if (bullet.active && bullet.y < -16) this.recycle(bullet);
      return true;
    });
    this.enemies.children.iterate((child) => {
      const enemy = child as ArcadeImage;
      if (enemy.active && enemy.y > bottom) this.recycle(enemy);
      return true;
    });
  }

  private fireBullet(): void {
    const bullet = this.bullets.get(this.player.x, this.player.y - 24) as ArcadeImage | null;
    if (!bullet) return;
    bullet.enableBody(true, this.player.x, this.player.y - 24, true, true);
    bullet.setVelocity(0, -BULLET_SPEED);
  }

  private spawnEnemy(): void {
    const x = Phaser.Math.Between(32, this.scale.width - 32);
    const enemy = this.enemies.get(x, -32) as ArcadeImage | null;
    if (!enemy) return;
    enemy.enableBody(true, x, -32, true, true);
    enemy.setVelocity(Phaser.Math.Between(-40, 40), Phaser.Math.Between(120, 200));
  }

  private recycle(obj: ArcadeImage): void {
    obj.disableBody(true, true);
  }

  private addScore(points: number): void {
    this.score += points;
    this.game.events.emit(EventKeys.ScoreChanged, this.score);
  }
}`,
    },
    {
      filename: "src/objects/PlayerShip.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import Phaser from "phaser";
import { EventKeys, TextureKeys } from "../constants";

const THRUST = 1400;
const MAX_SPEED = 360;
const DRAG = 1800;
const FIRE_COOLDOWN_MS = 140;
const INVULNERABLE_MS = 1200;

export class PlayerShip extends Phaser.Physics.Arcade.Sprite {
  private lives = 3;
  private nextFireAt = 0;
  private invulnerableUntil = 0;
  private bankAngle = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TextureKeys.Ship);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDrag(DRAG, DRAG);
    this.setMaxVelocity(MAX_SPEED, MAX_SPEED);
    this.setDepth(10);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(this.width * 0.6, this.height * 0.7);
  }

  get remainingLives(): number {
    return this.lives;
  }

  steer(keys: Phaser.Types.Input.Keyboard.CursorKeys, delta: number): void {
    const x = (keys.right.isDown ? 1 : 0) - (keys.left.isDown ? 1 : 0);
    const y = (keys.down.isDown ? 1 : 0) - (keys.up.isDown ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    this.setAcceleration((x / len) * THRUST, (y / len) * THRUST);

    // Ease the bank towards the target so it looks the same at any refresh rate.
    const targetBank = x * 18;
    const t = 1 - Math.exp(-12 * (delta / 1000));
    this.bankAngle = Phaser.Math.Linear(this.bankAngle, targetBank, t);
    this.setAngle(this.bankAngle);
  }

  canFire(time: number): boolean {
    if (time < this.nextFireAt) return false;
    this.nextFireAt = time + FIRE_COOLDOWN_MS;
    return true;
  }

  hit(): void {
    const now = this.scene.time.now;
    if (now < this.invulnerableUntil || !this.active) return;

    this.lives -= 1;
    this.invulnerableUntil = now + INVULNERABLE_MS;
    this.scene.cameras.main.shake(120, 0.008);
    this.scene.game.events.emit(EventKeys.LivesChanged, this.lives);

    if (this.lives <= 0) {
      this.disableBody(true, true);
      this.emit(EventKeys.PlayerDied);
      return;
    }

    this.scene.tweens.add({
      targets: this,
      alpha: 0.25,
      duration: 90,
      yoyo: true,
      repeat: Math.floor(INVULNERABLE_MS / 180) - 1,
      onComplete: () => this.setAlpha(1),
    });
  }
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Firing feels fine at 60 Hz but on my 144 Hz monitor the ship banks way faster. Is the lerp the problem?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "It was. A plain `Linear(current, target, 0.2)` per frame runs 2.4x more often at 144 Hz, so it converges much faster. The new code uses `t = 1 - Math.exp(-12 * (delta / 1000))`, which is the frame-rate-independent form of exponential smoothing: the result after one second is the same regardless of how many frames it was split into.\n\nMovement itself was already fine, because `setAcceleration`, `setDrag` and `setMaxVelocity` are integrated by Arcade Physics using its own step. Fire rate is also safe since `canFire` compares against the scene clock in milliseconds.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Does the bullet group actually avoid garbage, or is get() creating new sprites?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "`group.get()` first looks for an inactive member and only creates a new one if none exist and the group is below `maxSize`. With `maxSize: 40`, after warm-up you'll be recycling the same 40 images forever. When the pool is exhausted it returns `null`, which is why the null check in `fireBullet` matters.\n\nThe key is that `recycle` uses `disableBody(true, true)` rather than `destroy()`. That sets the object inactive and invisible and removes its body from the simulation, so `get()` can hand it back out. To avoid the first-shot hitch, call `createMultiple` with `active: false` in `create()` to prefill the pool.",
      delay: 36000,
    },
    {
      role: "user",
      content: "Any issue with iterating both groups every frame in update?",
      delay: 49000,
    },
    {
      role: "assistant",
      content:
        "At 70 objects it's negligible, and `children.iterate` doesn't allocate a new array the way `getChildren().filter()` would. Two refinements though:\n1. Arcade bodies can do the bounds check for you: set `body.onWorldBounds = true` with `setCollideWorldBounds(true)` and listen for the world's `worldbounds` event, then recycle there.\n2. The overlap callbacks receive pooled objects that may already be disabled in the same step. Guard with `if (!e.active) return;` so one enemy can't award score twice when two bullets hit it simultaneously.",
      delay: 61000,
    },
  ],
};

export default config;
