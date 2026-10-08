import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "hibernate",
  project: "equipment-hire-core",
  branch: "fix/booking-overlap-race",
  indent: "Spaces: 4",
  files: [
    "pom.xml",
    "src/main/resources/hibernate.properties",
    "src/main/java/dev/toolshed/hire/domain/BookingStatus.java",
    "src/main/java/dev/toolshed/hire/domain/HireItem.java",
    "src/main/java/dev/toolshed/hire/domain/RentalBooking.java",
    "src/main/java/dev/toolshed/hire/persistence/BookingRejectedException.java",
    "src/main/java/dev/toolshed/hire/persistence/RentalBookingRepository.java",
    "src/main/java/dev/toolshed/hire/persistence/SessionFactoryProducer.java",
    "src/test/java/dev/toolshed/hire/persistence/RentalBookingRepositoryTest.java",
  ],
  snippets: [
    {
      filename: "src/main/java/dev/toolshed/hire/domain/RentalBooking.java",
      syntax: "clike",
      languageLabel: "Java",
      code: `package dev.toolshed.hire.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import org.hibernate.annotations.NaturalId;

@Entity
@Table(name = "rental_booking")
public class RentalBooking {

    @Id
    @GeneratedValue
    private Long id;

    @NaturalId
    @Column(name = "booking_ref", nullable = false, updatable = false, length = 16)
    private String bookingRef;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id")
    private HireItem item;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BookingStatus status = BookingStatus.PENDING;

    @Column(name = "daily_rate", nullable = false, precision = 10, scale = 2)
    private BigDecimal dailyRate;

    @Version
    private int version;

    protected RentalBooking() {
        // required by Hibernate
    }

    public RentalBooking(String bookingRef, HireItem item, LocalDate startDate, LocalDate endDate) {
        if (endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("End date must not precede start date");
        }
        this.bookingRef = Objects.requireNonNull(bookingRef);
        this.item = Objects.requireNonNull(item);
        this.startDate = startDate;
        this.endDate = endDate;
        // Snapshot the rate so later price changes don't alter existing bookings
        this.dailyRate = item.getDailyRate();
    }

    public BigDecimal totalCost() {
        long days = ChronoUnit.DAYS.between(startDate, endDate) + 1;
        return dailyRate.multiply(BigDecimal.valueOf(days));
    }

    public void confirm() {
        if (status != BookingStatus.PENDING) {
            throw new IllegalStateException("Only pending bookings can be confirmed");
        }
        status = BookingStatus.CONFIRMED;
    }

    public Long getId() { return id; }
    public String getBookingRef() { return bookingRef; }
    public HireItem getItem() { return item; }
    public LocalDate getStartDate() { return startDate; }
    public LocalDate getEndDate() { return endDate; }
    public BookingStatus getStatus() { return status; }

    @Override
    public boolean equals(Object o) {
        return this == o
                || (o instanceof RentalBooking other && bookingRef.equals(other.bookingRef));
    }

    @Override
    public int hashCode() {
        return bookingRef.hashCode();
    }
}
`,
    },
    {
      filename: "src/main/java/dev/toolshed/hire/persistence/RentalBookingRepository.java",
      syntax: "clike",
      languageLabel: "Java",
      code: `package dev.toolshed.hire.persistence;

import dev.toolshed.hire.domain.BookingStatus;
import dev.toolshed.hire.domain.HireItem;
import dev.toolshed.hire.domain.RentalBooking;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class RentalBookingRepository {

    private static final Logger log = LoggerFactory.getLogger(RentalBookingRepository.class);

    private final SessionFactory sessionFactory;

    public RentalBookingRepository(SessionFactory sessionFactory) {
        this.sessionFactory = sessionFactory;
    }

    public Optional<RentalBooking> findByRef(String bookingRef) {
        return sessionFactory.fromTransaction(session ->
                session.bySimpleNaturalId(RentalBooking.class).loadOptional(bookingRef));
    }

    public List<RentalBooking> findUpcoming(LocalDate from, int limit) {
        return sessionFactory.fromTransaction(session -> session.createSelectionQuery(
                        "from RentalBooking b join fetch b.item "
                                + "where b.startDate >= :from and b.status = :status "
                                + "order by b.startDate", RentalBooking.class)
                .setParameter("from", from)
                .setParameter("status", BookingStatus.CONFIRMED)
                .setMaxResults(limit)
                .getResultList());
    }

    public RentalBooking book(long itemId, String ref, LocalDate start, LocalDate end) {
        return sessionFactory.fromTransaction(session -> {
            // Pessimistic lock on the item serialises concurrent bookings for it
            HireItem item = session.find(HireItem.class, itemId, LockModeType.PESSIMISTIC_WRITE);
            if (item == null || !item.isAvailableForHire()) {
                throw new BookingRejectedException("Item " + itemId + " is not available");
            }
            if (hasOverlap(session, itemId, start, end)) {
                throw new BookingRejectedException("Item already booked for those dates");
            }
            RentalBooking booking = new RentalBooking(ref, item, start, end);
            session.persist(booking);
            log.debug("Created booking {} for item {}", ref, itemId);
            return booking;
        });
    }

    private boolean hasOverlap(Session session, long itemId, LocalDate start, LocalDate end) {
        Long clashes = session.createSelectionQuery(
                        "select count(b) from RentalBooking b where b.item.id = :itemId "
                                + "and b.status <> :cancelled "
                                + "and b.startDate <= :end and b.endDate >= :start", Long.class)
                .setParameter("itemId", itemId)
                .setParameter("cancelled", BookingStatus.CANCELLED)
                .setParameter("start", start)
                .setParameter("end", end)
                .getSingleResult();
        return clashes > 0;
    }

    public void confirm(String ref) {
        sessionFactory.inTransaction(session -> session
                .bySimpleNaturalId(RentalBooking.class)
                .loadOptional(ref)
                .orElseThrow(() -> new BookingRejectedException("Unknown booking " + ref))
                .confirm());
    }

    public int cancelStalePending(LocalDate cutoff) {
        // Bulk HQL bypasses the persistence context; "update versioned" bumps @Version
        return sessionFactory.fromTransaction(session -> session.createMutationQuery(
                        "update versioned RentalBooking set status = :cancelled "
                                + "where status = :pending and startDate < :cutoff")
                .setParameter("cancelled", BookingStatus.CANCELLED)
                .setParameter("pending", BookingStatus.PENDING)
                .setParameter("cutoff", cutoff)
                .executeUpdate());
    }
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Why lock the `HireItem` row in `book` instead of just relying on `@Version` on `RentalBooking`?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Because the conflict isn't on an existing booking row. Two requests for the same item and overlapping dates each run `hasOverlap`, both see zero clashes, and both insert a **new** `RentalBooking`. No existing row is updated, so `@Version` never gets a chance to fail.\n\n`PESSIMISTIC_WRITE` on the item issues `SELECT ... FOR UPDATE`, so the second transaction blocks until the first commits. When it continues, its overlap query sees the committed booking and rejects the request.\n\nThe cost is that bookings for one item are serialised, which is fine at this volume. If you're on PostgreSQL, an exclusion constraint on `daterange(start_date, end_date, '[]')` would give you a database-level guarantee as well.",
      delay: 11000,
    },
    {
      role: "user",
      content:
        "`findUpcoming` returns entities after the session is closed. Will callers hit `LazyInitializationException`?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "Not for `item`, because `join fetch b.item` initialises it in the same query. That also avoids an N+1 when the caller renders item names.\n\nAnything else that's lazy will throw once `fromTransaction` returns. If `HireItem` has a lazy `category`, for example, reading it outside the session fails.\n\nOptions, in order of preference:\n1. Return a projection record with `select new BookingSummary(b.bookingRef, i.name, b.startDate) ...`, so callers never get managed entities.\n2. Add the extra associations to the fetch, or use an entity graph.\n3. Keep the session open for the request. It works, but it hides query costs, so I'd avoid it.",
      delay: 35000,
    },
    {
      role: "user",
      content: "Is `update versioned` really needed in `cancelStalePending`?",
      delay: 49000,
    },
    {
      role: "assistant",
      content:
        "It's worth keeping. A bulk HQL `update` goes straight to SQL and skips the persistence context, so by default the `version` column isn't touched. Suppose a client loaded a pending booking before the cleanup job ran. Its later `confirm()` flush would still match the old version and overwrite `CANCELLED` with `CONFIRMED` without any error.\n\nWith `update versioned`, Hibernate increments the version in the same statement, so that stale flush gets an `OptimisticLockException` instead.\n\nIn a test, load a booking in one session, run `cancelStalePending` in another, then call `confirm` and flush the first session. You should see the exception.",
      delay: 60000,
    },
  ],
};

export default config;
