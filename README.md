# darkroom 🎞️

A self-hosted photo gallery built in Rust — because 220GB of family memories deserved better than a USB drive.

---

## The Story

My family has been accumulating digital photos for decades. Old hard drives, camera cards, random folders named `final_final_v2` — the whole archive eventually landed on my home server. Everyone wanted to see the photos. Nobody wanted to dig through a network share.

I could have installed Nextcloud. I could have used Google Photos. But I was trying to learn Rust, I wanted home lab experience, and frankly — the plot demanded it.

So I built one.

This is a minimal, fast, self-hosted photo gallery server. It serves a polaroid-themed web frontend backed by a Rust API that walks your directory tree and streams images on demand. No database. No cloud. No nonsense.

---

## Why Rust

I'd used ASP.NET before. It worked, but it never felt technical — the framework absorbed too much of the problem. I wanted to feel the friction.

Rust forced me to understand every decision:
- Why is this async?
- What owns this string?
- Why can't I return different types from the same function?

Coming from C and C++, the ownership model wasn't entirely foreign — but Rust's type system enforces at compile time what C++ leaves to discipline. No undefined behavior, no use-after-free, the compiler catches it all. That strictness was the adjustment.

It was uncomfortable in the right way.

---

## Architecture

```
Browser
  │
  ├── GET /              → serves index.html (tower-http ServeDir)
  ├── GET /api?path=...  → returns JSON { folders, images, parent }
  └── GET /photos/...    → serves actual image files (tower-http ServeDir)

Rust Backend (axum + tokio)
  │
  ├── AppState { photos_root }   ← read from PHOTOS_DIR env var at startup
  ├── walkdir                    ← recursive directory traversal
  ├── serde_json                 ← JSON serialization
  └── Path traversal protection  ← canonicalize + prefix check

Docker
  ├── Multi-stage build (rust:1.85-slim → debian:bookworm-slim)
  ├── Photos mounted as read-only volume
  └── PHOTOS_DIR environment variable
```

---

## Stack

| Layer | Technology |
|---|---|
| Web framework | axum 0.7 |
| Async runtime | tokio |
| Static files | tower-http ServeDir |
| Directory traversal | walkdir |
| Serialization | serde + serde_json |
| Frontend | Vanilla HTML/CSS/JS |
| Fonts | Special Elite + Caveat (Google Fonts) |
| Deployment | Docker (multi-stage build) |

---

## Features

- **Folder navigation** — browse nested directories, breadcrumb trail tracks where you are
- **Polaroid theme** — dark background, dusty pink accents, slight tilt on each photo card
- **Lightbox** — click any image for fullscreen view, arrow key navigation, escape to close
- **Lazy loading** — images load only when scrolled into view, essential with 500+ image folders
- **Go back** — parent folder navigation, home button always available
- **Responsive** — works on mobile

---

## Security

Two layers of protection against path traversal attacks.

### What is a path traversal attack?

Without protection, a malicious request like:

```
GET /api?path=../../etc/passwd
```

Could walk outside your photos directory and read arbitrary files from your server. Classic vulnerability, trivially exploitable.

### Layer 1 — canonicalize + prefix check

```rust
fn is_safe_path(base: &str, requested: &str) -> bool {
    let base = match fs::canonicalize(base) {
        Ok(p) => p,
        Err(_) => return false,
    };
    let requested = match fs::canonicalize(requested) {
        Ok(p) => p,
        Err(_) => return false,
    };
    requested.starts_with(&base)
}
```

`fs::canonicalize` asks the OS to resolve the true absolute path — collapsing `../` traversals, following symlinks, giving you the real path. We then check if the resolved path still starts with our photos root.

`../../etc/passwd` resolves to `/etc/passwd`. `/etc/passwd` does not start with `/srv/photos`. Request rejected with 403.

Note: `starts_with` on `PathBuf` checks path components, not strings. `/srv/photos-backup` starts with the string `/srv/photos` but is correctly rejected because it's a different path component.

### Layer 2 — OS permissions (principle of least privilege)

The Docker container runs with read-only access to the photos directory:

```yaml
volumes:
  - /srv/photos:/srv/photos:ro
```

