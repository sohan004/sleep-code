import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "gin",
  project: "inventory-service",
  branch: "feat/stock-reservations",
  indent: "Tab Size: 4",
  files: [
    "go.mod",
    "cmd/server/main.go",
    "internal/config/config.go",
    "internal/handler/reservation_handler.go",
    "internal/handler/reservation_handler_test.go",
    "internal/service/reservation.go",
    "migrations/0004_reservations.sql",
    "Makefile",
  ],
  snippets: [
    {
      filename: "internal/handler/reservation_handler.go",
      syntax: "clike",
      languageLabel: "Go",
      code: `package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"inventory-service/internal/service"
)

type ReservationHandler struct {
	svc     *service.ReservationService
	timeout time.Duration
}

func NewReservationHandler(
	svc *service.ReservationService, timeout time.Duration,
) *ReservationHandler {
	return &ReservationHandler{svc: svc, timeout: timeout}
}

type createReservationRequest struct {
	SKU      string \`json:"sku" binding:"required,max=64"\`
	Quantity int    \`json:"quantity" binding:"required,min=1,max=500"\`
	OrderRef string \`json:"orderRef" binding:"required,uuid"\`
}

func (h *ReservationHandler) Register(r *gin.RouterGroup) {
	r.POST("/reservations", h.create)
	r.DELETE("/reservations/:id", h.release)
}

func (h *ReservationHandler) create(c *gin.Context) {
	var req createReservationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), h.timeout)
	defer cancel()

	res, err := h.svc.Reserve(ctx, req.SKU, req.Quantity, req.OrderRef)
	switch {
	case errors.Is(err, service.ErrInsufficientStock):
		c.JSON(http.StatusConflict, gin.H{"error": "insufficient stock"})
	case errors.Is(err, service.ErrUnknownSKU):
		c.JSON(http.StatusNotFound, gin.H{"error": "unknown sku"})
	case err != nil:
		_ = c.Error(err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
	default:
		c.JSON(http.StatusCreated, res)
	}
}

func parseID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return 0, false
	}
	return id, true
}

func (h *ReservationHandler) release(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), h.timeout)
	defer cancel()

	if err := h.svc.Release(ctx, id); errors.Is(err, service.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "reservation not found"})
		return
	} else if err != nil {
		_ = c.Error(err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.Status(http.StatusNoContent)
}
`,
    },
    {
      filename: "internal/service/reservation.go",
      syntax: "clike",
      languageLabel: "Go",
      code: `package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound          = errors.New("reservation not found")
	ErrUnknownSKU        = errors.New("unknown sku")
	ErrInsufficientStock = errors.New("insufficient stock")
)

type Reservation struct {
	ID        int64     \`json:"id"\`
	SKU       string    \`json:"sku"\`
	Quantity  int       \`json:"quantity"\`
	OrderRef  string    \`json:"orderRef"\`
	ExpiresAt time.Time \`json:"expiresAt"\`
}

type ReservationService struct {
	pool *pgxpool.Pool
	ttl  time.Duration
}

func NewReservationService(pool *pgxpool.Pool, ttl time.Duration) *ReservationService {
	return &ReservationService{pool: pool, ttl: ttl}
}

// Reserve holds stock for an order. The row lock on stock_levels serialises
// concurrent reservations for the same SKU so on-hand stock is never oversold.
func (s *ReservationService) Reserve(
	ctx context.Context, sku string, qty int, orderRef string,
) (*Reservation, error) {
	res := &Reservation{SKU: sku, Quantity: qty, OrderRef: orderRef}
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var available int
		err := tx.QueryRow(ctx,
			"SELECT on_hand - reserved FROM stock_levels WHERE sku = $1 FOR UPDATE", sku,
		).Scan(&available)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrUnknownSKU
		}
		if err != nil {
			return fmt.Errorf("lock stock level: %w", err)
		}
		if available < qty {
			return ErrInsufficientStock
		}

		if _, err := tx.Exec(ctx,
			"UPDATE stock_levels SET reserved = reserved + $1 WHERE sku = $2", qty, sku,
		); err != nil {
			return fmt.Errorf("update stock level: %w", err)
		}

		res.ExpiresAt = time.Now().Add(s.ttl).UTC()
		return tx.QueryRow(ctx,
			"INSERT INTO reservations (sku, quantity, order_ref, expires_at) "+
				"VALUES ($1, $2, $3, $4) RETURNING id",
			sku, qty, orderRef, res.ExpiresAt,
		).Scan(&res.ID)
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

func (s *ReservationService) Release(ctx context.Context, id int64) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var sku string
		var qty int
		err := tx.QueryRow(ctx,
			"DELETE FROM reservations WHERE id = $1 RETURNING sku, quantity", id,
		).Scan(&sku, &qty)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("delete reservation %d: %w", id, err)
		}
		_, err = tx.Exec(ctx,
			"UPDATE stock_levels SET reserved = reserved - $1 WHERE sku = $2", qty, sku)
		return err
	})
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Is `SELECT ... FOR UPDATE` actually needed in `Reserve`? The update is `reserved = reserved + $1` anyway.",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "The increment is atomic, but the **check** isn't. Without the lock, two requests can both read `available = 5`, both pass `available < qty` for a quantity of 4, and both increment, leaving `reserved` above `on_hand`.\n\n`FOR UPDATE` makes the second transaction wait at the `SELECT` until the first commits, so it reads the new value.\n\nAn alternative that avoids the explicit lock is a conditional update:\n\n```sql\nUPDATE stock_levels SET reserved = reserved + $1\nWHERE sku = $2 AND on_hand - reserved >= $1\n```\n\nIf `RowsAffected() == 0`, the stock was insufficient or the SKU doesn't exist. A `CHECK (reserved <= on_hand)` constraint is a good backstop either way.",
      delay: 11000,
    },
    {
      role: "user",
      content: "What happens if the client times out and retries the POST?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "Right now you'd get a second reservation for the same order, so stock gets double-held until the TTL expires.\n\nMake it idempotent on `orderRef`:\n1. Add `UNIQUE (order_ref, sku)` on `reservations`.\n2. Do the insert first, with `ON CONFLICT (order_ref, sku) DO NOTHING RETURNING id`.\n3. If no row comes back, it's a retry. Load the existing reservation and return it with **200** instead of touching `stock_levels` again.\n\nAlso note that `h.timeout` cancels the context. pgx then aborts the query and `BeginFunc` rolls back, so a timed-out request leaves no partial state. That's what makes retrying safe.",
      delay: 35000,
    },
    {
      role: "user",
      content: "How would you test the handler without a real database?",
      delay: 49000,
    },
    {
      role: "assistant",
      content:
        "Put a small interface in the handler package so the handler depends on behaviour, not on `*service.ReservationService`:\n\n```go\ntype reserver interface {\n    Reserve(ctx context.Context, sku string, qty int, ref string) (*service.Reservation, error)\n}\n```\n\nThen write table-driven tests with `httptest.NewRecorder()` and `gin.SetMode(gin.TestMode)`. Have a fake return `service.ErrInsufficientStock`, `ErrUnknownSKU` or a generic error, and assert 409, 404 and 500 respectively, and check the 500 body doesn't leak the error text.\n\nKeep the locking behaviour in an integration test with Testcontainers Postgres. Fire concurrent reservations with an `errgroup` and assert the total never exceeds `on_hand`.",
      delay: 60000,
    },
  ],
};

export default config;
