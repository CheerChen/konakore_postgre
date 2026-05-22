# pgvector Tag-based Recommendation Design

## Background

The current system uses a TF-IDF SUM scoring approach to rank posts by relevance
to the user's liked posts. The computation happens in two places:

- **Backend** (`api/routers/users.py:get_relevance_weights`): computes per-tag
  TF-IDF weights via SQL, returns a `{tag: weight}` map
- **Frontend** (`TagManager.scorePost`): sums weights of a post's tags to get a
  score

### Current approach limitations

| Problem | Detail |
|---------|--------|
| SUM bias | Posts with more tags score higher regardless of match quality |
| No direction awareness | A "noisy" post (5 matched + 30 irrelevant tags) scores ≥ a precise match (5 matched, 0 noise) |
| Full scan on every request | Backend recomputes weights over all liked posts; frontend scores every post in JS |
| No precomputation | Cannot do "find the 50 most similar posts in the entire DB" without scoring all rows |

### Why pgvector

pgvector enables:
1. **Cosine similarity** — measures direction alignment, not absolute overlap
2. **ANN indexes** (IVFFlat / HNSW) — sub-linear nearest-neighbor search
3. **Stays in PostgreSQL** — no new infrastructure

---

## Architecture: current TF-IDF vs pgvector

### Current flow (TF-IDF SUM)

```
OFFLINE (once, cached 30min)               ONLINE (every page load)
─────────────────────────────               ─────────────────────────
                                            Frontend: GET /v1/posts?page=3
                                                ↓
Backend: GET /users/me/relevance-weights    Backend returns posts (no scores)
  ├─ scan all liked posts' post_tags            ↓
  ├─ compute per-tag TF-IDF weight          Frontend receives weightMap (from cache)
  ├─ return { tag: weight } (~3k entries)       ↓
  └─ memory-cached until liked count        Frontend JS loop:
     changes                                  for each post in page (100-500):
        ↓                                       score = SUM(weightMap[tag])
    setWeightMap(weights)                       ↓
                                            postScoresMap = Map<postId, score>
                                                ↓
                                            filter + sort + render
```

**Pain points:**
- Frontend does scoring — weight map (~3k entries) must be transferred and cached
- SUM has tag-count bias (more tags → higher score regardless of match quality)
- Cannot query "top 50 globally most similar" without scoring every row

### pgvector flow (precompute embedding + real-time cosine)

```
OFFLINE (background jobs)                   ONLINE (every page load)
──────────────────────────                  ─────────────────────────
                                            Frontend: GET /v1/posts?page=3
1. rebuild tag_vocabulary (daily)               ↓
   all tags with count >= 10                Backend SQL (single query):
        ↓                                     SELECT id, raw_data,
2. compute tag_embedding per post                    1-(tag_embedding <=> $profile) AS similarity
   (on post_tags batch complete)              FROM posts
   stored in posts.tag_embedding              WHERE <pagination>
        ↓                                     ORDER BY id DESC
3. update user_profile                        LIMIT 100
   (incremental on like/unlike)                 ↓
                                            Backend returns posts WITH similarity field
                                                ↓
                                            Frontend uses similarity directly
                                            (no weightMap, no scorePost, no postScoresMap)
```

### What's precomputed vs real-time

| Component | Precomputed? | When | Cost |
|-----------|-------------|------|------|
| `tag_vocabulary` (N dims) | Yes | Daily / on tag sync | ~1s |
| `posts.tag_embedding` | Yes | After `post_tags` batch completes | ~0.1ms per post |
| `user_profile.embedding` | Yes | Incremental on like/unlike | ~1ms |
| **Similarity score for a page** | **No — real-time** | On each page request | **~2-5ms for 500 rows** |
| **Global top-N recommendation** | **No — real-time** | On `/recommendations` request | **~200-500ms brute-force** |

The key insight: computing `vector <=> vector` for 100-500 already-selected rows
is a trivial operation (one dot product per row). This does NOT use the HNSW
index — it's just arithmetic on rows already in the result set.

### Why precompute post embeddings (not real-time)

On a Pi 5, real-time vector construction for 300 posts would work (~30-50ms):

```
1. SQL JOIN post_tags + vocabulary for 300 posts     ~10-30ms
2. Python: assemble 300 vectors from 9000 tag rows   ~5-10ms
3. Python: normalize + cosine                         ~2-4ms
Total                                                 ~20-50ms
```

