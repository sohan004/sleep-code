import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "aspnet-core",
  project: "parcel-tracking-api",
  branch: "feat/tracking-events-endpoint",
  indent: "Spaces: 4",
  files: [
    "ParcelTracking.Api/Program.cs",
    "ParcelTracking.Api/appsettings.json",
    "ParcelTracking.Api/Contracts/ShipmentContracts.cs",
    "ParcelTracking.Api/Endpoints/ShipmentEndpoints.cs",
    "ParcelTracking.Api/Services/ShipmentService.cs",
    "ParcelTracking.Domain/Shipment.cs",
    "ParcelTracking.Infrastructure/TrackingDbContext.cs",
    "ParcelTracking.Tests/ShipmentEndpointsTests.cs",
  ],
  snippets: [
    {
      filename: "ParcelTracking.Api/Endpoints/ShipmentEndpoints.cs",
      syntax: "clike",
      languageLabel: "C#",
      code: `using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using ParcelTracking.Api.Contracts;
using ParcelTracking.Api.Services;

namespace ParcelTracking.Api.Endpoints;

public static class ShipmentEndpoints
{
    public static RouteGroupBuilder MapShipmentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/shipments")
            .WithTags("Shipments")
            .RequireAuthorization("shipments:read");

        group.MapGet("/", ListAsync);
        group.MapGet("/{trackingCode}", GetAsync).WithName("GetShipment");
        group.MapPost("/", CreateAsync).RequireAuthorization("shipments:write");
        group.MapPost("/{trackingCode}/events", AddEventAsync)
            .RequireAuthorization("shipments:write");

        return group;
    }

    private static async Task<Ok<PagedResult<ShipmentSummary>>> ListAsync(
        [AsParameters] ShipmentQuery query,
        IShipmentService shipments,
        CancellationToken ct)
    {
        var page = await shipments.ListAsync(query, ct);
        return TypedResults.Ok(page);
    }

    private static async Task<Results<Ok<ShipmentDetail>, NotFound>> GetAsync(
        string trackingCode,
        IShipmentService shipments,
        CancellationToken ct)
    {
        var shipment = await shipments.FindAsync(trackingCode, ct);
        return shipment is null ? TypedResults.NotFound() : TypedResults.Ok(shipment);
    }

    private static async Task<Results<CreatedAtRoute<ShipmentDetail>, ValidationProblem,
        ForbidHttpResult>> CreateAsync(
        CreateShipmentRequest request,
        IShipmentService shipments,
        ClaimsPrincipal user,
        CancellationToken ct)
    {
        var errors = request.Validate();
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var accountId = user.FindFirstValue("account_id");
        if (string.IsNullOrEmpty(accountId))
        {
            return TypedResults.Forbid();
        }

        var created = await shipments.CreateAsync(request, accountId, ct);
        return TypedResults.CreatedAtRoute(
            created, "GetShipment", new { trackingCode = created.TrackingCode });
    }

    private static async Task<Results<NoContent, NotFound, Conflict<ProblemDetails>>> AddEventAsync(
        string trackingCode,
        TrackingEventRequest request,
        IShipmentService shipments,
        CancellationToken ct)
    {
        var outcome = await shipments.AddEventAsync(trackingCode, request, ct);
        return outcome switch
        {
            AddEventOutcome.Added => TypedResults.NoContent(),
            AddEventOutcome.NotFound => TypedResults.NotFound(),
            _ => TypedResults.Conflict(new ProblemDetails
            {
                Title = "Shipment was updated concurrently",
                Detail = "Reload the shipment and retry the event.",
            }),
        };
    }
}
`,
    },
    {
      filename: "ParcelTracking.Api/Services/ShipmentService.cs",
      syntax: "clike",
      languageLabel: "C#",
      code: `using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ParcelTracking.Api.Contracts;
using ParcelTracking.Domain;
using ParcelTracking.Infrastructure;

namespace ParcelTracking.Api.Services;

public enum AddEventOutcome { Added, NotFound, Conflict }

public sealed class ShipmentService(
    TrackingDbContext db,
    TimeProvider clock,
    IOptions<TrackingOptions> options,
    ILogger<ShipmentService> logger) : IShipmentService
{
    public async Task<PagedResult<ShipmentSummary>> ListAsync(
        ShipmentQuery query, CancellationToken ct)
    {
        var pageSize = Math.Clamp(query.PageSize ?? 25, 1, options.Value.MaxPageSize);
        var page = Math.Max(query.Page ?? 1, 1);

        var shipments = db.Shipments.AsNoTracking();
        if (query.Status is { } status)
        {
            shipments = shipments.Where(s => s.Status == status);
        }

        var total = await shipments.CountAsync(ct);
        var items = await shipments
            .OrderByDescending(s => s.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new ShipmentSummary(
                s.TrackingCode,
                s.Status,
                s.DestinationPostcode,
                s.Events.Count,
                s.CreatedAt))
            .ToListAsync(ct);

        return new PagedResult<ShipmentSummary>(items, page, pageSize, total);
    }

    public async Task<ShipmentDetail?> FindAsync(string trackingCode, CancellationToken ct)
    {
        var shipment = await db.Shipments
            .AsNoTracking()
            .Include(s => s.Events.OrderBy(e => e.OccurredAt))
            .SingleOrDefaultAsync(s => s.TrackingCode == trackingCode, ct);

        return shipment is null ? null : ShipmentDetail.From(shipment);
    }

    public async Task<ShipmentDetail> CreateAsync(
        CreateShipmentRequest request, string accountId, CancellationToken ct)
    {
        var shipment = Shipment.Create(
            accountId, request.DestinationPostcode, request.WeightGrams, clock.GetUtcNow());

        db.Shipments.Add(shipment);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Created shipment {TrackingCode}", shipment.TrackingCode);
        return ShipmentDetail.From(shipment);
    }

    public async Task<AddEventOutcome> AddEventAsync(
        string trackingCode, TrackingEventRequest request, CancellationToken ct)
    {
        var shipment = await db.Shipments
            .SingleOrDefaultAsync(s => s.TrackingCode == trackingCode, ct);
        if (shipment is null)
        {
            return AddEventOutcome.NotFound;
        }

        // Status transition rules live on the aggregate; Version is a concurrency token
        shipment.RecordEvent(request.Kind, request.Location, clock.GetUtcNow());
        try
        {
            await db.SaveChangesAsync(ct);
            return AddEventOutcome.Added;
        }
        catch (DbUpdateConcurrencyException ex)
        {
            logger.LogWarning(ex, "Concurrency conflict on shipment {TrackingCode}", trackingCode);
            return AddEventOutcome.Conflict;
        }
    }
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "The `ListAsync` query projects `s.Events.Count`. Does that load every event for every shipment?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "No. Because it's inside `Select`, EF Core translates it to a correlated `SELECT COUNT(*) FROM TrackingEvents WHERE ShipmentId = s.Id` subquery. No event entities are materialised, and `AsNoTracking` is redundant for a pure projection but harmless.\n\nTwo things to check in the generated SQL (`ToQueryString()` is handy):\n1. There's an index on `TrackingEvents(ShipmentId)`. Otherwise each row's subquery scans the table.\n2. `CountAsync` and the page query are two round trips. That's fine at this size. If the count gets expensive, consider keyset pagination on `CreatedAt` plus `Id` and drop the total.",
      delay: 11000,
    },
    {
      role: "user",
      content:
        "In `AddEventAsync` I removed the `Include(s => s.Events)`. Will `RecordEvent` still work if it adds to the collection?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "Yes, as long as `RecordEvent` only **appends** to `Events` and doesn't read it. EF Core tracks the new `TrackingEvent` added to the navigation and inserts it on `SaveChangesAsync`, even though the collection wasn't loaded. That saves pulling the full event history on every scan.\n\nWatch out for rules that inspect existing events, such as \"no `Delivered` after `Returned`\". With an unloaded collection those checks see an empty list and pass silently. Keep the current `Status` on the shipment itself and validate transitions against that, which also makes the shipment's `Version` row-version token bump on every event.",
      delay: 36000,
    },
    {
      role: "user",
      content: "How do I integration-test the 409 path?",
      delay: 50000,
    },
    {
      role: "assistant",
      content:
        "Use `WebApplicationFactory<Program>` with a Testcontainers SQL Server or PostgreSQL instance. The in-memory provider doesn't enforce concurrency tokens the same way, so it won't reproduce this.\n\n1. Seed a shipment.\n2. Open two `DbContext` scopes and load it in both.\n3. Record an event and save in the first.\n4. Call the service with the second context and assert `AddEventOutcome.Conflict`.\n\nAt the HTTP level, replace auth with a test scheme that issues an `account_id` claim and the `shipments:write` policy. Also add a test without the claim to check `CreateAsync` returns **403**, not 500.",
      delay: 61000,
    },
  ],
};

export default config;
