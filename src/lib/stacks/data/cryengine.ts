import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "cryengine",
  project: "bastion-grid",
  branch: "feat/turret-targeting",
  indent: "Spaces: 4",
  files: [
    "Game.cryproject",
    "Code/CMakeLists.txt",
    "Code/StdAfx.h",
    "Code/GamePlugin.cpp",
    "Code/Components/TurretComponent.h",
    "Code/Components/TurretComponent.cpp",
    "Code/Components/EnemyComponent.h",
    "Assets/levels/outpost/outpost.cry",
  ],
  snippets: [
    {
      filename: "Code/Components/TurretComponent.h",
      syntax: "clike",
      languageLabel: "C++",
      code: `#pragma once

#include <CryEntitySystem/IEntityComponent.h>
#include <CryEntitySystem/IEntitySystem.h>
#include <CryMath/Cry_Math.h>
#include <CrySchematyc/Reflection/TypeDesc.h>
#include <CrySchematyc/Utils/EnumFlags.h>
#include <CrySchematyc/Env/IEnvRegistrar.h>
#include <CrySchematyc/Env/Elements/EnvComponent.h>

class CEnemyComponent;

// Rotates towards the nearest enemy in range and fires on a fixed cooldown.
class CTurretComponent final : public IEntityComponent
{
public:
    CTurretComponent() = default;
    virtual ~CTurretComponent() = default;

    static void ReflectType(Schematyc::CTypeDesc<CTurretComponent>& desc)
    {
        desc.SetGUID("{4C1D9E2A-7B3F-4E61-9A0C-2D85F31B6E47}"_cry_guid);
        desc.SetEditorCategory("Defence");
        desc.SetLabel("Turret");
        desc.SetDescription("Auto-targeting tower that damages enemies in range");
        desc.SetComponentFlags({ IEntityComponent::EFlags::Transform });

        desc.AddMember(&CTurretComponent::m_range, 'rang', "Range", "Range",
            "Maximum targeting distance in metres", 18.f);
        desc.AddMember(&CTurretComponent::m_turnRate, 'turn', "TurnRate", "Turn Rate",
            "Yaw speed in degrees per second", 120.f);
        desc.AddMember(&CTurretComponent::m_fireInterval, 'fire', "FireInterval",
            "Fire Interval", "Seconds between shots", 0.8f);
        desc.AddMember(&CTurretComponent::m_damage, 'dmg', "Damage", "Damage",
            "Damage dealt per shot", 12.f);
    }

    // IEntityComponent
    virtual void Initialize() override;
    virtual Cry::Entity::EventFlags GetEventMask() const override;
    virtual void ProcessEvent(const SEntityEvent& event) override;
    // ~IEntityComponent

    EntityId GetCurrentTarget() const { return m_targetId; }

private:
    void Update(float frameTime);
    void AcquireTarget();
    bool HasLineOfSight(const Vec3& from, const Vec3& to) const;

    // Retargeting is cheaper on a slower cadence than every frame.
    static constexpr float kRetargetInterval = 0.25f;

    float m_range = 18.f;
    float m_turnRate = 120.f;
    float m_fireInterval = 0.8f;
    float m_damage = 12.f;

    EntityId m_targetId = INVALID_ENTITYID;
    float m_cooldown = 0.f;
    float m_retargetTimer = 0.f;
    IPhysicalEntity* m_pSelfPhysics = nullptr;
};`,
    },
    {
      filename: "Code/Components/TurretComponent.cpp",
      syntax: "clike",
      languageLabel: "C++",
      code: `#include "StdAfx.h"
#include "TurretComponent.h"
#include "EnemyComponent.h"

#include <CryCore/StaticInstanceList.h>

namespace
{
    static void RegisterTurretComponent(Schematyc::IEnvRegistrar& registrar)
    {
        Schematyc::CEnvRegistrationScope scope = registrar.Scope(IEntity::GetEntityScopeGUID());
        scope.Register(SCHEMATYC_MAKE_ENV_COMPONENT(CTurretComponent));
    }

    CRY_STATIC_AUTO_REGISTER_FUNCTION(&RegisterTurretComponent);
}

void CTurretComponent::Initialize()
{
    m_pSelfPhysics = m_pEntity->GetPhysicalEntity();
}

Cry::Entity::EventFlags CTurretComponent::GetEventMask() const
{
    return Cry::Entity::EEvent::Update | Cry::Entity::EEvent::Reset;
}

void CTurretComponent::ProcessEvent(const SEntityEvent& event)
{
    switch (event.event)
    {
    case Cry::Entity::EEvent::Update:
        Update(event.fParam[0]);
        break;
    case Cry::Entity::EEvent::Reset:
        m_targetId = INVALID_ENTITYID;
        m_cooldown = m_fireInterval;
        break;
    }
}

void CTurretComponent::Update(float frameTime)
{
    m_retargetTimer -= frameTime;
    if (m_retargetTimer <= 0.f)
    {
        m_retargetTimer = kRetargetInterval;
        AcquireTarget();
    }

    IEntity* pTarget = gEnv->pEntitySystem->GetEntity(m_targetId);
    if (pTarget == nullptr)
        return;

    const Vec3 origin = m_pEntity->GetWorldPos();
    const Vec3 toTarget = (pTarget->GetWorldPos() - origin).GetNormalizedSafe(Vec3(0, 1, 0));
    const Quat desired = Quat::CreateRotationVDir(Vec3(toTarget.x, toTarget.y, 0.f));
    const Quat current = m_pEntity->GetRotation();

    // Clamp the slerp step by turn rate so rotation speed is frame-rate independent.
    const float angle = acos_tpl(clamp_tpl(fabs_tpl(current | desired), 0.f, 1.f)) * 2.f;
    const float maxStep = DEG2RAD(m_turnRate) * frameTime;
    const float t = angle > 0.0001f ? min(1.f, maxStep / angle) : 1.f;
    m_pEntity->SetRotation(Quat::CreateSlerp(current, desired, t));

    m_cooldown -= frameTime;
    CEnemyComponent* pEnemy = pTarget->GetComponent<CEnemyComponent>();
    if (pEnemy != nullptr && m_cooldown <= 0.f && angle < DEG2RAD(5.f))
    {
        pEnemy->ApplyDamage(m_damage, GetEntityId());
        m_cooldown = m_fireInterval;
    }
}

void CTurretComponent::AcquireTarget()
{
    const Vec3 origin = m_pEntity->GetWorldPos();
    float bestDistSq = m_range * m_range;
    m_targetId = INVALID_ENTITYID;

    for (CEnemyComponent* pEnemy : CEnemyComponent::GetActive())
    {
        const Vec3 pos = pEnemy->GetEntity()->GetWorldPos();
        const float distSq = origin.GetSquaredDistance(pos);
        if (distSq < bestDistSq && HasLineOfSight(origin, pos))
        {
            bestDistSq = distSq;
            m_targetId = pEnemy->GetEntityId();
        }
    }
}

bool CTurretComponent::HasLineOfSight(const Vec3& from, const Vec3& to) const
{
    ray_hit hit;
    return gEnv->pPhysicalWorld->RayWorldIntersection(from, to - from,
        ent_static | ent_terrain, rwi_stop_at_pierceable | rwi_colltype_any,
        &hit, 1, m_pSelfPhysics) == 0;
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "The turret spins faster when the editor is at 30 fps than at 120. I thought I was scaling by frameTime?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "You were scaling, but probably not linearly. A slerp with a fixed `t` like `frameTime * 5` is exponential smoothing: it covers a fraction of the remaining angle each frame, and that fraction doesn't compound the same way at different frame rates.\n\nThe new version fixes it by working in radians: `maxStep = DEG2RAD(m_turnRate) * frameTime`, then `t = maxStep / angle`. That gives a constant angular speed, so 30 fps and 120 fps reach the target at the same time. The `min(1.f, ...)` stops overshoot when the remaining angle is smaller than one step.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Is calling RayWorldIntersection for every enemy in AcquireTarget too expensive?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "It's bounded, but you can trim it:\n1. You already only retarget every 0.25 s via `kRetargetInterval`, which cuts the cost by roughly 15x at 60 fps.\n2. Raycasts only run for enemies that pass the cheaper squared-distance check first, which is the correct order.\n3. With dozens of turrets, sort candidates by distance and stop at the first one with line of sight instead of testing all of them.\n\nAlso, `ent_static | ent_terrain` means enemies can't block each other's sight line, which is usually what you want in tower defence.",
      delay: 36000,
    },
    {
      role: "user",
      content: "Will Reset fire when I exit game mode in the Sandbox editor?",
      delay: 49000,
    },
    {
      role: "assistant",
      content:
        "Yes. `EEvent::Reset` is sent when switching in and out of game mode in the editor, which is why clearing `m_targetId` and `m_cooldown` there matters; otherwise a turret could keep a stale `EntityId` from the previous run.\n\nOne more thing to check: `m_pSelfPhysics` is cached in `Initialize()`, but if the entity is physicalised later (for example, a mesh component added after this one) it will be null. Refresh it on `EEvent::PhysicalTypeChanged` or fetch it lazily in `HasLineOfSight`.",
      delay: 61000,
    },
  ],
};

export default config;