But precomputing is better for engineering reasons, not performance:
- Query stays simple: just add `1-(tag_embedding <=> $profile)` to existing SELECT
- No Python vector assembly code in the API hot path
- pgvector `<=>` runs in C, not Python
- Enables future global top-N recommendations without any schema change

### Frontend simplification

```diff
  // HomePage.jsx — BEFORE (TF-IDF)
- useEffect(() => {
-   tagManager.fetchRelevanceWeights().then(setWeightMap);
- }, []);
-
- const postScoresMap = useMemo(() => {
-   const map = new Map();
-   posts.forEach(post => {
-     map.set(post.id, tagManager.scorePost(post, weightMap));
-   });
-   return map;
- }, [posts, weightMap]);

  // HomePage.jsx — AFTER (pgvector)
+ // similarity comes from API response, no client-side computation
+ const postScoresMap = useMemo(() => {
+   const map = new Map();
+   posts.forEach(post => {
+     if (post.similarity != null) map.set(post.id, post.similarity);
+   });
+   return map;
+ }, [posts]);
```

The existing `usePostsProcessing`, `filterByRelevance`, `RelevanceFilterModal`
all work unchanged — they consume `postScoresMap` which is now populated from
the API response instead of client-side computation.

---

## Scoring algorithm

Three layers, each computed at a different time.

### Layer 1: tag vocabulary (offline, daily)

Determines which tags become vector dimensions and the weight of each dimension.

**All tags with `count >= 10` and not tagme are included.** No upper limit on
dimensions — preserving all tags avoids information loss (e.g., a liked artist
being excluded from the vocabulary would make all their posts invisible to the
recommender). Dimension count N = number of qualifying tags (typically 3k-8k).

For each qualifying tag:

```
idf = ln(total_posts / tag.count)

type_weight = {
    ARTIST:    1.7,
    COPYRIGHT: 1.4,
    CHARACTER: 1.2,
    COMPANY:   1.2,
    GENERAL:   0.6,
    META:      0.3,
}
```

`type_weight` values are intentionally moderate (sqrt of old TF-IDF weights)
because cosine similarity squares the effect — a 1.7 weight becomes 1.7² ≈ 2.9×
impact in the dot product when both vectors share that dimension.

### Layer 2: post embedding (offline, on post_tags processed)

For each post, build an N-dimensional vector:

```
vec = [0, 0, ..., 0]    # N dimensions, all zero

for each tag the post has:
    if tag is in vocabulary:
        vec[dim] = idf(tag) × type_weight(tag.type)

vec = vec / ||vec||      # L2-normalize to unit vector
```

This vector is **objective** — it only depends on what tags the post has.
A post with 30 tags will have ~30 non-zero dimensions out of N (very sparse).

### Layer 3: user profile (offline, incremental on like/unlike)

```
user_profile = average(all liked posts' tag_embedding vectors)
user_profile = user_profile / ||user_profile||    # re-normalize
```

This vector is **subjective** — it reflects what the user likes.
TF information (how often a tag appears across liked posts) is implicitly
encoded: if 50 out of 100 liked posts contain `artist:X`, that dimension
will be large in the averaged profile.

### Query-time scoring

```
similarity = cosine(user_profile, post.tag_embedding)
           = dot(A, B)          # both are unit vectors, so cosine = dot product
```

No additional formula. One dot product per post.

### Comparison with current TF-IDF

| | Current TF-IDF | pgvector |
|---|---|---|
| Per-tag value | `(1 + ln(tf)) × ln(N/df) × type_weight` | `ln(N/df) × type_weight` |
| Where tf lives | Mixed into per-tag weight | Implicit in user_profile (averaged liked embeddings) |
| Scoring | SUM (absolute overlap) | cosine (directional alignment) |
| Tag-count bias | Yes (more tags → higher score) | No (L2-normalized) |

---

## Data model

### New migration: `003_pgvector.sql`

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Tag vocabulary: the ordered list of tags used as vector dimensions.
-- Includes all tags with count >= 10 (no artificial dimension cap).
-- N = number of qualifying tags, typically 3000-8000.
CREATE TABLE tag_vocabulary (
    dim    INT PRIMARY KEY,          -- 0-based dimension index
    tag_id BIGINT NOT NULL REFERENCES tags(id),
    idf    DOUBLE PRECISION NOT NULL, -- ln(total_posts / tag.count)
    type_weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    UNIQUE(tag_id)
);

