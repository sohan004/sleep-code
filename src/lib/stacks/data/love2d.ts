import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "love2d",
  project: "bramble-bounce",
  branch: "fix/ball-tunnelling",
  indent: "Spaces: 4",
  files: [
    "conf.lua",
    "main.lua",
    "src/ball.lua",
    "src/paddle.lua",
    "src/bricks.lua",
    "assets/sfx/bounce.wav",
    "assets/fonts/pixel.ttf",
    "spec/ball_spec.lua",
  ],
  snippets: [
    {
      filename: "main.lua",
      syntax: "lua",
      languageLabel: "Lua",
      code: `local Ball = require("src.ball")
local Paddle = require("src.paddle")
local Bricks = require("src.bricks")

local FIXED_DT = 1 / 120
local MAX_FRAME = 0.25
local VIRTUAL_W, VIRTUAL_H = 320, 180

local state = {
    accumulator = 0,
    score = 0,
    lives = 3,
    paused = false,
}

local canvas, font, bounceSfx
local ball, paddle, bricks

local function resetBall()
    ball:reset(paddle.x + paddle.w / 2, paddle.y - 8)
end

function love.load()
    love.graphics.setDefaultFilter("nearest", "nearest")
    canvas = love.graphics.newCanvas(VIRTUAL_W, VIRTUAL_H)
    font = love.graphics.newFont("assets/fonts/pixel.ttf", 8)
    bounceSfx = love.audio.newSource("assets/sfx/bounce.wav", "static")

    paddle = Paddle.new(VIRTUAL_W / 2 - 20, VIRTUAL_H - 16)
    bricks = Bricks.new(10, 5, 16, 20)
    ball = Ball.new()
    ball.onBounce = function() bounceSfx:clone():play() end
    resetBall()
end

local function step(dt)
    paddle:update(dt, VIRTUAL_W)
    ball:update(dt, VIRTUAL_W)
    ball:collidePaddle(paddle)

    local hits = bricks:collide(ball)
    state.score = state.score + hits * 10

    if ball.y > VIRTUAL_H then
        state.lives = state.lives - 1
        if state.lives <= 0 then
            love.event.quit("restart")
        end
        resetBall()
    end
end

function love.update(dt)
    if state.paused then return end
    state.accumulator = state.accumulator + math.min(dt, MAX_FRAME)
    while state.accumulator >= FIXED_DT do
        step(FIXED_DT)
        state.accumulator = state.accumulator - FIXED_DT
    end
end

function love.draw()
    love.graphics.setCanvas(canvas)
    love.graphics.clear(0.08, 0.1, 0.09)
    bricks:draw()
    paddle:draw()
    ball:draw()
    love.graphics.setFont(font)
    love.graphics.setColor(0.9, 0.95, 0.85)
    love.graphics.print(string.format("SCORE %05d  LIVES %d", state.score, state.lives), 4, 2)
    love.graphics.setCanvas()

    local w, h = love.graphics.getDimensions()
    local scale = math.max(1, math.floor(math.min(w / VIRTUAL_W, h / VIRTUAL_H)))
    love.graphics.setColor(1, 1, 1)
    love.graphics.draw(canvas, 0, 0, 0, scale, scale)
end

function love.keypressed(key)
    if key == "escape" then
        love.event.quit()
    elseif key == "p" then
        state.paused = not state.paused
    elseif key == "space" and ball.stuck then
        ball:launch()
    end
end
`,
    },
    {
      filename: "src/ball.lua",
      syntax: "lua",
      languageLabel: "Lua",
      code: `local Ball = {}
Ball.__index = Ball

local SPEED = 140
local MAX_SPEED = 260
local SPEED_UP = 1.04
local RADIUS = 3
local MAX_BOUNCE_ANGLE = math.rad(60)

function Ball.new()
    local self = setmetatable({}, Ball)
    self.x, self.y = 0, 0
    self.vx, self.vy = 0, 0
    self.r = RADIUS
    self.stuck = true
    self.onBounce = nil
    return self
end

function Ball:reset(x, y)
    self.x, self.y = x, y
    self.vx, self.vy = 0, 0
    self.stuck = true
end

function Ball:launch()
    local angle = love.math.random() * 0.6 - 0.3
    self.vx = math.sin(angle) * SPEED
    self.vy = -math.cos(angle) * SPEED
    self.stuck = false
end

function Ball:speed()
    return math.sqrt(self.vx * self.vx + self.vy * self.vy)
end

function Ball:bounce()
    if self.onBounce then self.onBounce() end
end

function Ball:update(dt, worldW)
    if self.stuck then return end
    self.x = self.x + self.vx * dt
    self.y = self.y + self.vy * dt

    if self.x - self.r < 0 then
        self.x, self.vx = self.r, math.abs(self.vx)
        self:bounce()
    elseif self.x + self.r > worldW then
        self.x, self.vx = worldW - self.r, -math.abs(self.vx)
        self:bounce()
    end
    if self.y - self.r < 0 then
        self.y, self.vy = self.r, math.abs(self.vy)
        self:bounce()
    end
end

function Ball:collidePaddle(p)
    if self.vy <= 0 then return false end
    local overlapsX = self.x + self.r > p.x and self.x - self.r < p.x + p.w
    local overlapsY = self.y + self.r > p.y and self.y - self.r < p.y + p.h
    if not (overlapsX and overlapsY) then return false end

    -- Angle depends on where the ball hits: centre goes straight up, edges go wide.
    local offset = ((self.x - p.x) / p.w) * 2 - 1
    local angle = offset * MAX_BOUNCE_ANGLE
    local speed = math.min(self:speed() * SPEED_UP, MAX_SPEED)
    self.vx = math.sin(angle) * speed
    self.vy = -math.cos(angle) * speed
    self.y = p.y - self.r
    self:bounce()
    return true
end

function Ball:draw()
    love.graphics.setColor(0.95, 0.85, 0.4)
    love.graphics.circle("fill", self.x, self.y, self.r)
end

return Ball
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Before the fixed step, the ball would occasionally pass straight through the paddle on my old laptop. Is 1/120 enough?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "For these numbers, yes. At `MAX_SPEED = 260` the ball moves about 2.2 px per 1/120 s step. The paddle is several pixels tall and the ball's diameter is 6 px, so an overlap is always detected before the ball can cross it.\n\nPreviously, a 100 ms hitch meant a single 26 px jump, which easily skipped the paddle. The accumulator splits that hitch into 12 small steps instead.\n\n`MAX_FRAME = 0.25` also matters: without it, dragging the window on some platforms pauses `love.update`, and the next `dt` could trigger hundreds of catch-up steps.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Is bounceSfx:clone():play() bad for garbage? It runs on every bounce.",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "It does allocate a new `Source` per bounce. For a static source the audio data is shared, so it's cheap, but the Lua objects still need collecting and rapid bounces can stack many voices.\n\nA small pool is cleaner:\n\n```lua\nlocal pool, nextIdx = {}, 1\nfor i = 1, 4 do pool[i] = bounceSfx:clone() end\nball.onBounce = function()\n    local s = pool[nextIdx]\n    s:stop(); s:play()\n    nextIdx = nextIdx % #pool + 1\nend\n```\n\nThat caps simultaneous bounce sounds at four and allocates nothing during play.",
      delay: 36000,
    },
    {
      role: "user",
      content: "Can I test Ball with busted even though it calls love.math.random?",
      delay: 49000,
    },
    {
      role: "assistant",
      content:
        "Yes. `ball.lua` only touches `love` inside `launch` and `draw`, so stub the global at the top of `spec/ball_spec.lua`:\n\n```lua\n_G.love = { math = { random = function() return 0.5 end } }\nlocal Ball = require('src.ball')\n```\n\nWith `random` returning 0.5 the launch angle is exactly 0, so you can assert `vx == 0` and `vy == -140`. For `collidePaddle`, pass a plain table such as `{ x = 0, y = 100, w = 40, h = 4 }`; since it only reads fields, no `Paddle` instance is needed. Run busted from the project root so `require` resolves `src.ball`.",
      delay: 61000,
    },
  ],
};

export default config;
