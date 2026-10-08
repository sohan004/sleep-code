import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "echo",
  project: "helpdesk-api",
  branch: "feat/ticket-status-workflow",
  indent: "Tab Size: 4",
  files: [
    "go.mod",
    "cmd/helpdesk/main.go",
    "internal/platform/validator.go",
    "internal/ticket/handler.go",
    "internal/ticket/handler_test.go",
    "internal/ticket/repository.go",
    "db/migrations/0003_ticket_version.sql",
    "docker-compose.yml",
  ],
  snippets: [
    {
      filename: "internal/ticket/handler.go",
      syntax: "clike",
      languageLabel: "Go",
      code: `package ticket

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
)

const requestTimeout = 3 * time.Second

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) Register(g *echo.Group) {
	g.POST("/tickets", h.create)
	g.PATCH("/tickets/:id/status", h.updateStatus)
}

type createTicketRequest struct {
	Subject  string   \`json:"subject" validate:"required,max=140"\`
	Body     string   \`json:"body" validate:"required,max=8000"\`
	Priority Priority \`json:"priority" validate:"required,oneof=low normal high urgent"\`
}

type statusRequest struct {
	Status  Status \`json:"status" validate:"required,oneof=open pending resolved closed"\`
	Version int    \`json:"version" validate:"min=1"\`
}

func requesterID(c echo.Context) (string, error) {
	id, ok := c.Get("requesterID").(string)
	if !ok || id == "" {
		return "", echo.NewHTTPError(http.StatusUnauthorized)
	}
	return id, nil
}

func (h *Handler) create(c echo.Context) error {
	reqID, err := requesterID(c)
	if err != nil {
		return err
	}
	var req createTicketRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusUnprocessableEntity, err.Error())
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), requestTimeout)
	defer cancel()

	t, err := h.repo.Create(ctx, reqID, req.Subject, req.Body, req.Priority)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, t)
}

func (h *Handler) updateStatus(c echo.Context) error {
	if role, _ := c.Get("role").(string); role != "agent" {
		return echo.NewHTTPError(http.StatusForbidden, "only agents can change ticket status")
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid ticket id")
	}
	var req statusRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusUnprocessableEntity, err.Error())
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), requestTimeout)
	defer cancel()

	t, err := h.repo.UpdateStatus(ctx, id, req.Status, req.Version)
	switch {
	case errors.Is(err, ErrNotFound):
		return echo.NewHTTPError(http.StatusNotFound, "ticket not found")
	case errors.Is(err, ErrStale):
		return echo.NewHTTPError(http.StatusConflict, "ticket changed; reload and retry")
	case err != nil:
		return err
	}
	return c.JSON(http.StatusOK, t)
}
`,
    },
    {
      filename: "internal/ticket/repository.go",
      syntax: "clike",
      languageLabel: "Go",
      code: `package ticket

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type (
	Status   string
	Priority string
)

var (
	ErrNotFound = errors.New("ticket not found")
	ErrStale    = errors.New("ticket was modified concurrently")
)

type Ticket struct {
	ID          int64     \`json:"id"\`
	Subject     string    \`json:"subject"\`
	Status      Status    \`json:"status"\`
	Priority    Priority  \`json:"priority"\`
	RequesterID string    \`json:"-"\`
	Version     int       \`json:"version"\`
	CreatedAt   time.Time \`json:"createdAt"\`
}

const ticketColumns = "id, subject, status, priority, requester_id, version, created_at"

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

type scanner interface {
	Scan(dest ...any) error
}

func scanTicket(row scanner) (Ticket, error) {
	var t Ticket
	err := row.Scan(&t.ID, &t.Subject, &t.Status, &t.Priority,
		&t.RequesterID, &t.Version, &t.CreatedAt)
	return t, err
}

func (r *Repository) Create(
	ctx context.Context, requesterID, subject, body string, p Priority,
) (Ticket, error) {
	row := r.db.QueryRowContext(ctx,
		"INSERT INTO tickets (subject, body, priority, status, requester_id) "+
			"VALUES ($1, $2, $3, 'open', $4) RETURNING "+ticketColumns,
		subject, body, p, requesterID)
	return scanTicket(row)
}

// UpdateStatus applies an optimistic-concurrency update guarded by the version column.
func (r *Repository) UpdateStatus(
	ctx context.Context, id int64, s Status, version int,
) (Ticket, error) {
	row := r.db.QueryRowContext(ctx,
		"UPDATE tickets SET status = $1, version = version + 1, updated_at = now() "+
			"WHERE id = $2 AND version = $3 RETURNING "+ticketColumns,
		s, id, version)
	t, err := scanTicket(row)
	if !errors.Is(err, sql.ErrNoRows) {
		return t, err
	}

	// Zero rows: either the ticket doesn't exist or the version was stale
	var exists bool
	if err := r.db.QueryRowContext(ctx,
		"SELECT EXISTS (SELECT 1 FROM tickets WHERE id = $1)", id,
	).Scan(&exists); err != nil {
		return Ticket{}, fmt.Errorf("check ticket %d: %w", id, err)
	}
	if exists {
		return Ticket{}, ErrStale
	}
	return Ticket{}, ErrNotFound
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "`c.Validate` returns an error saying no validator is registered. What am I missing?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Echo doesn't ship a validator. `c.Validate` delegates to `e.Validator`, which is `nil` by default. That's what `internal/platform/validator.go` is for:\n\n```go\ntype Validator struct{ v *validator.Validate }\n\nfunc (cv *Validator) Validate(i any) error {\n    return cv.v.Struct(i)\n}\n```\n\nThen in `main.go`, set `e.Validator = &platform.Validator{v: validator.New()}` (or use a constructor, since `v` is unexported).\n\nOne more thing: `err.Error()` from go-playground/validator exposes Go field names like `createTicketRequest.Subject`. For a cleaner API, convert `validator.ValidationErrors` into a map of JSON field names using `RegisterTagNameFunc` and the `json` tag.",
      delay: 11000,
    },
    {
      role: "user",
      content:
        "In `UpdateStatus`, could the `EXISTS` check give the wrong answer under concurrency?",
      delay: 25000,
    },
    {
      role: "assistant",
      content:
        "It could in one edge case. If the ticket is deleted between the `UPDATE` and the `EXISTS`, you'd return `ErrNotFound` instead of `ErrStale`. Both are correct outcomes for the client, so it isn't a data-integrity problem. The update itself is safe because `WHERE version = $3` is evaluated atomically.\n\nIf you want one round trip and no window at all, use a CTE:\n\n```sql\nWITH u AS (UPDATE tickets SET ... WHERE id = $2 AND version = $3 RETURNING ...)\nSELECT ... FROM u\nUNION ALL\nSELECT ... FROM tickets WHERE id = $2 AND NOT EXISTS (SELECT 1 FROM u)\n```\n\nIn my view that's harder to read than the current version, which only adds a second query on the conflict path.",
      delay: 36000,
    },
    {
      role: "user",
      content: "Any security gaps in the handler?",
      delay: 50000,
    },
    {
      role: "assistant",
      content:
        "A few to consider:\n\n1. **Ticket scoping for agents.** `updateStatus` checks the role but not which queue or tenant the agent belongs to, so any agent can change any ticket ID. Pass the agent's team into `UpdateStatus` and add it to the `WHERE` clause.\n2. **Body size.** Add `middleware.BodyLimit(\"64K\")` to the group. The `max=8000` validation only runs after the whole body has been read.\n3. **Error leakage.** Returning a raw `err` gives a 500, and Echo's default error handler hides internal messages unless `e.Debug` is true. Make sure it's off in production.\n\nThe queries themselves are all parameterised, so injection isn't a concern here.",
      delay: 62000,
    },
  ],
};

export default config;