-- Per-post tag embedding.
-- Dimension N is determined at vocabulary build time.
-- pgvector requires a fixed dimension per column, so this is set once and
-- all embeddings must match. If vocabulary size changes, column must be
-- recreated (ALTER TABLE posts DROP COLUMN tag_embedding, then re-add).
ALTER TABLE posts ADD COLUMN tag_embedding vector({N});

-- User profile vector (single-user for now; extend to per-user table later)
CREATE TABLE user_profile (
    id         INT PRIMARY KEY DEFAULT 1,
    embedding  vector({N}) NOT NULL,
    liked_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Note: `{N}` is determined at build time by counting qualifying tags. The
migration should query the actual count first, then create the column.

HNSW index is **not needed initially**. The primary use case (score 100-500
posts per page) doesn't use ANN search. For global top-N recommendations on
~100k posts, brute-force scan takes ~200-500ms on Pi 5, which is acceptable
for a non-interactive recommendation refresh. Add HNSW later if needed:

```sql
-- Only add if brute-force global search becomes too slow
CREATE INDEX idx_posts_tag_embedding
    ON posts USING hnsw (tag_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

Note: pgvector HNSW supports up to 2000 dimensions. If N > 2000, HNSW is not
available — use IVFFlat instead, or stick with brute-force.

### Storage estimate

| Dimension N | Per-post | 100k posts | Notes |
|-------------|----------|------------|-------|
| 3,000 | 12 KB | ~1.2 GB | Conservative tag set |
| 5,000 | 20 KB | ~2.0 GB | Moderate |
| 8,000 | 32 KB | ~3.2 GB | Very inclusive |

On a Pi 5 with typical 4-8 GB RAM + SD/SSD storage, 1-3 GB is manageable.
The vectors are sparse but stored dense (pgvector has no sparse format).

---

## Vector construction (implementation)

### Step 1: Build tag vocabulary

Run after tag sync or daily:

```python
def rebuild_tag_vocabulary(conn):
    """
    Include all tags with count >= 10, excluding tagme variants.
    No dimension cap — preserve all discriminative information.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM posts")
        total_posts = cur.fetchone()[0]

        cur.execute("""
            SELECT id, name, count, type
            FROM tags
            WHERE count >= 10
              AND name NOT LIKE 'tagme%%'
            ORDER BY id   -- stable ordering
        """)
        rows = cur.fetchall()

        cur.execute("DELETE FROM tag_vocabulary")
        for dim, (tag_id, name, count, tag_type) in enumerate(rows):
            idf = math.log(total_posts / max(count, 1))
            tw = TYPE_WEIGHTS_COS.get(tag_type, 1.0)
            cur.execute(
                "INSERT INTO tag_vocabulary (dim, tag_id, idf, type_weight) "
                "VALUES (%s, %s, %s, %s)",
                (dim, tag_id, idf, tw)
            )
        conn.commit()

        return len(rows)  # N — the dimension count
```

### Step 2: Compute per-post embedding

Hook into existing `process_post_tags_batch` in `scheduler/jobs/post_tags.py`:

```python
def compute_post_embedding(post_id, conn, vocab):
    """
    vocab: dict of tag_id -> (dim, idf, type_weight)
    Returns: list[float] of length N
    """
    N = len(vocab)  # or read from a config / table

    with conn.cursor() as cur:
        cur.execute("SELECT tag_id FROM post_tags WHERE post_id = %s", (post_id,))
        post_tag_ids = {row[0] for row in cur.fetchall()}

    vec = [0.0] * N
    for tag_id in post_tag_ids:
        if tag_id in vocab:
            dim, idf, tw = vocab[tag_id]
            vec[dim] = idf * tw

    # L2-normalize
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]

    return vec
```

Integration point — append to `process_post_tags_batch` after marking
`is_processed = TRUE`:

```python
# After existing post_tags insertion and is_processed update:
emb = compute_post_embedding(pid, conn, vocab)
cur.execute(
    "UPDATE posts SET tag_embedding = %s WHERE id = %s",
    (emb, pid)
)
```

### Step 3: Compute user profile vector

```python
def compute_user_profile(conn):
    """
    User profile = mean of all liked posts' embeddings, re-normalized.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT tag_embedding
            FROM posts
            WHERE is_liked = TRUE AND tag_embedding IS NOT NULL
        """)
        rows = cur.fetchall()

    if not rows:
        return None

    N = len(rows[0][0])
    profile = [0.0] * N
    for (emb,) in rows:
        for i, v in enumerate(emb):
            profile[i] += v
    n = len(rows)
    profile = [v / n for v in profile]

    # L2-normalize
    norm = math.sqrt(sum(v * v for v in profile))
    if norm > 0:
        profile = [v / norm for v in profile]

    return profile
```

### Incremental user profile update (on like/unlike)

```python
def update_user_profile_on_like(conn, post_id, is_like):
    """
    Incremental: new_profile = (old * count ± post) / new_count, re-normalized.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT embedding, liked_count FROM user_profile WHERE id = 1")
        row = cur.fetchone()

        cur.execute("SELECT tag_embedding FROM posts WHERE id = %s", (post_id,))
        post_row = cur.fetchone()
        if not post_row or not post_row[0]:
            return  # post has no embedding yet

        post_emb = post_row[0]

        if not row:
            # First like
            cur.execute(
                "INSERT INTO user_profile (id, embedding, liked_count) VALUES (1, %s, 1)",
                (post_emb,)
            )
            return

        old_emb, old_count = row

        if is_like:
            new_count = old_count + 1
            new_emb = [(o * old_count + p) / new_count
                       for o, p in zip(old_emb, post_emb)]
        else:
            new_count = max(old_count - 1, 1)
            new_emb = [(o * old_count - p) / new_count
                       for o, p in zip(old_emb, post_emb)]

        # Re-normalize
        norm = math.sqrt(sum(v * v for v in new_emb))
        if norm > 0:
            new_emb = [v / norm for v in new_emb]

        cur.execute(
            "UPDATE user_profile SET embedding = %s, liked_count = %s, "
            "updated_at = NOW() WHERE id = 1",
            (new_emb, new_count)
        )
```

---

## Update pipeline

### When to recompute

| Event | What changes | Action |
|-------|-------------|--------|
| Tag sync completes | tag.count values change → idf shifts | Rebuild `tag_vocabulary`; batch recompute all post embeddings + user profile |
| New posts synced | New rows in posts, no post_tags yet | Nothing (no embedding until processed) |
| `post_tags` batch processed | New post-tag links | Compute embedding for newly processed posts |
| User likes a post | User preference changed | Incremental `user_profile` update |
| User unlikes a post | User preference changed | Incremental `user_profile` update |

### Full rebuild job

```python
# scheduler/jobs/embeddings.py

def task_rebuild_all_embeddings():
    """
    Full rebuild: vocabulary + all post embeddings + user profile.
    Run after tag sync or on schedule (daily).
    """
    with get_db_connection() as conn:
        N = rebuild_tag_vocabulary(conn)
        vocab = load_vocabulary(conn)

        # Batch update all processed posts
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM posts WHERE is_processed = TRUE")
            post_ids = [row[0] for row in cur.fetchall()]

        for i in range(0, len(post_ids), 500):
            batch = post_ids[i:i+500]
            for pid in batch:
                emb = compute_post_embedding(pid, conn, vocab)
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE posts SET tag_embedding = %s WHERE id = %s",
                        (emb, pid)
                    )
            conn.commit()

        # Rebuild user profile from scratch
        profile = compute_user_profile(conn)
        if profile:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM posts WHERE is_liked = TRUE")
                liked_count = cur.fetchone()[0]
                cur.execute(
                    "INSERT INTO user_profile (id, embedding, liked_count) "
                    "VALUES (1, %s, %s) "
                    "ON CONFLICT (id) DO UPDATE SET "
                    "embedding = EXCLUDED.embedding, "
                    "liked_count = EXCLUDED.liked_count, "
                    "updated_at = NOW()",
                    (profile, liked_count)
                )
            conn.commit()
