import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "quarkus",
  project: "greenhouse-telemetry",
  branch: "feat/batch-reading-ingest",
  indent: "Spaces: 4",
  files: [
    "pom.xml",
    "src/main/resources/application.properties",
    "src/main/java/dev/verdant/telemetry/sensor/Sensor.java",
    "src/main/java/dev/verdant/telemetry/sensor/SensorReading.java",
    "src/main/java/dev/verdant/telemetry/sensor/SensorResource.java",
    "src/main/java/dev/verdant/telemetry/sensor/SensorType.java",
    "src/main/java/dev/verdant/telemetry/error/IllegalArgumentMapper.java",
    "src/test/java/dev/verdant/telemetry/sensor/SensorResourceTest.java",
  ],
  snippets: [
    {
      filename: "src/main/java/dev/verdant/telemetry/sensor/SensorResource.java",
      syntax: "clike",
      languageLabel: "Java",
      code: `package dev.verdant.telemetry.sensor;

import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Sort;
import jakarta.annotation.security.RolesAllowed;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@Path("/api/sensors")
@RolesAllowed({"operator", "admin"})
public class SensorResource {

    @ConfigProperty(name = "telemetry.readings.max-batch", defaultValue = "500")
    int maxBatch;

    public record RegisterSensor(
            @NotBlank @Size(max = 32) String serial,
            @NotBlank @Size(max = 40) String zone,
            @NotNull SensorType type) {
    }

    public record ReadingIn(@NotNull Instant takenAt, double value) {}

    public record SensorView(Long id, String serial, String zone, SensorType type, boolean active) {
        static SensorView of(Sensor s) {
            return new SensorView(s.id, s.serial, s.zone, s.type, s.active);
        }
    }

    @GET
    public List<SensorView> list(
            @QueryParam("zone") String zone,
            @QueryParam("page") @DefaultValue("0") @Min(0) int page,
            @QueryParam("size") @DefaultValue("50") @Min(1) @Max(200) int size) {
        PanacheQuery<Sensor> query = zone == null
                ? Sensor.find("active", Sort.by("serial"), true)
                : Sensor.find("zone = ?1 and active = true", Sort.by("serial"), zone);
        return query.page(Page.of(page, size)).list().stream().map(SensorView::of).toList();
    }

    @POST
    @Transactional
    public Response register(@Valid RegisterSensor request) {
        if (Sensor.findBySerial(request.serial()).isPresent()) {
            throw new WebApplicationException(
                    "Serial already registered", Response.Status.CONFLICT);
        }
        Sensor sensor = Sensor.register(request.serial(), request.zone(), request.type());
        return Response.created(URI.create("/api/sensors/" + sensor.serial))
                .entity(SensorView.of(sensor))
                .build();
    }

    @POST
    @Path("/{serial}/readings")
    @Transactional
    public Response ingest(@PathParam("serial") String serial, List<@Valid ReadingIn> readings) {
        if (readings == null || readings.isEmpty() || readings.size() > maxBatch) {
            throw new BadRequestException("Batch must contain 1.." + maxBatch + " readings");
        }
        Sensor sensor = Sensor.findBySerial(serial)
                .filter(s -> s.active)
                .orElseThrow(() -> new NotFoundException("Unknown or inactive sensor"));
        readings.forEach(r -> sensor.record(r.takenAt(), r.value()));
        return Response.accepted().build();
    }

    @DELETE
    @Path("/{serial}")
    @RolesAllowed("admin")
    @Transactional
    public void decommission(@PathParam("serial") String serial) {
        int updated = Sensor.update("active = false where serial = ?1", serial);
        if (updated == 0) {
            throw new NotFoundException("Unknown sensor");
        }
    }
}
`,
    },
    {
      filename: "src/main/java/dev/verdant/telemetry/sensor/Sensor.java",
      syntax: "clike",
      languageLabel: "Java",
      code: `package dev.verdant.telemetry.sensor;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Entity
@Table(name = "sensor", indexes = @Index(name = "ix_sensor_zone", columnList = "zone, active"))
public class Sensor extends PanacheEntity {

    @Column(nullable = false, unique = true, length = 32)
    public String serial;

    @Column(nullable = false, length = 40)
    public String zone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    public SensorType type;

    public boolean active = true;

    public Instant lastReadingAt;

    public Double lastValue;

    @Version
    public long version;

    public static Optional<Sensor> findBySerial(String serial) {
        return find("serial", serial.trim()).firstResultOptional();
    }

    public static List<Sensor> findStale(Duration silence) {
        Instant threshold = Instant.now().minus(silence);
        return list("active = true and (lastReadingAt is null or lastReadingAt < ?1)", threshold);
    }

    public static long countActiveInZone(String zone) {
        return count("zone = ?1 and active = true", zone);
    }

    public static Sensor register(String serial, String zone, SensorType type) {
        Sensor sensor = new Sensor();
        sensor.serial = serial.trim();
        sensor.zone = zone;
        sensor.type = type;
        sensor.persist();
        return sensor;
    }

    public void record(Instant takenAt, double value) {
        if (!type.accepts(value)) {
            throw new IllegalArgumentException("Reading out of range for " + type);
        }
        if (takenAt.isAfter(Instant.now().plusSeconds(60))) {
            throw new IllegalArgumentException("Reading timestamp is in the future");
        }
        SensorReading reading = new SensorReading();
        reading.sensor = this;
        reading.takenAt = takenAt;
        reading.value = value;
        reading.persist();

        // Readings can arrive out of order; only move the "latest" pointer forwards
        if (lastReadingAt == null || takenAt.isAfter(lastReadingAt)) {
            lastReadingAt = takenAt;
            lastValue = value;
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
        "Two gateways can post readings for the same sensor at the same time. What happens with the `@Version` on `Sensor`?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Both transactions load version N, insert their readings, and update `lastReadingAt`. The first commit wins. The second flush runs `UPDATE sensor ... WHERE version = N`, matches zero rows and throws `OptimisticLockException`, which rolls back that **whole** batch, readings included.\n\nYou have a few options:\n1. Retry on conflict. In Quarkus 3 you can wrap the work in `QuarkusTransaction.requiringNew().call(...)` inside a small retry loop.\n2. Drop `@Version` and update the pointer with a guarded statement: `update Sensor set lastReadingAt = ?1, lastValue = ?2 where id = ?3 and (lastReadingAt is null or lastReadingAt < ?1)`. Its outcome doesn't depend on commit order.\n\nOption 2 suits this field, because the latest timestamp should win regardless of which batch commits first.",
      delay: 11000,
    },
    {
      role: "user",
      content: "Is `readings.forEach(r -> sensor.record(...))` going to be slow for 500 rows?",
      delay: 25000,
    },
    {
      role: "assistant",
      content:
        "`persist()` doesn't run SQL straight away. The inserts are queued and flushed at commit. The thing to check is whether they're batched. Set:\n\n```properties\nquarkus.hibernate-orm.jdbc.statement-batch-size=50\n```\n\n`PanacheEntity` uses a sequence with a pooled optimiser, so IDs are allocated in blocks and JDBC batching still works. If you switch `SensorReading` to `IDENTITY`, batching stops working and you're back to 500 round trips.\n\nAlso keep an eye on memory. With much larger batches, call `flush()` and `getEntityManager().clear()` every few hundred rows. `maxBatch` caps that today, so it's fine.",
      delay: 36000,
    },
    {
      role: "user",
      content: "And the `IllegalArgumentException` from `record` — what does the client see?",
      delay: 50000,
    },
    {
      role: "assistant",
      content:
        "Without a mapper, a **500**, and the transaction rolls back because it's a runtime exception. A 500 is the wrong signal, since the client sent bad data.\n\nThat's what `IllegalArgumentMapper` in the file tree is for. With Quarkus REST you can write:\n\n```java\n@ServerExceptionMapper\npublic RestResponse<String> map(IllegalArgumentException e) {\n    return RestResponse.status(Response.Status.BAD_REQUEST, e.getMessage());\n}\n```\n\nCheck the messages are safe to show. These ones are, because they only include the sensor type. In `SensorResourceTest`, use `@TestSecurity(user = \"op\", roles = \"operator\")` with REST Assured to post an out-of-range reading and assert a 400 with no rows persisted.",
      delay: 62000,
    },
  ],
};

export default config;
