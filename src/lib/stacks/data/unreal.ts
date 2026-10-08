import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "unreal",
  project: "ember-vanguard",
  branch: "feature/replicated-health-regen",
  indent: "Spaces: 4",
  files: [
    "EmberVanguard.uproject",
    "Config/DefaultEngine.ini",
    "Source/EmberVanguard/EmberVanguard.Build.cs",
    "Source/EmberVanguard/Components/VanguardHealthComponent.h",
    "Source/EmberVanguard/Components/VanguardHealthComponent.cpp",
    "Source/EmberVanguard/Characters/VanguardCharacter.h",
    "Source/EmberVanguard/Characters/VanguardCharacter.cpp",
    "Source/EmberVanguard/Tests/HealthComponentSpec.cpp",
  ],
  snippets: [
    {
      filename: "Source/EmberVanguard/Components/VanguardHealthComponent.h",
      syntax: "clike",
      languageLabel: "C++",
      code: `// Replicated health with server-authoritative damage and delayed regeneration.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "VanguardHealthComponent.generated.h"

class AController;
class UDamageType;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(
    FOnHealthChanged, UVanguardHealthComponent*, HealthComponent, float, NewHealth, float, Delta);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnDeath, AController*, Killer);

UCLASS(ClassGroup = (Vanguard), meta = (BlueprintSpawnableComponent))
class EMBERVANGUARD_API UVanguardHealthComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UVanguardHealthComponent();

    virtual void GetLifetimeReplicatedProps(
        TArray<FLifetimeProperty>& OutLifetimeProps) const override;

    UFUNCTION(BlueprintPure, Category = "Health")
    float GetHealth() const { return Health; }

    UFUNCTION(BlueprintPure, Category = "Health")
    float GetHealthPercent() const { return MaxHealth > 0.f ? Health / MaxHealth : 0.f; }

    UFUNCTION(BlueprintPure, Category = "Health")
    bool IsDead() const { return bIsDead; }

    UFUNCTION(BlueprintCallable, BlueprintAuthorityOnly, Category = "Health")
    void Heal(float Amount);

    UPROPERTY(BlueprintAssignable, Category = "Health")
    FOnHealthChanged OnHealthChanged;

    UPROPERTY(BlueprintAssignable, Category = "Health")
    FOnDeath OnDeath;

protected:
    virtual void BeginPlay() override;

    UFUNCTION()
    void HandleTakeAnyDamage(AActor* DamagedActor, float Damage, const UDamageType* DamageType,
        AController* InstigatedBy, AActor* DamageCauser);

    UFUNCTION()
    void OnRep_Health(float OldHealth);

    UFUNCTION()
    void OnRep_IsDead();

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Health", meta = (ClampMin = "1.0"))
    float MaxHealth = 100.f;

    UPROPERTY(EditDefaultsOnly, Category = "Health|Regen", meta = (ClampMin = "0.0"))
    float RegenPerSecond = 8.f;

    UPROPERTY(EditDefaultsOnly, Category = "Health|Regen", meta = (ClampMin = "0.0"))
    float RegenDelay = 4.f;

    UPROPERTY(ReplicatedUsing = OnRep_Health, BlueprintReadOnly, Category = "Health")
    float Health = 100.f;

    UPROPERTY(ReplicatedUsing = OnRep_IsDead, BlueprintReadOnly, Category = "Health")
    bool bIsDead = false;

private:
    void SetHealth(float NewHealth);
    void TickRegen();

    static constexpr float RegenInterval = 0.25f;

    FTimerHandle RegenTimerHandle;
};`,
    },
    {
      filename: "Source/EmberVanguard/Components/VanguardHealthComponent.cpp",
      syntax: "clike",
      languageLabel: "C++",
      code: `#include "Components/VanguardHealthComponent.h"

#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "Net/UnrealNetwork.h"
#include "TimerManager.h"

UVanguardHealthComponent::UVanguardHealthComponent()
{
    PrimaryComponentTick.bCanEverTick = false;
    SetIsReplicatedByDefault(true);
}

void UVanguardHealthComponent::GetLifetimeReplicatedProps(
    TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);

    DOREPLIFETIME(UVanguardHealthComponent, Health);
    DOREPLIFETIME(UVanguardHealthComponent, bIsDead);
}

void UVanguardHealthComponent::BeginPlay()
{
    Super::BeginPlay();

    AActor* Owner = GetOwner();
    if (Owner && Owner->HasAuthority())
    {
        Health = MaxHealth;
        Owner->OnTakeAnyDamage.AddDynamic(this, &UVanguardHealthComponent::HandleTakeAnyDamage);
    }
}

void UVanguardHealthComponent::HandleTakeAnyDamage(AActor* DamagedActor, float Damage,
    const UDamageType* DamageType, AController* InstigatedBy, AActor* DamageCauser)
{
    if (Damage <= 0.f || bIsDead)
    {
        return;
    }

    SetHealth(Health - Damage);

    FTimerManager& Timers = GetWorld()->GetTimerManager();
    Timers.ClearTimer(RegenTimerHandle);

    if (Health <= 0.f)
    {
        bIsDead = true;
        OnDeath.Broadcast(InstigatedBy);
        return;
    }

    Timers.SetTimer(RegenTimerHandle, this, &UVanguardHealthComponent::TickRegen,
        RegenInterval, true, RegenDelay);
}

void UVanguardHealthComponent::Heal(float Amount)
{
    if (Amount > 0.f && !bIsDead && GetOwner()->HasAuthority())
    {
        SetHealth(Health + Amount);
    }
}

void UVanguardHealthComponent::TickRegen()
{
    SetHealth(Health + RegenPerSecond * RegenInterval);
    if (Health >= MaxHealth)
    {
        GetWorld()->GetTimerManager().ClearTimer(RegenTimerHandle);
    }
}

void UVanguardHealthComponent::SetHealth(float NewHealth)
{
    const float OldHealth = Health;
    Health = FMath::Clamp(NewHealth, 0.f, MaxHealth);

    // RepNotifies don't fire on the server, so broadcast here for listen-server hosts.
    if (!FMath::IsNearlyEqual(OldHealth, Health))
    {
        OnHealthChanged.Broadcast(this, Health, Health - OldHealth);
    }
}

void UVanguardHealthComponent::OnRep_Health(float OldHealth)
{
    OnHealthChanged.Broadcast(this, Health, Health - OldHealth);
}

void UVanguardHealthComponent::OnRep_IsDead()
{
    if (bIsDead)
    {
        OnDeath.Broadcast(nullptr);
    }
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "On the client the health bar updates, but on the listen-server host it never moves. Same component.",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "That's expected C++ behaviour: a `ReplicatedUsing` RepNotify only runs on machines that *receive* the property, and the server never receives its own writes. Blueprint RepNotifies are different and do fire on the server, which is why this catches people out.\n\nYour `SetHealth` helper is the right fix. Every authority-side change goes through it and broadcasts `OnHealthChanged` directly, while clients get the same broadcast from `OnRep_Health`. Make sure nothing writes `Health` directly outside `SetHealth`, otherwise the host's UI will drift again.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Why use a looping timer for regen instead of TickComponent?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "A few reasons:\n1. **Cost when idle**: with `bCanEverTick = false` the component costs nothing at full health. A tick would run every frame on every character.\n2. **Bandwidth**: regen at 0.25 s steps changes `Health` four times a second, so replication sends at most four updates instead of one per server frame.\n3. **Frame-rate independence**: the timer interval is fixed, and multiplying `RegenPerSecond` by `RegenInterval` gives the same total at any frame rate.\n\nThe trade-off is a slightly steppy bar on clients. Interpolate the displayed value in the widget rather than ticking the component faster.",
      delay: 35000,
    },
    {
      role: "user",
      content: "Is there a cheap way to test the death path without spinning up a PIE session?",
      delay: 48000,
    },
    {
      role: "assistant",
      content:
        "Use an Automation Spec with a transient world. In `HealthComponentSpec.cpp`, create a game world via `UWorld::CreateWorld(EWorldType::Game, false)`, spawn a plain `AActor`, add the component with `NewObject` and `RegisterComponent()`, then call `UGameplayStatics::ApplyDamage` for more than `MaxHealth`.\n\nBind a lambda to `OnDeath` through a small `UObject` helper (dynamic delegates need a `UFUNCTION`) and assert it fired once and that `IsDead()` is true. Remember to call `DestroyWorld(false)` in `AfterEach` so the timer manager doesn't outlive the test.",
      delay: 60000,
    },
  ],
};

export default config;
