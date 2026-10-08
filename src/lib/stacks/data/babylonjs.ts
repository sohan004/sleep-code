import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "babylonjs",
  project: "tilt-labyrinth",
  branch: "feat/havok-board-tilt",
  indent: "Spaces: 2",
  files: [
    "index.html",
    "package.json",
    "vite.config.ts",
    "src/main.ts",
    "src/scenes/MazeScene.ts",
    "src/entities/Marble.ts",
    "src/levels/level-01.json",
    "tests/marble.spec.ts",
  ],
  snippets: [
    {
      filename: "src/scenes/MazeScene.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import HavokPhysics from "@babylonjs/havok";
import {
  ArcRotateCamera,
  Color4,
  DirectionalLight,
  Engine,
  HavokPlugin,
  HemisphericLight,
  KeyboardEventTypes,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsMotionType,
  PhysicsShapeType,
  Quaternion,
  Scene,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { Marble } from "../entities/Marble";

const MAX_TILT = 0.22;
const TILT_SPEED = 1.4;

export async function createMazeScene(engine: Engine): Promise<Scene> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.06, 0.07, 0.1, 1);

  const havok = await HavokPhysics();
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));

  const camera = new ArcRotateCamera("cam", -Math.PI / 2, 0.9, 22, Vector3.Zero(), scene);
  camera.lowerRadiusLimit = 14;
  camera.upperRadiusLimit = 30;
  camera.attachControl(true);

  new HemisphericLight("sky", new Vector3(0, 1, 0), scene).intensity = 0.5;
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.3), scene);
  sun.position = new Vector3(10, 20, -10);
  const shadows = new ShadowGenerator(1024, sun);
  shadows.usePercentageCloserFiltering = true;

  const board = MeshBuilder.CreateBox("board", { width: 12, depth: 12, height: 0.4 }, scene);
  board.rotationQuaternion = Quaternion.Identity();
  board.receiveShadows = true;
  const boardBody = new PhysicsAggregate(board, PhysicsShapeType.BOX, { mass: 0 }, scene).body;
  boardBody.setMotionType(PhysicsMotionType.ANIMATED);
  boardBody.disablePreStep = false;

  const marble = new Marble(scene, new Vector3(-4.5, 1.5, -4.5));
  shadows.addShadowCaster(marble.mesh);

  const held = new Set<string>();
  scene.onKeyboardObservable.add(({ type, event }) => {
    if (type === KeyboardEventTypes.KEYDOWN) held.add(event.code);
    else held.delete(event.code);
  });

  let tiltX = 0;
  let tiltZ = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const inputX = Number(held.has("KeyS")) - Number(held.has("KeyW"));
    const inputZ = Number(held.has("KeyA")) - Number(held.has("KeyD"));

    tiltX = clamp(tiltX + inputX * TILT_SPEED * dt, -MAX_TILT, MAX_TILT);
    tiltZ = clamp(tiltZ + inputZ * TILT_SPEED * dt, -MAX_TILT, MAX_TILT);
    Quaternion.FromEulerAnglesToRef(tiltX, 0, tiltZ, board.rotationQuaternion!);

    if (marble.mesh.position.y < -6) marble.respawn();
  });

  marble.onRespawn.add(() => {
    tiltX = 0;
    tiltZ = 0;
  });

  return scene;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}`,
    },
    {
      filename: "src/entities/Marble.ts",
      syntax: "clike",
      languageLabel: "TypeScript",
      code: `import {
  Color3,
  Mesh,
  MeshBuilder,
  Observable,
  PBRMaterial,
  PhysicsAggregate,
  PhysicsBody,
  PhysicsShapeType,
  Scene,
  Vector3,
} from "@babylonjs/core";

const RADIUS = 0.35;
const MAX_SPEED = 9;

export class Marble {
  readonly mesh: Mesh;
  readonly body: PhysicsBody;
  readonly onRespawn = new Observable<number>();

  private readonly aggregate: PhysicsAggregate;
  private readonly spawn: Vector3;
  private readonly scratchVelocity = new Vector3();
  private deaths = 0;

