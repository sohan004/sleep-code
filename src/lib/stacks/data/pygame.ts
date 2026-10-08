import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "pygame",
  project: "mossy-caverns",
  branch: "feat/coyote-time",
  indent: "Spaces: 4",
  files: [
    "pyproject.toml",
    "main.py",
    "game/__init__.py",
    "game/settings.py",
    "game/player.py",
    "game/level.py",
    "assets/levels/cavern_01.txt",
    "tests/test_player.py",
  ],
  snippets: [
    {
      filename: "game/player.py",
      syntax: "hash",
      languageLabel: "Python",
      code: `from __future__ import annotations

import pygame

from game.settings import (
    COYOTE_TIME,
    GRAVITY,
    JUMP_BUFFER,
    JUMP_SPEED,
    MAX_FALL_SPEED,
    RUN_ACCEL,
    RUN_SPEED,
)


class Player(pygame.sprite.Sprite):
    def __init__(self, pos: tuple[float, float], solids: pygame.sprite.Group, *groups) -> None:
        super().__init__(*groups)
        self.image = pygame.Surface((14, 22))
        self.image.fill("#7fd36b")
        # FRect keeps sub-pixel positions so slow movement doesn't get truncated.
        self.rect = self.image.get_frect(topleft=pos)
        self.velocity = pygame.Vector2()
        self.solids = solids
        self.on_ground = False
        self._coyote = 0.0
        self._jump_buffer = 0.0

    def handle_input(self) -> float:
        keys = pygame.key.get_pressed()
        if pygame.key.get_just_pressed()[pygame.K_SPACE]:
            self._jump_buffer = JUMP_BUFFER
        return float(keys[pygame.K_d] or keys[pygame.K_RIGHT]) - float(
            keys[pygame.K_a] or keys[pygame.K_LEFT]
        )

    def update(self, dt: float) -> None:
        direction = self.handle_input()
        target = direction * RUN_SPEED
        self.velocity.x = pygame.math.lerp(self.velocity.x, target, min(1.0, RUN_ACCEL * dt))

        self._coyote = COYOTE_TIME if self.on_ground else max(0.0, self._coyote - dt)
        self._jump_buffer = max(0.0, self._jump_buffer - dt)
        if self._jump_buffer > 0.0 and self._coyote > 0.0:
            self.velocity.y = -JUMP_SPEED
            self._jump_buffer = 0.0
            self._coyote = 0.0

        self.velocity.y = min(self.velocity.y + GRAVITY * dt, MAX_FALL_SPEED)

        # Resolve each axis separately so corners don't snag.
        self.rect.x += self.velocity.x * dt
        self._collide(horizontal=True)
        self.rect.y += self.velocity.y * dt
        self.on_ground = False
        self._collide(horizontal=False)

    def _collide(self, horizontal: bool) -> None:
        for tile in self.solids:
            if not self.rect.colliderect(tile.rect):
                continue
            if horizontal:
                if self.velocity.x > 0:
                    self.rect.right = tile.rect.left
                elif self.velocity.x < 0:
                    self.rect.left = tile.rect.right
                self.velocity.x = 0
            else:
                if self.velocity.y > 0:
                    self.rect.bottom = tile.rect.top
                    self.on_ground = True
                elif self.velocity.y < 0:
                    self.rect.top = tile.rect.bottom
                self.velocity.y = 0
`,
    },
    {
      filename: "game/level.py",
      syntax: "hash",
      languageLabel: "Python",
      code: `from __future__ import annotations

from pathlib import Path

import pygame

from game.player import Player
from game.settings import BG_COLOUR, CAMERA_LAG, TILE_SIZE

LEVEL_DIR = Path(__file__).resolve().parent.parent / "assets" / "levels"


class Tile(pygame.sprite.Sprite):
    def __init__(self, pos: tuple[int, int], *groups: pygame.sprite.Group) -> None:
        super().__init__(*groups)
        self.image = pygame.Surface((TILE_SIZE, TILE_SIZE))
        self.image.fill("#3b4a3f")
        self.rect = self.image.get_frect(topleft=pos)


class Level:
    def __init__(self, name: str) -> None:
        self.visible = pygame.sprite.Group()
        self.solids = pygame.sprite.Group()
        self.player: Player | None = None
        self.spawn = pygame.Vector2()
        self.camera = pygame.Vector2()
        self.bounds = pygame.Rect(0, 0, 0, 0)
        self._load(LEVEL_DIR / f"{name}.txt")

    def _load(self, path: Path) -> None:
        rows = path.read_text(encoding="utf-8").splitlines()
        for y, row in enumerate(rows):
            for x, char in enumerate(row):
                pos = (x * TILE_SIZE, y * TILE_SIZE)
                if char == "#":
                    Tile(pos, self.visible, self.solids)
                elif char == "P":
                    self.spawn.update(pos)
        width = max(len(r) for r in rows) * TILE_SIZE
        self.bounds = pygame.Rect(0, 0, width, len(rows) * TILE_SIZE)
        self.player = Player(self.spawn, self.solids, self.visible)

    def update(self, dt: float) -> None:
        assert self.player is not None
        self.player.update(dt)
        if self.player.rect.top > self.bounds.bottom + 64:
            self.respawn()

    def respawn(self) -> None:
        assert self.player is not None
        self.player.rect.topleft = self.spawn
        self.player.velocity.update(0, 0)

    def draw(self, surface: pygame.Surface, dt: float) -> None:
        assert self.player is not None
        view = surface.get_size()
        target = pygame.Vector2(self.player.rect.center) - pygame.Vector2(view) / 2
        self.camera += (target - self.camera) * min(1.0, CAMERA_LAG * dt)
        self.camera.x = pygame.math.clamp(self.camera.x, 0, max(0, self.bounds.w - view[0]))
        self.camera.y = pygame.math.clamp(self.camera.y, 0, max(0, self.bounds.h - view[1]))

        surface.fill(BG_COLOUR)
        offset = (-round(self.camera.x), -round(self.camera.y))
        for sprite in self.visible:
            surface.blit(sprite.image, sprite.rect.move(offset))
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "I'm passing clock.tick(60) / 1000 as dt. If someone's laptop hitches, the player sometimes clips into the floor. Why?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "A long hitch produces a large `dt`, so `self.velocity.y * dt` can move the player more than a full tile in one update. `_collide` only checks overlap at the final position, so if the player passes through a 16 px tile entirely, nothing is detected.\n\nTwo fixes, ideally both:\n1. Clamp `dt` in `main.py`, e.g. `dt = min(clock.tick(60) / 1000, 1 / 30)`. The game slows briefly instead of teleporting.\n2. Sub-step when the move is large: split the update into `ceil(dt / (1 / 120))` smaller steps.\n\n`MAX_FALL_SPEED` already helps by capping the worst case.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Is get_frect a pygame-ce thing? My colleague's install doesn't have it.",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "Yes. `FRect` and `Surface.get_frect()` are pygame-ce additions, as is `pygame.key.get_just_pressed()`. Upstream pygame doesn't have them, and the two packages can't be installed side by side because both import as `pygame`.\n\nYour colleague should run `pip uninstall pygame` and then `pip install pygame-ce`. Pin it in `pyproject.toml` (for example `pygame-ce>=2.5`) so the dependency is explicit. You can also add a guard at start-up that checks `getattr(pygame, 'IS_CE', False)` and exits with a clear message.",
      delay: 36000,
    },
    {
      role: "user",
      content: "How do I test coyote time in pytest without opening a window?",
      delay: 49000,
    },
    {
      role: "assistant",
      content:
        "Set the SDL dummy drivers before importing pygame, in `tests/conftest.py`:\n\n```python\nimport os\nos.environ['SDL_VIDEODRIVER'] = 'dummy'\nos.environ['SDL_AUDIODRIVER'] = 'dummy'\n```\n\nThen build a `Player` with a one-tile `solids` group, run `update(1 / 60)` a few times so `on_ground` is true, remove the tile, step for less than `COYOTE_TIME`, and set `_jump_buffer` directly before the next `update`. Assert `velocity.y < 0`. Setting the buffer directly avoids faking keyboard state, since `get_just_pressed` reads from the event queue.",
      delay: 61000,
    },
  ],
};

export default config;