```

---

## API changes

### Modified existing endpoint: `GET /v1/posts`

Add `similarity` field to the response when user profile exists:

```python
# In the posts query, add similarity column:
cur.execute("""
    SELECT p.id, p.raw_data, p.is_liked,
           CASE WHEN p.tag_embedding IS NOT NULL AND up.embedding IS NOT NULL
                THEN 1 - (p.tag_embedding <=> up.embedding)
                ELSE NULL
           END AS similarity
    FROM posts p
    LEFT JOIN user_profile up ON up.id = 1
    WHERE ...
    ORDER BY p.id DESC
    LIMIT %s OFFSET %s
""", ...)
```

### New endpoint: `GET /v1/recommendations`

For global "find the most similar posts in entire DB":

```python
@router.get("/recommendations")
def get_recommendations(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    exclude_liked: bool = Query(default=True),
):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT embedding FROM user_profile WHERE id = 1")
            row = cur.fetchone()
            if not row:
                return {"posts": [], "message": "No user profile yet"}

            profile = row['embedding']
            liked_filter = "AND is_liked = FALSE" if exclude_liked else ""

            cur.execute(f"""
                SELECT id, raw_data,
                       1 - (tag_embedding <=> %s::vector) AS similarity
                FROM posts
                WHERE tag_embedding IS NOT NULL {liked_filter}
                ORDER BY tag_embedding <=> %s::vector
                LIMIT %s OFFSET %s
            """, (profile, profile, limit, offset))

            return {"posts": cur.fetchall()}
