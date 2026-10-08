import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "panda3d",
  project: "lunar-salvage",
  branch: "feat/drone-collisions",
  indent: "Spaces: 4",
  files: [
    "requirements.txt",
    "config/settings.prc",
    "main.py",
    "game/__init__.py",
    "game/drone.py",
    "game/salvage.py",
    "models/cavern.bam",
    "models/drone.bam",
    "tests/test_drone.py",
  ],
  snippets: [
    {
      filename: "main.py",
      syntax: "hash",
      languageLabel: "Python",
      code: `import sys

from direct.showbase.ShowBase import ShowBase
from direct.task import Task
from panda3d.core import (
    AmbientLight,
    ClockObject,
    CollisionHandlerPusher,
    CollisionTraverser,
    DirectionalLight,
    Vec3,
    Vec4,
    loadPrcFile,
)

from game.drone import Drone

loadPrcFile("config/settings.prc")

KEY_MAP = {
    "w": "forward",
    "s": "back",
    "a": "left",
    "d": "right",
    "space": "up",
    "shift": "down",
}
MAX_DT = 1.0 / 30.0


class SalvageApp(ShowBase):
    def __init__(self) -> None:
        super().__init__()
        self.disableMouse()
        self.game_clock = ClockObject.getGlobalClock()

        self.cTrav = CollisionTraverser("world")
        self.pusher = CollisionHandlerPusher()
        self.pusher.setHorizontal(False)

        self.level = self.loader.loadModel("models/cavern.bam")
        self.level.reparentTo(self.render)

        self.drone = Drone(self, self.pusher, start=Vec3(0, 0, 4))
        self.keys = {action: False for action in KEY_MAP.values()}

        self._setup_lights()
        self._setup_input()
        self.taskMgr.add(self.update, "update")

    def _setup_lights(self) -> None:
        ambient = AmbientLight("ambient")
        ambient.setColor(Vec4(0.25, 0.27, 0.35, 1))
        sun = DirectionalLight("sun")
        sun.setColor(Vec4(0.9, 0.85, 0.75, 1))
        sun_np = self.render.attachNewNode(sun)
        sun_np.setHpr(30, -50, 0)
        self.render.setLight(self.render.attachNewNode(ambient))
        self.render.setLight(sun_np)
        self.render.setShaderAuto()

    def _setup_input(self) -> None:
        for key, action in KEY_MAP.items():
            self.accept(key, self._set_key, [action, True])
            self.accept(f"{key}-up", self._set_key, [action, False])
        self.accept("escape", sys.exit)

    def _set_key(self, action: str, pressed: bool) -> None:
        self.keys[action] = pressed

    def update(self, task: Task.Task) -> int:
        dt = min(self.game_clock.getDt(), MAX_DT)
        self.drone.update(dt, self.keys)
        self._follow_camera(dt)
        return Task.cont

    def _follow_camera(self, dt: float) -> None:
        target = self.drone.root.getPos(self.render) + self.drone.root.getQuat().xform(
            Vec3(0, -12, 4)
        )
        blend = min(1.0, 5.0 * dt)
        self.camera.setPos(self.camera.getPos() + (target - self.camera.getPos()) * blend)
        self.camera.lookAt(self.drone.root)


if __name__ == "__main__":
    SalvageApp().run()
`,
    },
    {
      filename: "game/drone.py",
      syntax: "hash",
      languageLabel: "Python",
      code: `from __future__ import annotations

from typing import TYPE_CHECKING

from panda3d.core import (
    BitMask32,
    CollisionHandlerPusher,
    CollisionNode,
    CollisionSphere,
    NodePath,
    Vec3,
)

if TYPE_CHECKING:
    from direct.showbase.ShowBase import ShowBase

THRUST = 18.0
VERTICAL_THRUST = 10.0
TURN_SPEED = 110.0
DAMPING = 2.2
MAX_SPEED = 14.0
WORLD_MASK = BitMask32.bit(1)


class Drone:
    def __init__(self, base: ShowBase, pusher: CollisionHandlerPusher, start: Vec3) -> None:
        self.root: NodePath = base.render.attachNewNode("drone")
        self.root.setPos(start)
        self.model = base.loader.loadModel("models/drone.bam")
        self.model.reparentTo(self.root)

        self.velocity = Vec3(0, 0, 0)
        self.battery = 100.0

        node = CollisionNode("drone-hull")
        node.addSolid(CollisionSphere(0, 0, 0, 0.8))
        node.setFromCollideMask(WORLD_MASK)
        node.setIntoCollideMask(BitMask32.allOff())
        self.collider = self.root.attachNewNode(node)

        # The pusher moves self.root back out of walls after each traversal.
        pusher.addCollider(self.collider, self.root)
        base.cTrav.addCollider(self.collider, pusher)

    def update(self, dt: float, keys: dict[str, bool]) -> None:
        turn = keys["left"] - keys["right"]
        self.root.setH(self.root.getH() + turn * TURN_SPEED * dt)

        forward = self.root.getQuat().getForward()
        push = forward * (keys["forward"] - keys["back"]) * THRUST
        push.z += (keys["up"] - keys["down"]) * VERTICAL_THRUST

        if self.battery <= 0.0:
            push = Vec3(0, 0, -4.0)
        else:
            self.battery = max(0.0, self.battery - push.length() * 0.02 * dt)

        self.velocity += push * dt
        self.velocity *= max(0.0, 1.0 - DAMPING * dt)
        if self.velocity.length() > MAX_SPEED:
            self.velocity.normalize()
            self.velocity *= MAX_SPEED

        self.root.setPos(self.root.getPos() + self.velocity * dt)
        self.model.setR(-turn * 12.0)

    def recharge(self, amount: float) -> None:
        self.battery = min(100.0, self.battery + amount)

    def destroy(self) -> None:
        self.collider.removeNode()
        self.root.removeNode()
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "The drone pushes through thin walls when I hold forward. I'm using CollisionHandlerPusher, so shouldn't that stop it?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "The pusher only reacts to overlaps it sees during `cTrav.traverse()`, which ShowBase runs once per frame after your tasks. If one frame moves the drone further than the sphere's diameter (1.6 units) plus the wall thickness, it can end up past the wall with no overlap to resolve.\n\nAt `MAX_SPEED = 14` and the `MAX_DT` clamp of 1/30 s, the worst case is about 0.47 units per frame, which should be safe for walls thicker than a few centimetres. If it still happens:\n1. Check the cavern's collision geometry has the `WORLD_MASK` bit set as its into-mask.\n2. Enable `cTrav.setRespectPrevTransform(True)` and call `setFluidPos` instead of `setPos`, so Panda3D tests the swept path.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Does subtracting booleans like keys['left'] - keys['right'] actually work in Python?",
      delay: 25000,
    },
    {
      role: "assistant",
      content:
        "Yes. `bool` is a subclass of `int`, so `True - False` is `1` and `False - True` is `-1`. It's a compact way to get an axis value in the range -1 to 1.\n\nIt's also easy to misread, so if your linter or reviewers object, `int(keys['left']) - int(keys['right'])` is identical and more explicit. Type checkers such as mypy accept the original as-is, since arithmetic on `bool` returns `int`.\n\nOne small issue: diagonal input isn't normalised, but since forward thrust and vertical thrust are on separate axes with different constants, that's arguably intentional here.",
      delay: 37000,
    },
    {
      role: "user",
      content: "How can I unit test Drone.update without opening a window?",
      delay: 50000,
    },
    {
      role: "assistant",
      content:
        "Run ShowBase offscreen. In `tests/conftest.py`, call `loadPrcFileData('', 'window-type none')` and `loadPrcFileData('', 'audio-library-name null')` before creating `ShowBase()`, and create it once per session in a fixture because only one ShowBase instance can exist per process.\n\nThen construct a `Drone` with a fresh `CollisionHandlerPusher`, call `update(0.1, keys)` with `forward=True` a few times, and assert the root's Y position increased and `battery` decreased. For collision tests, call `base.cTrav.traverse(base.render)` manually after each update, since the task manager isn't stepping.",
      delay: 62000,
    },
  ],
};

export default config;
