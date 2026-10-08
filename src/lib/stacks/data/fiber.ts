import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "fiber",
  project: "short-link-service",
  branch: "feat/link-click-stats",
  indent: "Tab Size: 4",
  files: [
    "go.mod",
    "cmd/api/main.go",
    "internal/auth/middleware.go",
    "internal/links/handler.go",
    "internal/links/handler_test.go",
    "internal/links/store.go",
    "migrations/0002_link_clicks.sql",
    "Dockerfile",
  ],
  snippets: [
    {
      filename: "internal/links/handler.go",
      syntax: "clike",
      languageLabel: "Go",
      code: `package links

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

type Handler struct {
	store   *Store
	baseURL string
}

func NewHandler(store *Store, baseURL string) *Handler {
	return &Handler{store: store, baseURL: strings.TrimRight(baseURL, "/")}
}

// Routes registers the API. The auth middleware sets "userID" in Locals for /api.
func (h *Handler) Routes(app *fiber.App, requireAuth fiber.Handler) {
	api := app.Group("/api", requireAuth)
	api.Post("/links", h.create)
	api.Get("/links/:code/stats", h.stats)
	app.Get("/:code", h.redirect)
}

type createLinkRequest struct {
	Target    string \`json:"target"\`
	ExpiresIn int    \`json:"expiresInHours"\`
}

func (h *Handler) create(c *fiber.Ctx) error {
	owner, ok := c.Locals("userID").(string)
	if !ok || owner == "" {
		return fiber.ErrUnauthorized
	}

	var req createLinkRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid JSON body")
	}
	target, err := url.ParseRequestURI(req.Target)
	if err != nil || (target.Scheme != "https" && target.Scheme != "http") || target.Host == "" {
		return fiber.NewError(fiber.StatusUnprocessableEntity, "target must be an http(s) URL")
	}
	if req.ExpiresIn < 0 || req.ExpiresIn > 24*90 {
		return fiber.NewError(fiber.StatusUnprocessableEntity, "expiresInHours out of range")
	}

	ctx, cancel := context.WithTimeout(c.UserContext(), 2*time.Second)
	defer cancel()

	ttl := time.Duration(req.ExpiresIn) * time.Hour
	link, err := h.store.Create(ctx, owner, target.String(), ttl)
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"code":     link.Code,
		"shortUrl": h.baseURL + "/" + link.Code,
	})
}

func (h *Handler) redirect(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.UserContext(), 500*time.Millisecond)
	defer cancel()

	link, err := h.store.Resolve(ctx, c.Params("code"))
	if errors.Is(err, ErrNotFound) {
		return fiber.ErrNotFound
	}
	if err != nil {
		return err
	}
	c.Set(fiber.HeaderCacheControl, "no-store")
	return c.Redirect(link.Target, fiber.StatusFound)
}

func (h *Handler) stats(c *fiber.Ctx) error {
	owner, ok := c.Locals("userID").(string)
	if !ok || owner == "" {
		return fiber.ErrUnauthorized
	}
	ctx, cancel := context.WithTimeout(c.UserContext(), 2*time.Second)
	defer cancel()

	stats, err := h.store.Stats(ctx, c.Params("code"), owner)
	if errors.Is(err, ErrNotFound) {
		// Same response for "missing" and "not yours" so codes can't be probed
		return fiber.ErrNotFound
	}
	if err != nil {
		return err
	}
	return c.JSON(stats)
}
`,
    },
    {
      filename: "internal/links/store.go",
      syntax: "clike",
      languageLabel: "Go",
      code: `package links

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"time"
)

var ErrNotFound = errors.New("link not found")

type Link struct {
	Code      string
	Target    string
	ExpiresAt sql.NullTime
}

type Stats struct {
	Code      string     \`json:"code"\`
	Clicks    int64      \`json:"clicks"\`
	LastClick *time.Time \`json:"lastClick,omitempty"\`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

func newCode() (string, error) {
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func (s *Store) Create(
	ctx context.Context, owner, target string, ttl time.Duration,
) (*Link, error) {
	link := &Link{Target: target}
	if ttl > 0 {
		link.ExpiresAt = sql.NullTime{Time: time.Now().Add(ttl).UTC(), Valid: true}
	}
	for attempt := 0; attempt < 3; attempt++ {
		code, err := newCode()
		if err != nil {
			return nil, fmt.Errorf("generate code: %w", err)
		}
		res, err := s.db.ExecContext(ctx,
			"INSERT INTO links (code, target, owner_id, expires_at) VALUES ($1, $2, $3, $4) "+
				"ON CONFLICT (code) DO NOTHING",
			code, link.Target, owner, link.ExpiresAt)
		if err != nil {
			return nil, fmt.Errorf("insert link: %w", err)
		}
		if n, _ := res.RowsAffected(); n == 1 {
			link.Code = code
			return link, nil
		}
	}
	return nil, errors.New("could not allocate a unique code")
}

func (s *Store) Resolve(ctx context.Context, code string) (*Link, error) {
	link := &Link{Code: code}
	err := s.db.QueryRowContext(ctx,
		"UPDATE links SET clicks = clicks + 1, last_click_at = now() "+
			"WHERE code = $1 AND (expires_at IS NULL OR expires_at > now()) "+
			"RETURNING target, expires_at",
		code).Scan(&link.Target, &link.ExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("resolve link: %w", err)
	}
	return link, nil
}

func (s *Store) Stats(ctx context.Context, code, owner string) (*Stats, error) {
	st := &Stats{Code: code}
	var last sql.NullTime
	err := s.db.QueryRowContext(ctx,
		"SELECT clicks, last_click_at FROM links WHERE code = $1 AND owner_id = $2",
		code, owner).Scan(&st.Clicks, &last)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load stats: %w", err)
	}
	if last.Valid {
		st.LastClick = &last.Time
	}
	return st, nil
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "`Resolve` does an `UPDATE` on every redirect. Is that going to hurt when a link goes viral?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Yes, it will. Every click takes a row lock on the same `links` row, so concurrent redirects for one hot code queue behind each other, and each update writes a new row version that autovacuum has to clean up.\n\nA common fix is to separate the read from the counting:\n1. Make `Resolve` a plain `SELECT` with the same expiry predicate. You could also cache it briefly in memory.\n2. Send click events to a buffered channel. A background goroutine aggregates them per code and flushes with one `UPDATE ... SET clicks = clicks + $1` every second or so.\n\nThe trade-off is that up to a second of clicks can be lost on a crash, which is usually acceptable for stats.",
      delay: 11000,
    },
    {
      role: "user",
      content:
        "If I add that background goroutine, how do I shut it down cleanly with Fiber?",
      delay: 25000,
    },
    {
      role: "assistant",
      content:
        "Give the aggregator a `context.Context` and a `done` channel, and stop it **after** the server stops accepting requests:\n\n```go\n<-sigCtx.Done()\n_ = app.ShutdownWithTimeout(10 * time.Second)\ncancelAgg()   // aggregator stops reading\n<-aggDone      // final flush finished\n```\n\nInside the aggregator, on `ctx.Done()`, drain whatever is left in the channel and flush with a fresh `context.WithTimeout(context.Background(), 5*time.Second)`. The cancelled context would make that last `ExecContext` fail immediately.\n\nAlso, Fiber recycles `*fiber.Ctx`. Copy `c.Params(\"code\")` into a new string before sending it to the goroutine, or use `utils.CopyString`.",
      delay: 36000,
    },
    {
      role: "user",
      content: "Is the URL validation in `create` enough to stop abuse?",
      delay: 50000,
    },
    {
      role: "assistant",
      content:
        "It blocks the obvious problems: only `http`/`https` schemes, so no `javascript:` or `data:` URLs, and a host is required. It's not enough for a public shortener, though:\n\n1. **Rate-limit** creation per `userID` with Fiber's `limiter` middleware.\n2. Reject targets that point back to your own `baseURL` host, which would create redirect loops.\n3. Optionally check new hosts against a deny list or a safe-browsing service before you store them.\n4. Cap `len(req.Target)`, for example at 2048. `BodyParser` doesn't limit field lengths, only the overall body via `fiber.Config{BodyLimit: ...}`.\n\nThe owner check in `Stats` is good, and it doesn't reveal whether a code exists.",
      delay: 61000,
    },
  ],
};

export default config;