```

### Backward compatibility

`GET /v1/users/me/relevance-weights` is kept during migration. Deprecate in
Phase 3 after frontend switches to server-side similarity.

### Modified like/unlike handler

Add `update_user_profile_on_like()` call after toggling `is_liked`.

---

## Migration path (coexistence)

| Phase | Frontend | Backend | Notes |
|-------|---------|---------|-------|
| **Phase 0** (current) | `scorePost()` SUM | `get_relevance_weights()` TF-IDF map | Status quo |
| **Phase 1** | Unchanged | Add pgvector extension, `tag_vocabulary`, `tag_embedding` column; run backfill | Backend-only, no user-facing change |
| **Phase 2** | Consume `similarity` from API; keep old path as fallback | Posts endpoint returns `similarity`; add `/recommendations` | Both paths live, can compare |
| **Phase 3** | Remove `fetchRelevanceWeights`, `scorePost`, `weightMap` state | Remove old endpoint | Cleanup |

---

## Performance estimates (Pi 5)

| Operation | Cost | Frequency |
|-----------|------|-----------|
| Rebuild tag_vocabulary | ~1-2s | Daily / on tag sync |
| Compute 1 post embedding | ~0.1ms | On each post processed |
| Batch 100k posts | ~15s (Python) / ~3s (Go) | Full rebuild (daily) |
| User profile full recompute | ~1s for 5k liked posts | Daily or on demand |
| User profile incremental update | ~1-2ms | On each like/unlike |
| Per-page similarity (300 posts) | ~2-5ms | Each page request |
| Global top-50 brute-force (100k) | ~200-500ms | Each recommendation request |

---

## Open questions

1. **Exact dimension count**: Need to query actual tag distribution
   (`SELECT COUNT(*) FROM tags WHERE count >= 10 AND name NOT LIKE 'tagme%'`)
   to determine N. pgvector `vector(N)` column requires a fixed N — changing it
   later means dropping and recreating the column + recomputing all embeddings.

2. **Vocabulary staleness**: When new popular tags appear (new anime season),
   vocabulary needs rebuilding. However, adding a new dimension means changing
   the vector column size. Strategy: rebuild weekly or when tag sync adds tags
   crossing the `count >= 10` threshold. Padding the dimension with a small
   buffer (e.g., N + 200) could reduce rebuild frequency.

3. **Cold start for new posts**: A post with `is_processed = FALSE` has no
   `post_tags` → no embedding → similarity = NULL. It becomes scorable only
   after `process_post_tags_batch` runs. This matches current behavior.

4. **Multi-user**: Current design uses a single `user_profile` row. For
   multi-user, change to `user_profile(user_id, embedding, ...)` and add auth.

5. **Hybrid with CLIP**: Future enhancement — concatenate tag embedding with
   CLIP visual embedding. Requires image encoding pipeline. Out of scope.

6. **pgvector sparse format**: pgvector stores vectors dense. For N=5000 with
   ~30 non-zero dims, this wastes ~99% storage. The `sparsevec` type
   (pgvector 0.7+) could help but has limited operator support. Monitor for
   upstream improvements.
