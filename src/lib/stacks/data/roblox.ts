import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "roblox",
  project: "crystal-heist",
  branch: "feat/server-validated-pickups",
  indent: "Tab Size: 4",
  files: [
    "default.project.json",
    "wally.toml",
    "selene.toml",
    "src/server/CrystalCollector.server.luau",
    "src/server/Modules/CrystalSpawner.luau",
    "src/server/Modules/PlayerStats.luau",
    "src/client/CrystalHud.client.luau",
    "src/shared/CrystalConfig.luau",
  ],
  snippets: [
    {
      filename: "src/server/CrystalCollector.server.luau",
      syntax: "lua",
      languageLabel: "Luau",
      code: `--!strict
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Modules = ServerScriptService:WaitForChild("Modules")
local CrystalSpawner = require(Modules:WaitForChild("CrystalSpawner"))
local PlayerStats = require(Modules:WaitForChild("PlayerStats"))
local CrystalConfig = require(ReplicatedStorage.Shared.CrystalConfig)

local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local CollectCrystal = Remotes:WaitForChild("CollectCrystal") :: RemoteEvent
local CrystalCollected = Remotes:WaitForChild("CrystalCollected") :: RemoteEvent

local MAX_PICKUP_DISTANCE = CrystalConfig.PickupRadius + 4
local MIN_SECONDS_BETWEEN = 0.2

local lastPickup: { [Player]: number } = {}

local function getRootPart(player: Player): BasePart?
	local character = player.Character
	if not character then
		return nil
	end
	return character:FindFirstChild("HumanoidRootPart") :: BasePart?
end

local function onCollectRequest(player: Player, crystalId: unknown)
	-- Never trust client arguments: check type, existence, distance and rate.
	if typeof(crystalId) ~= "string" then
		return
	end

	local now = os.clock()
	if now - (lastPickup[player] or 0) < MIN_SECONDS_BETWEEN then
		return
	end

	local crystal = CrystalSpawner.get(crystalId)
	local root = getRootPart(player)
	if not crystal or not root then
		return
	end

	if (root.Position - crystal.part.Position).Magnitude > MAX_PICKUP_DISTANCE then
		warn(string.format("[CrystalCollector] rejected far pickup from %d", player.UserId))
		return
	end

	if not CrystalSpawner.claim(crystalId) then
		return
	end

	lastPickup[player] = now
	local total = PlayerStats.addCrystals(player, crystal.value)
	CrystalCollected:FireAllClients(crystalId, player.UserId)
	CrystalCollected:FireClient(player, crystalId, player.UserId, total)
end

Players.PlayerAdded:Connect(function(player)
	PlayerStats.load(player)
end)

Players.PlayerRemoving:Connect(function(player)
	lastPickup[player] = nil
	PlayerStats.save(player)
end)

game:BindToClose(function()
	for _, player in Players:GetPlayers() do
		task.spawn(PlayerStats.save, player)
	end
	task.wait(2)
end)

CollectCrystal.OnServerEvent:Connect(onCollectRequest)
CrystalSpawner.start(workspace:WaitForChild("CrystalSpawns") :: Folder)
`,
    },
    {
      filename: "src/server/Modules/CrystalSpawner.luau",
      syntax: "lua",
      languageLabel: "Luau",
      code: `--!strict
local CollectionService = game:GetService("CollectionService")
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")

local CrystalConfig = require(ReplicatedStorage.Shared.CrystalConfig)

local CRYSTAL_TAG = "Crystal"
local template = ServerStorage:WaitForChild("CrystalTemplate") :: BasePart

export type Crystal = {
	id: string,
	part: BasePart,
	value: number,
	spawnPoint: BasePart,
}

local CrystalSpawner = {}

local active: { [string]: Crystal } = {}
local container: Folder? = nil

local function rollValue(): number
	local roll = math.random()
	if roll < CrystalConfig.RareChance then
		return CrystalConfig.RareValue
	end
	return CrystalConfig.BaseValue
end

local function spawnAt(spawnPoint: BasePart)
	local id = HttpService:GenerateGUID(false)
	local part = template:Clone()
	part.Name = id
	part.CFrame = spawnPoint.CFrame + Vector3.new(0, 2, 0)
	part.Anchored = true
	part.CanCollide = false
	part:SetAttribute("CrystalId", id)
	CollectionService:AddTag(part, CRYSTAL_TAG)
	part.Parent = container

	active[id] = {
		id = id,
		part = part,
		value = rollValue(),
		spawnPoint = spawnPoint,
	}
end

function CrystalSpawner.get(id: string): Crystal?
	return active[id]
end

-- Removes the crystal atomically so two players can't claim the same one.
function CrystalSpawner.claim(id: string): boolean
	local crystal = active[id]
	if not crystal then
		return false
	end
	active[id] = nil
	crystal.part:Destroy()

	task.delay(CrystalConfig.RespawnSeconds, spawnAt, crystal.spawnPoint)
	return true
end

function CrystalSpawner.count(): number
	local n = 0
	for _ in active do
		n += 1
	end
	return n
end

function CrystalSpawner.start(spawnFolder: Folder)
	local folder = Instance.new("Folder")
	folder.Name = "ActiveCrystals"
	folder.Parent = workspace
	container = folder

	for _, child in spawnFolder:GetChildren() do
		if child:IsA("BasePart") then
			spawnAt(child)
		end
	end
end

return CrystalSpawner
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Exploiters could just fire CollectCrystal with every crystal ID. Does the distance check actually stop that?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "It stops the simple version. An exploiter can call `FireServer` with any arguments, but the server rejects IDs that aren't in `active` and any crystal further than `MAX_PICKUP_DISTANCE` from their `HumanoidRootPart`.\n\nThe catch is that the client owns its character's physics through network ownership, so a cheat can teleport next to each crystal before firing. The 0.2 s rate limit slows that down. To harden further:\n1. Track each player's last validated position and reject movement faster than their `WalkSpeed` allows.\n2. Consider server-side detection with `Touched` or `GetPartBoundsInRadius`, so the client only needs to be there, not ask.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Why fire CrystalCollected twice to the collecting player?",
      delay: 25000,
    },
    {
      role: "assistant",
      content:
        "Good catch, that's a bug. `FireAllClients` already includes the collector, so they receive two events: one without `total` and one with it. The HUD would play the pickup effect twice.\n\nUse one event for everyone and send the total separately:\n\n```lua\nCrystalCollected:FireAllClients(crystalId, player.UserId)\nStatsChanged:FireClient(player, total)\n```\n\nAlternatively, skip the second remote and let the HUD read a `leaderstats` value or a player attribute set by `PlayerStats`. Attributes replicate automatically and fire `GetAttributeChangedSignal` on the client.",
      delay: 37000,
    },
    {
      role: "user",
      content: "Is task.wait(2) in BindToClose enough to save everyone's data?",
      delay: 50000,
    },
    {
      role: "assistant",
      content:
        "Not reliably. `BindToClose` gives you up to 30 seconds, and a fixed 2-second wait either wastes time or cuts off slow DataStore calls.\n\nBetter to wait for the saves themselves: count outstanding saves, decrement in each `task.spawn` when `PlayerStats.save` returns, and loop with `task.wait()` until the counter hits zero. Inside `save`, wrap `UpdateAsync` in `pcall` with a couple of retries.\n\nAlso note that in Studio, `BindToClose` runs when you stop a play test, so skip saving there with `RunService:IsStudio()` if you don't want test sessions writing to your real data store.",
      delay: 62000,
    },
  ],
};

export default config;
