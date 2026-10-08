import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "threejs",
  project: "pebble-kart",
  branch: "fix/kart-ground-snap",
  indent: "Spaces: 2",
  files: [
    "index.html",
    "package.json",
    "vite.config.ts",
    "src/main.ts",
    "src/world/TrackScene.ts",
    "src/vehicles/Kart.ts",
    "src/input/Keyboard.ts",
    "public/models/track-meadow.glb",
    "tests/kart.test.ts",
  ],
  snippets: [
    {
      filename: "src/world/TrackScene.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { Kart } from "../vehicles/Kart";
import { Keyboard } from "../input/Keyboard";

const FIXED_STEP = 1 / 120;
const MAX_FRAME = 0.1;
const CAMERA_OFFSET = new THREE.Vector3(0, 3.2, -7.5);

export class TrackScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.1, 600);

  private readonly keyboard = new Keyboard();
  private readonly groundMeshes: THREE.Object3D[] = [];
  private readonly camTarget = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private kart!: Kart;
  private accumulator = 0;
  private lastTime = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.scene.fog = new THREE.Fog(0x9fd4ff, 80, 400);
  }

  async load(): Promise<void> {
    const draco = new DRACOLoader().setDecoderPath("/draco/");
    const loader = new GLTFLoader().setDRACOLoader(draco);
    const [track, kartGltf] = await Promise.all([
      loader.loadAsync("/models/track-meadow.glb"),
      loader.loadAsync("/models/kart-pebble.glb"),
    ]);

    track.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.receiveShadow = true;
      if (obj.userData.ground === true) this.groundMeshes.push(obj);
    });
    this.scene.add(track.scene);

    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(40, 80, 20);
    sun.castShadow = true;
    this.scene.add(sun, new THREE.HemisphereLight(0xcfe8ff, 0x4a6b3a, 0.8));

    this.kart = new Kart(kartGltf.scene, this.groundMeshes);
    this.scene.add(this.kart.object);
  }

  start(): void {
    window.addEventListener("resize", this.resize);
    this.resize();
    this.renderer.setAnimationLoop(this.frame);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.resize);
    this.keyboard.dispose();
    this.renderer.dispose();
  }

  private readonly frame = (timeMs: number): void => {
    const now = timeMs / 1000;
    const dt = this.lastTime === 0 ? 0 : Math.min(now - this.lastTime, MAX_FRAME);
    this.lastTime = now;

    this.accumulator += dt;
    while (this.accumulator >= FIXED_STEP) {
      this.kart.step(FIXED_STEP, this.keyboard.state);
      this.accumulator -= FIXED_STEP;
    }

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private updateCamera(dt: number): void {
    this.camTarget.copy(CAMERA_OFFSET).applyQuaternion(this.kart.object.quaternion);
    this.camTarget.add(this.kart.object.position);
    this.camera.position.lerp(this.camTarget, 1 - Math.exp(-6 * dt));
    this.lookAt.copy(this.kart.object.position).setY(this.kart.object.position.y + 1);
    this.camera.lookAt(this.lookAt);
  }

  private readonly resize = (): void => {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}`,
    },
    {
      filename: "src/vehicles/Kart.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import * as THREE from "three";
import type { InputState } from "../input/Keyboard";

const ENGINE_FORCE = 28;
const BRAKE_FORCE = 40;
const MAX_SPEED = 32;
const TURN_RATE = 2.1;
const GRIP = 6;
const ROLLING_DRAG = 0.6;
const RIDE_HEIGHT = 0.35;
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

export class Kart {
  readonly object = new THREE.Group();
  readonly velocity = new THREE.Vector3();

  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly forward = new THREE.Vector3();
  private readonly lateral = new THREE.Vector3();
  private readonly rayOrigin = new THREE.Vector3();
  private heading = 0;

  constructor(model: THREE.Object3D, private readonly ground: THREE.Object3D[]) {
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.object.add(model);
    this.raycaster.far = 4;
  }

  get speed(): number {
    return this.velocity.length();
  }

  step(dt: number, input: InputState): void {
    const forwardSpeed = this.velocity.dot(this.forward);
    const steerScale = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / 8, 0, 1);
    this.heading -= input.steer * TURN_RATE * steerScale * Math.sign(forwardSpeed || 1) * dt;
    this.object.quaternion.setFromAxisAngle(UP, this.heading);

    this.forward.set(0, 0, 1).applyQuaternion(this.object.quaternion);
    this.lateral.set(1, 0, 0).applyQuaternion(this.object.quaternion);

    if (input.throttle > 0) {
      this.velocity.addScaledVector(this.forward, ENGINE_FORCE * input.throttle * dt);
    } else if (input.brake > 0) {
      const brake = Math.min(BRAKE_FORCE * dt, Math.abs(forwardSpeed));
      this.velocity.addScaledVector(this.forward, -Math.sign(forwardSpeed) * brake);
    }

    // Bleed off sideways velocity so the kart grips instead of sliding on ice.
    const slide = this.velocity.dot(this.lateral);
    this.velocity.addScaledVector(this.lateral, -slide * Math.min(1, GRIP * dt));
    this.velocity.multiplyScalar(Math.max(0, 1 - ROLLING_DRAG * dt));
    this.velocity.clampLength(0, MAX_SPEED);

    this.object.position.addScaledVector(this.velocity, dt);
    this.snapToGround();
  }

  private snapToGround(): void {
    this.rayOrigin.copy(this.object.position).setY(this.object.position.y + 2);
    this.raycaster.set(this.rayOrigin, DOWN);
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.ground, true, this.hits);

    const hit = this.hits[0];
    if (hit) {
      this.object.position.y = hit.point.y + RIDE_HEIGHT;
      this.velocity.y = 0;
    }
  }
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Why a fixed step accumulator? setAnimationLoop already gives me a timestamp, can't I just pass dt to the kart?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "You can, but the handling would change with refresh rate. The kart uses explicit Euler integration plus grip and drag terms like `Math.min(1, GRIP * dt)`. Those are only approximately frame-rate independent, so a 30 fps laptop and a 165 Hz monitor would corner differently.\n\nStepping at a fixed `1 / 120` makes the simulation deterministic for a given input stream, which also makes replays and ghost cars possible later. Clamping the frame to `MAX_FRAME` prevents a spiral of death after a tab switch, when the browser pauses `requestAnimationFrame` and the next delta could be several seconds.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Profiler shows minor GC every few seconds while driving. Where's that from?",
      delay: 25000,
    },
    {
      role: "assistant",
      content:
        "The kart itself is clean now: `forward`, `lateral`, `rayOrigin` and the `hits` array are reused, and passing `this.hits` as the third argument to `intersectObjects` stops it allocating a fresh result array each step.\n\nRemaining suspects:\n1. Each `Intersection` object is still allocated by the raycaster. At 120 Hz that's a few hundred small objects per second, which is usually fine, but a ground heightfield lookup would remove it entirely.\n2. `traverse` callbacks in `load()` run once, so they're not the cause.\n3. Check the `Keyboard` class: returning a new `state` object per call would allocate every step.",
      delay: 37000,
    },
    {
      role: "user",
      content: "Without interpolation, will the 120 Hz step look jittery on a 144 Hz display?",
      delay: 50000,
    },
    {
      role: "assistant",
      content:
        "Slightly, yes. With 120 steps per second and 144 frames, some frames run zero steps and the kart appears to stall for a frame.\n\nThe standard fix is to render an interpolated pose. Keep `previousPosition` and `previousQuaternion` on the kart, copy into them at the start of `step`, then after the loop compute `alpha = this.accumulator / FIXED_STEP` and set the visual object with `position.lerpVectors(prev, current, alpha)` and `quaternion.slerpQuaternions(prevQ, currentQ, alpha)`. Keep the simulated state separate from the `Object3D` you render so the physics never reads interpolated values.",
      delay: 62000,
    },
  ],
};

export default config;
