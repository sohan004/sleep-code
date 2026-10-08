import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "unity",
  project: "skyward-runner",
  branch: "feat/wall-run",
  indent: "Spaces: 4",
  files: [
    "Assets/Scripts/Player/PlayerMovement.cs",
    "Assets/Scripts/Player/PlayerStamina.cs",
    "Assets/Scripts/UI/StaminaBar.cs",
    "Assets/Input/PlayerControls.inputactions",
    "Assets/Scenes/Rooftops_01.unity",
    "Assets/Tests/EditMode/PlayerStaminaTests.cs",
    "Packages/manifest.json",
    "ProjectSettings/ProjectVersion.txt",
  ],
  snippets: [
    {
      filename: "Assets/Scripts/Player/PlayerMovement.cs",
      syntax: "clike",
      languageLabel: "C#",
      code: `using UnityEngine;
using UnityEngine.InputSystem;

namespace Skyward.Player
{
    [RequireComponent(typeof(Rigidbody))]
    [RequireComponent(typeof(PlayerStamina))]
    public sealed class PlayerMovement : MonoBehaviour
    {
        [SerializeField] private InputActionReference moveAction;
        [SerializeField] private InputActionReference jumpAction;
        [SerializeField] private InputActionReference sprintAction;

        [Header("Ground")]
        [SerializeField] private float walkSpeed = 6f;
        [SerializeField] private float sprintSpeed = 10f;
        [SerializeField] private float acceleration = 60f;
        [SerializeField] private float jumpHeight = 1.6f;

        [Header("Wall Run")]
        [SerializeField] private LayerMask wallMask;
        [SerializeField] private float wallCheckDistance = 0.7f;
        [SerializeField] private float wallRunGravity = 2.5f;
        [SerializeField] private float wallRunCostPerSecond = 18f;

        private Rigidbody body;
        private PlayerStamina stamina;
        private Vector2 moveInput;
        private bool jumpQueued, isGrounded, isWallRunning;

        private void Awake()
        {
            body = GetComponent<Rigidbody>();
            stamina = GetComponent<PlayerStamina>();
            body.interpolation = RigidbodyInterpolation.Interpolate;
            body.freezeRotation = true;
        }

        private void OnEnable()
        {
            moveAction.action.actionMap.Enable();
            jumpAction.action.performed += OnJump;
        }

        private void OnDisable() => jumpAction.action.performed -= OnJump;

        private void OnJump(InputAction.CallbackContext ctx) => jumpQueued = true;

        private void Update() => moveInput = moveAction.action.ReadValue<Vector2>();

        private void FixedUpdate()
        {
            float dt = Time.fixedDeltaTime;
            isGrounded = Physics.Raycast(body.position, Vector3.down, 1.1f);
            UpdateWallRun(dt);

            bool sprinting = sprintAction.action.IsPressed()
                && stamina.TryDrain(stamina.SprintCost * dt);
            float speed = sprinting ? sprintSpeed : walkSpeed;
            Vector3 wish = transform.right * moveInput.x + transform.forward * moveInput.y;
            Vector3 target = Vector3.ClampMagnitude(wish, 1f) * speed;

            Vector3 vel = body.linearVelocity;
            Vector3 planar = new Vector3(vel.x, 0f, vel.z);
            planar = Vector3.MoveTowards(planar, target, acceleration * dt);
            body.linearVelocity = new Vector3(planar.x, vel.y, planar.z);

            if (!jumpQueued) return;
            jumpQueued = false;
            if (isGrounded || isWallRunning) Jump();
        }

        private void UpdateWallRun(float dt)
        {
            var right = new Ray(body.position, transform.right);
            var left = new Ray(body.position, -transform.right);
            bool hit = Physics.Raycast(right, wallCheckDistance, wallMask)
                || Physics.Raycast(left, wallCheckDistance, wallMask);

            bool wantsRun = hit && !isGrounded && moveInput.y > 0.1f;
            isWallRunning = wantsRun && stamina.TryDrain(wallRunCostPerSecond * dt);
            body.useGravity = !isWallRunning;

            if (!isWallRunning) return;
            body.AddForce(Vector3.down * wallRunGravity, ForceMode.Acceleration);
        }

        private void Jump()
        {
            float jumpSpeed = Mathf.Sqrt(2f * -Physics.gravity.y * jumpHeight);
            Vector3 vel = body.linearVelocity;
            body.linearVelocity = new Vector3(vel.x, jumpSpeed, vel.z);
        }
    }
}`,
    },
    {
      filename: "Assets/Scripts/Player/PlayerStamina.cs",
      syntax: "clike",
      languageLabel: "C#",
      code: `using System;
using UnityEngine;

namespace Skyward.Player
{
    [DisallowMultipleComponent]
    public sealed class PlayerStamina : MonoBehaviour
    {
        [SerializeField, Min(1f)] private float maxStamina = 100f;
        [SerializeField] private float regenPerSecond = 25f;
        [SerializeField] private float regenDelay = 0.75f;
        [SerializeField] private float sprintCostPerSecond = 12f;
        [SerializeField, Range(0f, 1f)] private float exhaustedThreshold = 0.2f;

        public event Action<float, float> Changed;
        public event Action Exhausted;

        public float Current { get; private set; }
        public float Max => maxStamina;
        public float SprintCost => sprintCostPerSecond;
        public float Normalised => Current / maxStamina;
        public bool IsExhausted { get; private set; }

        private float lastDrainTime = float.NegativeInfinity;

        private void Awake()
        {
            Current = maxStamina;
        }

        private void FixedUpdate()
        {
            Tick(Time.fixedTime, Time.fixedDeltaTime);
        }

        // Split out so EditMode tests can drive time without a running player loop.
        public void Tick(float now, float dt)
        {
            if (Current >= maxStamina) return;
            if (now - lastDrainTime < regenDelay) return;

            SetCurrent(Current + regenPerSecond * dt);

            if (IsExhausted && Normalised >= exhaustedThreshold)
            {
                IsExhausted = false;
            }
        }

        public bool TryDrain(float amount)
        {
            if (amount <= 0f) return true;
            if (IsExhausted || Current <= 0f) return false;

            lastDrainTime = Time.fixedTime;
            SetCurrent(Current - amount);

            if (Current <= 0f)
            {
                IsExhausted = true;
                Exhausted?.Invoke();
            }
            return true;
        }

        public void Refill()
        {
            IsExhausted = false;
            SetCurrent(maxStamina);
        }

        private void SetCurrent(float value)
        {
            float clamped = Mathf.Clamp(value, 0f, maxStamina);
            if (Mathf.Approximately(clamped, Current)) return;
            Current = clamped;
            Changed?.Invoke(Current, maxStamina);
        }

#if UNITY_EDITOR
        private void OnValidate()
        {
            regenPerSecond = Mathf.Max(0f, regenPerSecond);
            regenDelay = Mathf.Max(0f, regenDelay);
        }
#endif
    }
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "In PlayerMovement I read the move vector in Update but apply it in FixedUpdate. Is that going to feel laggy at 144 Hz?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "It's the right split. `Update` runs every rendered frame, so caching `moveInput` there means `FixedUpdate` always sees the latest value, at most one physics step old (20 ms at the default 50 Hz).\n\nThe smoothness at 144 Hz comes from `RigidbodyInterpolation.Interpolate`, which you already set in `Awake`. Without it the transform only moves on physics ticks and the camera would judder.\n\nThe one thing to avoid is reading one-shot actions with `WasPressedThisFrame()` inside `FixedUpdate`: that can miss presses when several frames render between ticks. Your `jumpQueued` flag set from the `performed` callback handles that properly.",
      delay: 11000,
    },
    {
      role: "user",
      content: "Should I be using body.velocity? The docs example I copied used that.",
      delay: 22000,
    },
    {
      role: "assistant",
      content:
        "No, keep `linearVelocity`. In Unity 6, `Rigidbody.velocity` was renamed to `linearVelocity` (and `drag` to `linearDamping`), and the old names are marked obsolete. The behaviour is identical, so older tutorials still translate one-to-one.\n\nAlso note you're writing velocity directly for planar movement but using `AddForce(..., ForceMode.Acceleration)` for the wall-run gravity. That mix is fine: `Acceleration` ignores mass and is already scaled by the fixed timestep, so you don't multiply by `dt` yourself.",
      delay: 33000,
    },
    {
      role: "user",
      content: "Can you write an EditMode test for the stamina regen delay?",
      delay: 45000,
    },
    {
      role: "assistant",
      content:
        "Because `Tick(now, dt)` takes time as parameters, you can test it without entering Play Mode:\n\n```csharp\n[Test]\npublic void Regen_WaitsForDelay()\n{\n    var go = new GameObject();\n    var s = go.AddComponent<PlayerStamina>();\n    s.Refill();\n    s.TryDrain(50f);\n    s.Tick(0.5f, 0.1f);\n    Assert.AreEqual(50f, s.Current, 0.001f);\n    s.Tick(2f, 0.1f);\n    Assert.Greater(s.Current, 50f);\n    Object.DestroyImmediate(go);\n}\n```\n\nOne caveat: `TryDrain` reads `Time.fixedTime`, which is 0 in EditMode. Consider passing `now` into `TryDrain` too so the test is fully deterministic.",
      delay: 57000,
    },
  ],
};

export default config;
