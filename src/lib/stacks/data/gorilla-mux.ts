import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "gorilla-mux",
  project: "toggle-service",
  branch: "feat/percentage-rollouts",
  indent: "Tab Size: 4",
  files: [
    "go.mod",
    "cmd/toggled/main.go",
    "internal/api/flags.go",
    "internal/api/flags_test.go",
    "internal/auth/admin.go",
    "internal/store/flag_store.go",
    "internal/store/flag_store_test.go",
    "migrations/0001_flags.sql",
  ],
  snippets: [
    {
      filename: "internal/api/flags.go",
      syntax: "clike",
      languageLabel: "Go",
      code: `package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"time"

	"github.com/gorilla/mux"

	"toggle-service/internal/store"
)

var keyPattern = regexp.MustCompile("^[a-z0-9][a-z0-9-]{1,62}$")

type FlagAPI struct {
	store  *store.FlagStore
	logger *slog.Logger
}

func NewRouter(
	fs *store.FlagStore, logger *slog.Logger, adminOnly mux.MiddlewareFunc,
) *mux.Router {
	api := &FlagAPI{store: fs, logger: logger}
	r := mux.NewRouter()
	// TimeoutHandler cancels the request context, which aborts in-flight queries
	r.Use(func(next http.Handler) http.Handler {
		return http.TimeoutHandler(next, 3*time.Second, "request timed out")
	})

	v1 := r.PathPrefix("/v1").Subrouter()
	v1.HandleFunc("/flags/{key}", api.getFlag).Methods(http.MethodGet)

	admin := v1.PathPrefix("/admin").Subrouter()
	admin.Use(adminOnly)
	admin.HandleFunc("/flags/{key}", api.putFlag).Methods(http.MethodPut)
	return r
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (a *FlagAPI) getFlag(w http.ResponseWriter, r *http.Request) {
	key := mux.Vars(r)["key"]
	if !keyPattern.MatchString(key) {
		writeError(w, http.StatusBadRequest, "invalid flag key")
		return
	}
	flag, err := a.store.Get(r.Context(), key)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "flag not found")
		return
	}
	if err != nil {
		a.logger.ErrorContext(r.Context(), "load flag", "key", key, "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, flag)
}

type putFlagRequest struct {
	Description string \`json:"description"\`
	Enabled     bool   \`json:"enabled"\`
	RolloutPct  int    \`json:"rolloutPercent"\`
}

func (a *FlagAPI) putFlag(w http.ResponseWriter, r *http.Request) {
	key := mux.Vars(r)["key"]
	var req putFlagRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil || !keyPattern.MatchString(key) {
		writeError(w, http.StatusBadRequest, "invalid key or request body")
		return
	}
	if req.RolloutPct < 0 || req.RolloutPct > 100 {
		writeError(w, http.StatusUnprocessableEntity, "rolloutPercent must be 0-100")
		return
	}

	flag, err := a.store.Upsert(r.Context(), key, req.Description, req.Enabled, req.RolloutPct)
	if err != nil {
		a.logger.ErrorContext(r.Context(), "upsert flag", "key", key, "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, flag)
}
`,
    },
    {
      filename: "internal/store/flag_store.go",
      syntax: "clike",
      languageLabel: "Go",
      code: `package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"hash/fnv"
	"sync"
	"time"
)

var ErrNotFound = errors.New("flag not found")

type Flag struct {
	Key            string    \`json:"key"\`
	Description    string    \`json:"description"\`
	Enabled        bool      \`json:"enabled"\`
	RolloutPercent int       \`json:"rolloutPercent"\`
	UpdatedAt      time.Time \`json:"updatedAt"\`
}

// EnabledFor buckets a subject into 0..99 deterministically, so the same
// subject keeps the same result as the rollout percentage grows.
func (f Flag) EnabledFor(subject string) bool {
	if !f.Enabled {
		return false
	}
	h := fnv.New32a()
	_, _ = h.Write([]byte(f.Key + ":" + subject))
	return int(h.Sum32()%100) < f.RolloutPercent
}

type cacheEntry struct {
	flag    Flag
	expires time.Time
}

type FlagStore struct {
	db  *sql.DB
	ttl time.Duration

	mu    sync.RWMutex
	cache map[string]cacheEntry
}

func NewFlagStore(db *sql.DB, ttl time.Duration) *FlagStore {
	return &FlagStore{db: db, ttl: ttl, cache: make(map[string]cacheEntry)}
}

func (s *FlagStore) Get(ctx context.Context, key string) (Flag, error) {
	s.mu.RLock()
	entry, ok := s.cache[key]
	s.mu.RUnlock()
	if ok && time.Now().Before(entry.expires) {
		return entry.flag, nil
	}

	var f Flag
	err := s.db.QueryRowContext(ctx,
		"SELECT key, description, enabled, rollout_percent, updated_at "+
			"FROM flags WHERE key = $1", key,
	).Scan(&f.Key, &f.Description, &f.Enabled, &f.RolloutPercent, &f.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Flag{}, ErrNotFound
	}
	if err != nil {
		return Flag{}, fmt.Errorf("query flag %q: %w", key, err)
	}
	s.put(f)
	return f, nil
}

func (s *FlagStore) Upsert(
	ctx context.Context, key, description string, enabled bool, rolloutPercent int,
) (Flag, error) {
	f := Flag{Key: key, Description: description, Enabled: enabled, RolloutPercent: rolloutPercent}
	err := s.db.QueryRowContext(ctx,
		"INSERT INTO flags (key, description, enabled, rollout_percent, updated_at) "+
			"VALUES ($1, $2, $3, $4, now()) "+
			"ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, "+
			"enabled = EXCLUDED.enabled, rollout_percent = EXCLUDED.rollout_percent, "+
			"updated_at = now() RETURNING updated_at",
		f.Key, f.Description, f.Enabled, f.RolloutPercent,
	).Scan(&f.UpdatedAt)
	if err != nil {
		return Flag{}, fmt.Errorf("upsert flag %q: %w", f.Key, err)
	}
	s.put(f)
	return f, nil
}

func (s *FlagStore) put(f Flag) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache[f.Key] = cacheEntry{flag: f, expires: time.Now().Add(s.ttl)}
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "We run three replicas. After a `PUT`, the other two keep serving the old flag. Expected?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Yes. `put` only updates the cache on the replica that handled the request. The others keep their entry until `expires`, so you're eventually consistent within `ttl`.\n\nYour options:\n1. **Accept it.** Keep `ttl` short (5–15 s) and document it. That's often fine for feature flags.\n2. **Push invalidation.** Have the upsert run `NOTIFY flag_changed, '<key>'` in PostgreSQL. Each replica holds one connection running `LISTEN` (`pgx` supports this with `WaitForNotification`) and deletes the key from its cache.\n3. **Version check.** Cache `updated_at` and run a cheap `SELECT max(updated_at)` poll every second.\n\nOption 2 gives near-instant propagation without extra infrastructure.",
      delay: 11000,
    },
    {
      role: "user",
      content: "Is the cache in `Get` safe under concurrent requests?",
      delay: 25000,
    },
    {
      role: "assistant",
      content:
        "It's race-free: reads happen under `RLock`, writes under `Lock`, and `cacheEntry` is copied by value, so `go test -race` will pass.\n\nWhat it doesn't prevent is a **stampede**. When a hot key expires, every in-flight request misses at the same moment and they all query PostgreSQL. Wrap the load in `golang.org/x/sync/singleflight`:\n\n```go\nv, err, _ := s.group.Do(key, func() (any, error) {\n    return s.load(ctx, key)\n})\n```\n\nOne caveat: the shared call uses the first caller's `ctx`. If that request times out, the others get its error too. Using `context.WithoutCancel(ctx)` plus your own timeout inside `Do` avoids that.",
      delay: 37000,
    },
    {
      role: "user",
      content: "How do I prove the rollout percentage is roughly right?",
      delay: 51000,
    },
    {
      role: "assistant",
      content:
        "Write a statistical unit test for `EnabledFor`:\n\n1. Create a `Flag{Key: \"checkout-v2\", Enabled: true, RolloutPercent: 30}`.\n2. Evaluate 100,000 synthetic subjects such as `fmt.Sprintf(\"subject-%d\", i)`.\n3. Assert the enabled ratio is within ±1 percentage point of 30.\n\nAdd a **monotonicity** test too: any subject enabled at 30% must still be enabled at 50%. That holds because the bucket doesn't depend on the percentage, and it's the property that stops users flipping in and out as you ramp up.\n\nFNV-1a with `% 100` has a tiny modulo bias, roughly 0.000002%, which is negligible here.",
      delay: 62000,
    },
  ],
};

export default config;