  constructor(scene: Scene, spawn: Vector3) {
    this.spawn = spawn.clone();

    this.mesh = MeshBuilder.CreateSphere("marble", { diameter: RADIUS * 2, segments: 24 }, scene);
    this.mesh.position.copyFrom(spawn);

    const mat = new PBRMaterial("marbleMat", scene);
    mat.albedoColor = new Color3(0.85, 0.32, 0.2);
    mat.metallic = 0.1;
    mat.roughness = 0.25;
    this.mesh.material = mat;

    this.aggregate = new PhysicsAggregate(
      this.mesh,
      PhysicsShapeType.SPHERE,
      { mass: 1, restitution: 0.25, friction: 0.7 },
      scene,
    );
    this.body = this.aggregate.body;
    this.body.setLinearDamping(0.15);
    this.body.setAngularDamping(0.3);

    // Clamp speed after each physics step rather than per render frame.
    scene.onAfterPhysicsObservable.add(() => this.limitSpeed());
  }

  get deathCount(): number {
    return this.deaths;
  }

  respawn(): void {
    this.deaths += 1;
    this.body.disablePreStep = false;
    this.mesh.position.copyFrom(this.spawn);
    this.body.setLinearVelocity(Vector3.ZeroReadOnly);
    this.body.setAngularVelocity(Vector3.ZeroReadOnly);

    // Re-enable the optimisation once Havok has consumed the teleport.
    this.mesh.getScene().onAfterPhysicsObservable.addOnce(() => {
      this.body.disablePreStep = true;
    });
    this.onRespawn.notifyObservers(this.deaths);
  }

  dispose(): void {
    this.onRespawn.clear();
    this.aggregate.dispose();
    this.mesh.dispose();
  }

  private limitSpeed(): void {
    this.body.getLinearVelocityToRef(this.scratchVelocity);
    const speed = this.scratchVelocity.length();
    if (speed <= MAX_SPEED) return;
    this.scratchVelocity.scaleInPlace(MAX_SPEED / speed);
    this.body.setLinearVelocity(this.scratchVelocity);
  }
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "The marble sometimes falls straight through the board when I tilt quickly. Is that a Havok tunnelling issue?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Probably not tunnelling. The likely cause is that the board was a `STATIC` body being rotated by changing the mesh transform. Static bodies aren't expected to move, so Havok doesn't compute a velocity for them and the marble gets pushed into the box rather than carried by it.\n\nYour current setup is the right one: `PhysicsMotionType.ANIMATED` plus `disablePreStep = false`, which syncs the mesh transform into the body before every step. Havok then derives the board's angular velocity from the change, so contacts resolve correctly. Keeping `MAX_TILT` and `TILT_SPEED` modest helps too.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Why getLinearVelocityToRef instead of getLinearVelocity in limitSpeed?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "Allocation. `getLinearVelocity()` returns a new `Vector3` every call, and `limitSpeed` runs after every physics step. The `ToRef` variant writes into `scratchVelocity`, which is allocated once in the class.\n\nThe same pattern is used elsewhere: `Quaternion.FromEulerAnglesToRef` writes into the board's existing `rotationQuaternion`, and `Vector3.ZeroReadOnly` avoids creating a zero vector in `respawn`. Babylon's convention is that methods ending in `ToRef` or `InPlace` don't allocate, which is worth following in anything that runs per frame.",
      delay: 36000,
    },
    {
      role: "user",
      content: "How would I unit test respawn without a WebGL context?",
      delay: 48000,
    },
    {
      role: "assistant",
      content:
        "Use `NullEngine`, which runs the scene graph headless in Node:\n\n```ts\nconst engine = new NullEngine();\nconst scene = new Scene(engine);\nconst havok = await HavokPhysics();\nscene.enablePhysics(undefined, new HavokPlugin(true, havok));\nconst marble = new Marble(scene, new Vector3(1, 2, 3));\nmarble.mesh.position.set(0, -10, 0);\nmarble.respawn();\nexpect(marble.mesh.position.asArray()).toEqual([1, 2, 3]);\n```\n\nHavok loads a WASM file, so in Vitest you may need to pass `locateFile` to `HavokPhysics()` pointing at the `HavokPhysics.wasm` file shipped inside the `@babylonjs/havok` package.",
      delay: 60000,
    },
  ],
};

export default config;
