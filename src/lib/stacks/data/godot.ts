import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "godot",
  project: "hollow-depths",
  branch: "feat/dash-iframes",
  indent: "Tab Size: 4",
  files: [
    "project.godot",
    "autoload/game_events.gd",
    "scenes/player/player.tscn",
    "scenes/player/player.gd",
    "scenes/components/health_component.gd",
    "scenes/levels/crypt_floor_01.tscn",
    "scenes/enemies/bone_crawler.gd",
    "tests/unit/test_health_component.gd",
  ],
  snippets: [
    {
      filename: "scenes/player/player.gd",
      syntax: "hash",
      languageLabel: "GDScript",
      code: `class_name Player
extends CharacterBody2D

signal dashed(direction: Vector2)
signal died

const DASH_SPEED := 720.0
const DASH_TIME := 0.15

@export var move_speed: float = 220.0
@export var acceleration: float = 1800.0
@export var friction: float = 2200.0
@export var dash_cooldown: float = 0.6

@onready var health: HealthComponent = $HealthComponent
@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var hurtbox: Area2D = $Hurtbox
@onready var dash_timer: Timer = $DashCooldown

var _dash_left := 0.0
var _dash_dir := Vector2.ZERO
var _facing := Vector2.RIGHT


func _ready() -> void:
	health.damaged.connect(_on_damaged)
	health.died.connect(_on_died)
	hurtbox.area_entered.connect(_on_hurtbox_area_entered)
	dash_timer.wait_time = dash_cooldown
	dash_timer.one_shot = true


func _physics_process(delta: float) -> void:
	var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if not input.is_zero_approx():
		_facing = input.normalized()

	if Input.is_action_just_pressed("dash") and dash_timer.is_stopped():
		_start_dash()

	if _dash_left > 0.0:
		_dash_left -= delta
		velocity = _dash_dir * DASH_SPEED
	elif input.is_zero_approx():
		velocity = velocity.move_toward(Vector2.ZERO, friction * delta)
	else:
		velocity = velocity.move_toward(input * move_speed, acceleration * delta)

	move_and_slide()
	_update_animation(input)


func _start_dash() -> void:
	_dash_dir = _facing
	_dash_left = DASH_TIME
	dash_timer.start()
	health.grant_invulnerability(DASH_TIME + 0.05)
	dashed.emit(_dash_dir)


func _update_animation(input: Vector2) -> void:
	sprite.flip_h = _facing.x < 0.0
	if _dash_left > 0.0:
		sprite.play(&"dash")
	elif input.is_zero_approx():
		sprite.play(&"idle")
	else:
		sprite.play(&"run")


func _on_hurtbox_area_entered(area: Area2D) -> void:
	if area.is_in_group(&"enemy_attack"):
		var damage: int = area.get_meta(&"damage", 1)
		health.take_damage(damage, area.owner)


func _on_damaged(_amount: int, _source: Node) -> void:
	var tween := create_tween()
	tween.tween_property(sprite, "modulate", Color(1, 0.3, 0.3), 0.05)
	tween.tween_property(sprite, "modulate", Color.WHITE, 0.15)


func _on_died() -> void:
	set_physics_process(false)
	hurtbox.set_deferred(&"monitoring", false)
	sprite.play(&"death")
	died.emit()
`,
    },
    {
      filename: "scenes/components/health_component.gd",
      syntax: "hash",
      languageLabel: "GDScript",
      code: `class_name HealthComponent
extends Node

## Reusable hit points with invulnerability frames. Attach to any actor scene.

signal damaged(amount: int, source: Node)
signal healed(amount: int)
signal died
signal health_changed(current: int, maximum: int)

@export var max_health: int = 6:
	set(value):
		max_health = maxi(1, value)
		current = mini(current, max_health)
@export var hit_invulnerability: float = 0.6

var current: int = max_health:
	set(value):
		var clamped := clampi(value, 0, max_health)
		if clamped == current:
			return
		current = clamped
		health_changed.emit(current, max_health)

var _invulnerable_until_ms := 0
var _is_dead := false


func _ready() -> void:
	current = max_health


func is_dead() -> bool:
	return _is_dead


func is_invulnerable() -> bool:
	return Time.get_ticks_msec() < _invulnerable_until_ms


func grant_invulnerability(seconds: float) -> void:
	var until := Time.get_ticks_msec() + int(seconds * 1000.0)
	_invulnerable_until_ms = maxi(_invulnerable_until_ms, until)


func take_damage(amount: int, source: Node = null) -> bool:
	if amount <= 0 or _is_dead or is_invulnerable():
		return false

	current -= amount
	damaged.emit(amount, source)

	if current == 0:
		_is_dead = true
		died.emit()
	else:
		grant_invulnerability(hit_invulnerability)
	return true


func heal(amount: int) -> void:
	if amount <= 0 or _is_dead:
		return
	var before := current
	current += amount
	if current > before:
		healed.emit(current - before)


func revive(fraction: float = 1.0) -> void:
	_is_dead = false
	_invulnerable_until_ms = 0
	current = ceili(max_health * clampf(fraction, 0.0, 1.0))
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Do I need to multiply velocity by delta before move_and_slide? The player feels fine but I want to be sure.",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "No. In Godot 4, `move_and_slide()` takes no arguments and reads the body's `velocity` property in pixels per second, applying the physics step internally. Multiplying by `delta` yourself would make the player crawl.\n\nWhere `delta` *does* belong is in rate-of-change maths, which you already have: `velocity.move_toward(target, acceleration * delta)` changes velocity by a frame-rate-independent amount. Because this runs in `_physics_process`, `delta` is the fixed physics step (1/60 by default), so behaviour is consistent even if rendering drops.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Why use Time.get_ticks_msec for i-frames instead of a Timer node?",
      delay: 23000,
    },
    {
      role: "assistant",
      content:
        "Mostly simplicity and composability. A timestamp lets `grant_invulnerability` take the **max** of the existing and new windows, so a dash during hit i-frames never shortens them. With a `Timer` you would need to compare `time_left` and restart it.\n\nTwo caveats:\n1. `get_ticks_msec()` is wall-clock time, so it keeps running while the tree is paused. If your pause menu should freeze i-frames, accumulate time in `_physics_process` instead.\n2. It ignores `Engine.time_scale`, so slow-motion effects won't stretch invulnerability.",
      delay: 34000,
    },
    {
      role: "user",
      content: "Can you sketch a GUT test that checks i-frames block a second hit?",
      delay: 47000,
    },
    {
      role: "assistant",
      content:
        "Sure, using GUT's `add_child_autofree` so the node is cleaned up:\n\n```gdscript\nextends GutTest\n\nfunc test_iframes_block_second_hit() -> void:\n\tvar hp := HealthComponent.new()\n\tadd_child_autofree(hp)\n\tassert_true(hp.take_damage(1))\n\tassert_false(hp.take_damage(1))\n\tassert_eq(hp.current, hp.max_health - 1)\n```\n\nAdd `watch_signals(hp)` before the hits and `assert_signal_emit_count(hp, 'damaged', 1)` to confirm only one `damaged` emission. For the expiry case, set `hit_invulnerability = 0.0` rather than waiting on real time, which keeps the suite fast and deterministic.",
      delay: 59000,
    },
  ],
};

export default config;