Even if the path traversal check somehow failed, the container cannot write to or access anything outside its mounted volume. The OS is the final backstop.

Defense in depth — don't trust only your code.

---

## How It Works

### API

**`GET /api?path=<relative-path>`**

Returns the contents of a directory relative to your photos root.

```json
{
  "folders": ["vacation", "family/2023"],
  "images": ["vacation/beach.jpg", "vacation/sunset.jpg"],
  "ttl_images": 2,
  "parent_folder": null
}
```

- `path` is always relative — the server resolves it against `PHOTOS_DIR`
- `parent_folder` is `null` at root, otherwise the parent path
- Paths are stripped of the absolute prefix before being sent to the client — the browser never sees `/srv/photos`

### Frontend

The frontend is intentionally minimal — one HTML file, one CSS file, one JS file. No framework.

On load, JS calls `/api?path=` (empty path = root). The response populates folder cards and image grid. Clicking a folder calls the API again with the new path. The breadcrumb builds itself from the current path string by splitting on `/`.

Images use `loading="lazy"` — the browser handles deferred loading automatically.

---

## Running Locally

```bash
git clone <your-repo>
cd darkroom

# set your photos directory
export PHOTOS_DIR=/path/to/your/photos

cargo run
```

Then open `http://localhost:3000`.

---

## Docker Deployment

### Build

```bash
docker build -t darkroom .
```

The Dockerfile uses a multi-stage build:

1. **Builder stage** (`rust:1.85-slim`) — compiles the binary. Dependencies are built in a separate layer so they cache between rebuilds. Only your source recompiles on changes.

2. **Runtime stage** (`debian:bookworm-slim`) — copies only the compiled binary and static files. No Rust toolchain in the final image. Final image is ~80MB vs ~800MB+ if you shipped the builder.

### Run

```bash
docker run -d \
  -p 3000:3000 \
  -e PHOTOS_DIR=/photos \
  -v /srv/photos:/photos:ro \
  darkroom
```

### docker-compose

```yaml
services:
  darkroom:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - /srv/photos:/photos:ro
    environment:
      - PHOTOS_DIR=/photos
    restart: unless-stopped
```

```bash
docker compose up -d
```

---

## Struggles and Lessons

### Reading actual documentation

Coming from Python and ML work where AI assistance is abundant, deliberately reading `docs.rs` for every unfamiliar function was a different experience. Rust's documentation is genuinely good — but dense. Understanding trait implementations, why `&str` vs `String` matters, and what `Option<T>` actually means took time to internalize through building rather than reading.

### Rust's type system

The first major wall was returning different response types from the same handler function. Axum expects a consistent return type, but sometimes you want to return a 403, sometimes JSON. The solution — changing the return type to `Result<Json<FolderContent>, StatusCode>` — made sense once the mental model of traits clicked.

### The canonicalize forbidden bug

The path traversal check was rejecting every request including valid ones. The root cause: `PHOTOS_DIR` was set to a relative path `"photos"` inside the container, but the photos were mounted at `/photos` (absolute). `canonicalize` failed on the relative path, returned `Err`, and `is_safe_path` returned `false` for everything.

Fix was twofold — always use absolute paths in the environment variable, and handle the empty path case explicitly instead of constructing `"/photos/"` with a trailing slash.

### Docker layer caching

The dummy `main.rs` trick for caching dependencies was not intuitive. Docker caches each instruction as a layer. If you copy source code before building dependencies, any code change invalidates the dependency cache and recompiles everything. Separating dependency compilation from source compilation made rebuilds go from several minutes to under a minute.

### Port already allocated

Classic. `Ctrl+C` stops the foreground process but the container keeps running. `docker stop $(docker ps -q)` became a muscle memory command.

---

## What's Next

- [ ] Thumbnail generation — 16MB+ RAW files are slow to serve, need JPEG thumbnails for gallery view
- [ ] NEF/RAW support — dcraw pipeline for Nikon RAW files
- [ ] Better empty state handling
- [ ] Search by folder name

---

## Project Structure

```
darkroom/
├── src/
│   └── main.rs          # entire backend
├── static/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── Dockerfile
├── docker-compose.yml
└── Cargo.toml
```

---

*Built for a home server. Tested on family.*
