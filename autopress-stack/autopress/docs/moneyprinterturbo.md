# MoneyPrinterTurbo integration

AutoPress renders short-form video through [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo)
(MPT), which runs as its **own service** and is reached over HTTP only. It is never
bundled into this app, and article publishing never waits on it: if MPT is offline,
articles still go live and the video job retries independently.

With `MPT_ENABLED=false` the integration is completely inert — no database writes,
no HTTP calls, no log output.

## What MPT actually needs

AutoPress sends both `video_script` and `video_terms`, so **MPT does not need an LLM
API key** — it skips its own script generation entirely (`app/services/task.py`).

| Requirement | Needed? | Notes |
|---|---|---|
| Python 3.11 | yes | see MPT's `.python-version` |
| ffmpeg | yes | the only system dependency (`brew install ffmpeg`) |
| Pexels API key | yes | free at <https://www.pexels.com/api/> — without it there is no B-roll |
| LLM API key | **no** | AutoPress supplies the narration |
| TTS key | no | edge-tts is free |
| Whisper model | no | keep `subtitle_provider = "edge"` |
| ImageMagick | no | not required by moviepy 2.x |

## Running it with Docker (recommended)

`docker compose up -d --build` from the autopress folder starts this service
alongside Postgres, Redis, the web server and the worker. See
[docker.md](./docker.md). The rest of this page covers running it directly.

## Running it locally

```bash
git clone https://github.com/harry0703/MoneyPrinterTurbo.git
cd MoneyPrinterTurbo
cp config.example.toml config.toml     # set pexels_api_keys = ["your-key"]
pip install -r requirements.txt
python3 main.py                        # API on 127.0.0.1:8080
```

Then in AutoPress `.env`:

```
MPT_ENABLED="true"
MPT_API_URL="http://127.0.0.1:8080"
```

Restart both `npm run dev` and `npm run worker` — `src/lib/env.ts` reads the
environment once at startup.

### Two settings in MPT's config.toml that matter

```toml
enable_redis = true      # default false: task state is lost on restart and
                         # AutoPress's video.poll job never sees a result
listen_host  = "127.0.0.1"   # MPT has NO authentication of its own
```

`MPT_API_KEY` is only useful if you put MPT behind your own auth proxy; MPT itself
ignores the header.

## How finished videos are served

MPT reports completed renders as **absolute paths on its own filesystem**:

```
/opt/MoneyPrinterTurbo/storage/tasks/<task_id>/final-1.mp4
```

Those are not URLs. `src/lib/video/mpt-url.ts` maps them onto MPT's HTTP endpoint:

```
{base}/api/v1/download/{task_id}/{filename}
```

where `{base}` is `MPT_PUBLIC_BASE_URL` if set, otherwise `MPT_API_URL`. Set
`MPT_PUBLIC_BASE_URL` when the files are reachable at a different origin (CDN,
reverse proxy, public host).

If a path cannot be mapped safely, the video row is marked `FAILED` with the raw
paths kept in the error message. AutoPress never stores a URL it cannot verify the
shape of, so the admin shows an honest warning instead of a dead link.

## Pipeline

```
Article PUBLISHED
  → publish hook (after commit — cannot roll back the article)
  → ArticleVideo row, status QUEUED
  → worker: SCRIPTING   (narration from the article; deterministic fallback if the LLM fails)
  → worker: GENERATING  (POST /api/v1/videos, task_id saved)
  → video.poll every MPT_POLL_INTERVAL_MS
  → COMPLETED | FAILED
```

Automatic queueing requires `MPT_ENABLED=true` **and** `MPT_AUTO_VIDEO=true` **and**
article status `PUBLISHED`. Manual **Generate video** in the admin needs only
`MPT_ENABLED=true`, and runs through the same worker pipeline.

One row per `(articleId, aspect)` — editing a published article never produces a
second video. **Regenerate** bumps `version` on the existing row.

## Testing

```bash
npm test        # 51 tests, no database, no network beyond loopback
```

`test/video/` covers: MPT disabled, service offline, task creation, poll to
completion, failed task, poll timeout, retry policy, missing video URL, path
traversal, and the filesystem-path → download-URL mapping.
