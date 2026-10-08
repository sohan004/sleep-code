import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "spring-boot",
  project: "fleet-maintenance-api",
  branch: "feat/work-order-assignment",
  indent: "Spaces: 4",
  files: [
    "pom.xml",
    "src/main/resources/application.yml",
    "src/main/java/dev/harbourline/fleet/FleetMaintenanceApplication.java",
    "src/main/java/dev/harbourline/fleet/workorder/WorkOrder.java",
    "src/main/java/dev/harbourline/fleet/workorder/WorkOrderController.java",
    "src/main/java/dev/harbourline/fleet/workorder/WorkOrderRepository.java",
    "src/main/java/dev/harbourline/fleet/workorder/WorkOrderService.java",
    "src/main/java/dev/harbourline/fleet/workorder/dto/WorkOrderResponse.java",
    "src/test/java/dev/harbourline/fleet/workorder/WorkOrderServiceIT.java",
  ],
  snippets: [
    {
      filename: "src/main/java/dev/harbourline/fleet/workorder/WorkOrderController.java",
      syntax: "clike",
      languageLabel: "Java",
      code: `package dev.harbourline.fleet.workorder;

import dev.harbourline.fleet.workorder.dto.AssignTechnicianRequest;
import dev.harbourline.fleet.workorder.dto.CreateWorkOrderRequest;
import dev.harbourline.fleet.workorder.dto.WorkOrderResponse;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/work-orders")
public class WorkOrderController {

    private final WorkOrderService workOrderService;

    public WorkOrderController(WorkOrderService workOrderService) {
        this.workOrderService = workOrderService;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('SCOPE_workorders:read')")
    public Page<WorkOrderResponse> list(
            @RequestParam(required = false) WorkOrderStatus status,
            @PageableDefault(size = 25, sort = "createdAt") Pageable pageable) {
        return workOrderService.findAll(status, pageable).map(WorkOrderResponse::from);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('SCOPE_workorders:read')")
    public WorkOrderResponse get(@PathVariable UUID id) {
        return WorkOrderResponse.from(workOrderService.getById(id));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('SCOPE_workorders:write')")
    public ResponseEntity<WorkOrderResponse> create(
            @Valid @RequestBody CreateWorkOrderRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        WorkOrder created = workOrderService.create(request, jwt.getSubject());
        URI location = URI.create("/api/v1/work-orders/" + created.getId());
        return ResponseEntity.created(location).body(WorkOrderResponse.from(created));
    }

    @PatchMapping("/{id}/assignee")
    @PreAuthorize("hasAuthority('SCOPE_workorders:assign')")
    public WorkOrderResponse assign(
            @PathVariable UUID id,
            @Valid @RequestBody AssignTechnicianRequest request) {
        WorkOrder updated = workOrderService.assign(id, request.technicianId(), request.version());
        return WorkOrderResponse.from(updated);
    }

    @PostMapping("/{id}/complete")
    @PreAuthorize("hasAuthority('SCOPE_workorders:write')")
    public WorkOrderResponse complete(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return WorkOrderResponse.from(workOrderService.complete(id, jwt.getSubject()));
    }

    @ExceptionHandler(WorkOrderNotFoundException.class)
    public ProblemDetail handleNotFound(WorkOrderNotFoundException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.NOT_FOUND, ex.getMessage());
        problem.setTitle("Work order not found");
        return problem;
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ProblemDetail handleConflict(ObjectOptimisticLockingFailureException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.CONFLICT, "Work order was modified by another request; reload it");
        problem.setTitle("Concurrent modification");
        return problem;
    }
}
`,
    },
    {
      filename: "src/main/java/dev/harbourline/fleet/workorder/WorkOrderService.java",
      syntax: "clike",
      languageLabel: "Java",
      code: `package dev.harbourline.fleet.workorder;

import dev.harbourline.fleet.technician.Technician;
import dev.harbourline.fleet.technician.TechnicianRepository;
import dev.harbourline.fleet.vehicle.Vehicle;
import dev.harbourline.fleet.vehicle.VehicleRepository;
import dev.harbourline.fleet.workorder.dto.CreateWorkOrderRequest;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class WorkOrderService {

    private static final Logger log = LoggerFactory.getLogger(WorkOrderService.class);

    private final WorkOrderRepository workOrders;
    private final VehicleRepository vehicles;
    private final TechnicianRepository technicians;
    private final Clock clock;
    private final int maxOpenPerVehicle;

    public WorkOrderService(
            WorkOrderRepository workOrders,
            VehicleRepository vehicles,
            TechnicianRepository technicians,
            Clock clock,
            @Value("\${fleet.work-orders.max-open-per-vehicle:5}") int maxOpenPerVehicle) {
        this.workOrders = workOrders;
        this.vehicles = vehicles;
        this.technicians = technicians;
        this.clock = clock;
        this.maxOpenPerVehicle = maxOpenPerVehicle;
    }

    public Page<WorkOrder> findAll(WorkOrderStatus status, Pageable pageable) {
        // Both queries use @EntityGraph("vehicle") to avoid an N+1 on the response mapping
        return status == null
                ? workOrders.findAllWithVehicle(pageable)
                : workOrders.findByStatusWithVehicle(status, pageable);
    }

    public WorkOrder getById(UUID id) {
        return workOrders.findById(id).orElseThrow(() -> new WorkOrderNotFoundException(id));
    }

    @Transactional
    public WorkOrder create(CreateWorkOrderRequest request, String requestedBy) {
        Vehicle vehicle = vehicles.findById(request.vehicleId())
                .orElseThrow(() -> new IllegalArgumentException("Unknown vehicle"));
        long open = workOrders.countByVehicleIdAndStatusNot(
                vehicle.getId(), WorkOrderStatus.COMPLETED);
        if (open >= maxOpenPerVehicle) {
            throw new WorkOrderLimitExceededException(vehicle.getId(), maxOpenPerVehicle);
        }
        var order = new WorkOrder(vehicle, request.summary(), request.priority(), requestedBy);
        order.setCreatedAt(Instant.now(clock));
        return workOrders.save(order);
    }

    @Transactional
    public WorkOrder assign(UUID id, UUID technicianId, long expectedVersion) {
        WorkOrder order = getById(id);
        if (order.getVersion() != expectedVersion) {
            throw new ObjectOptimisticLockingFailureException(WorkOrder.class, id);
        }
        Technician technician = technicians.findById(technicianId)
                .filter(Technician::isActive)
                .orElseThrow(() -> new IllegalArgumentException("Technician unavailable"));
        order.assignTo(technician);
        log.info("Work order {} assigned to technician {}", id, technicianId);
        return order;
    }

    @Transactional
    public WorkOrder complete(UUID id, String completedBy) {
        WorkOrder order = getById(id);
        if (order.getStatus() == WorkOrderStatus.COMPLETED) {
            return order; // idempotent: repeated calls are a no-op
        }
        order.complete(completedBy, Instant.now(clock));
        return order;
    }
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "In `assign` I compare `expectedVersion` with `getVersion()` myself. Isn't `@Version` already doing optimistic locking for me?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "It is, but only against the version Hibernate loaded inside *this* transaction. Without your check, two clients who both read version 3 would each load the current row, and the second request could start after the first committed, so it would load version 4 and happily overwrite the assignment.\n\nThe explicit comparison turns the client's version into the precondition, which is what you want for a PATCH from a UI. `@Version` still covers the narrow window between your read and the flush: if another transaction commits in between, the `UPDATE ... WHERE version = ?` affects zero rows and Spring translates it to `ObjectOptimisticLockingFailureException`.\n\nBoth paths land in `handleConflict`, so the client gets a consistent **409**.",
      delay: 11000,
    },
    {
      role: "user",
      content:
        "The list endpoint was slow in staging. Is the `@EntityGraph` comment actually true for a paged query?",
      delay: 23000,
    },
    {
      role: "assistant",
      content:
        "For a `@ManyToOne` like `vehicle`, yes. The entity graph adds a join, so each page is one select plus Spring Data's count query, instead of 1 + 25 selects when `WorkOrderResponse.from` touches `getVehicle()`.\n\nThe trap is collections. If you later add `technicianNotes` (a `@OneToMany`) to the graph, Hibernate cannot apply `LIMIT` in SQL and logs `HHH90003004`, then paginates in memory. For that case:\n1. Page over IDs only.\n2. Load the entities with `findAllById` plus the graph.\n\nTo confirm the current behaviour, enable `spring.jpa.properties.hibernate.generate_statistics` in a test and assert the statement count.",
      delay: 34000,
    },
    {
      role: "user",
      content: "How should I test the conflict path without making the test flaky?",
      delay: 47000,
    },
    {
      role: "assistant",
      content:
        "Avoid threads. Make it deterministic:\n\n1. Use `@SpringBootTest` with Testcontainers PostgreSQL so the real `UPDATE ... WHERE version` runs.\n2. Create a work order and read its version.\n3. Call `assign` once with that version. It succeeds and bumps the version.\n4. Call it again with the **old** version and assert the exception.\n\n```java\nassertThatThrownBy(() -> service.assign(id, techB, v0))\n    .isInstanceOf(ObjectOptimisticLockingFailureException.class);\n```\n\nFor the controller, a `@WebMvcTest` with a mocked service that throws the same exception verifies the 409 `ProblemDetail` mapping. Add one test that uses a JWT without `SCOPE_workorders:assign` to cover authorisation.",
      delay: 58000,
    },
  ],
};

export default config;
