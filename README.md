<p align="center">
  <img src=".claude-plugin/icon.png" width="96" height="96" alt="Vouchwall">
</p>

<h1 align="center">Vouchwall</h1>

<p align="center">
  <b>Open-source, self-hosted alternative to Senja and Testimonial.to, built to be run from Claude.</b>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-5b5bd6" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-5b5bd6" alt="Node 20+">
  <img src="https://img.shields.io/badge/dependencies-0-5b5bd6" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/Claude-plugin%20%2B%20MCP-5b5bd6" alt="Claude plugin + MCP">
</p>

Vouchwall collects text and video testimonials from your customers. You approve them, and they
appear on a **Wall of Love** that you embed on any website. It runs on your own server, and your
data stays in one JSON file plus an uploads folder.

What makes it different: it ships as a **Claude plugin** (4 skills + an MCP server). Claude can
do the work most people never get to:

- Ask customers for testimonials at the right moment, in your voice.
- Review the inbox, tag testimonials by theme and pick verbatim highlight quotes.
- Import praise from emails, G2, LinkedIn, X or Slack, checking permission before publishing.
- Turn approved testimonials into pricing-page proof, social posts, ads, emails and case studies.

---

## Contents

- [Features](#features)
- [Quick start (local, 5 minutes)](#quick-start-local-5-minutes)
- [Deploy to a server](#deploy-to-a-server)
- [Configuration](#configuration)
- [Connect Vouchwall to Claude](#connect-vouchwall-to-claude)
- [Using it with Claude](#using-it-with-claude)
- [Embedding a wall on your website](#embedding-a-wall-on-your-website)
- [Reference: MCP tools, skills and HTTP API](#reference)
- [Security and privacy](#security-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [Development and tests](#development-and-tests)
- [Roadmap](#roadmap) · [Contributing](#contributing) · [License](#license)

---

## Features

| | Senja / Testimonial.to | Vouchwall |
|---|---|---|
| Price | Paid monthly plans | Free, MIT licensed |
| Where your data lives | Their servers | Your server: `vouchwall.json` + `uploads/` |
| Text testimonials with star rating, photo, role, company | ✓ | ✓ |
| Video testimonials | ✓ | ✓ Recorded in the browser (up to 2 min) or uploaded |
| Custom questions per form | ✓ | ✓ Up to 8 |
| Wall of Love embed | ✓ | ✓ Grid, carousel or list; light, dark or auto theme |
| Filter walls by tag, form, rating, featured, video/text | Varies | ✓ |
| Import from email and review sites | ✓ | ✓ With a permission check |
| AI | Built in, their model | Claude, via MCP + 4 skills |
| Dependencies | n/a | **None.** Only Node.js 20+ (or Docker) |

---

## How it works

```
 Customer                     You (or Claude)                  Your website
 ────────                     ───────────────                  ────────────
 opens /c/your-product  ──►   reviews the inbox at /admin  ──► <div data-vouchwall="...">
 writes or records,           approves, tags, features,        shows approved
 ticks consent                sets a highlight                 testimonials only
```

1. **Collect:** you create a collection form and share its link. Customers write a testimonial or
   record a video, add a rating and photo, and tick a consent box.
2. **Curate:** everything arrives as *pending*. You approve or reject, add tags, mark favourites as
   featured, and set a short highlight quote. You can do this in the dashboard or ask Claude.
3. **Publish:** create a wall, choose which testimonials it shows, and paste its two-line embed
   code into your site. Only approved testimonials are ever public.

---

## Quick start (local, 5 minutes)

**Requirements:** [Node.js 20 or newer](https://nodejs.org) and Git. Check with `node --version`.

**1. Download and start the server**

```bash
git clone https://github.com/dhavalrana-dev/Vouchwall.git
```

```bash
cd Vouchwall
```

```bash
npm start
```

There's no `npm install` step, because Vouchwall has no dependencies. On first start, the terminal prints:

```
  Vouchwall admin token (saved to .../data/admin-token):

    7Kq...your-token...xY

  Vouchwall running at http://localhost:3080/admin
```

Copy that **admin token**. It's also saved in `data/admin-token` if you lose it.

**2. Sign in:** open <http://localhost:3080/admin> and paste the token.

**3. Create a collection form:** go to **Collection forms**, enter your product or service name, and
optionally add extra questions (one per line), such as *"What were you using before?"*.
Click **Create form**. You get a share link like `http://localhost:3080/c/your-product`.

**4. Try it as a customer:** open the share link, write a short testimonial (or record a video),
tick the consent box, and submit.

**5. Approve it:** back in **Testimonials**, the submission is in the *pending* inbox. Add a highlight
and tags if you like, then click **Approve**.

**6. Create a wall:** go to **Walls & embeds**, give it a title (for example *Wall of Love*), choose a layout,
and click **Create wall**. Click **Open wall** to see it, or **Copy embed code** to put it on a site.

> On your own computer the links say `localhost`, so only you can open them. To collect real
> testimonials, [deploy to a server](#deploy-to-a-server).

---

## Deploy to a server

Any machine that runs Node 20+ or Docker works: a $5 VPS, Coolify, Railway, Render, Fly.io or a
home server. Put it behind HTTPS on its own subdomain, such as `proof.yourdomain.com`.

### Option A: Docker Compose (recommended)

```bash
git clone https://github.com/dhavalrana-dev/Vouchwall.git
```

```bash
cd Vouchwall
```

Create a file named `.env` next to `docker-compose.yml`:

```ini
VOUCHWALL_PUBLIC_URL=https://proof.yourdomain.com
# Optional: choose your own admin token instead of a generated one
# VOUCHWALL_ADMIN_TOKEN=a-long-random-string
```

Start it, then read the generated admin token from the logs:

```bash
docker compose up -d --build
```

```bash
docker compose logs vouchwall
```

Data lives in the Docker volume `vouchwall-data`, so it survives restarts and upgrades.

### Option B: Node directly

```bash
PORT=3080 VOUCHWALL_PUBLIC_URL=https://proof.yourdomain.com npm start
```

Keep it running with a process manager such as `systemd` or `pm2`.

### HTTPS with Caddy

Caddy gets a certificate automatically. A complete `Caddyfile`:

```
proof.yourdomain.com {
    reverse_proxy localhost:3080
}
```

With Nginx, proxy to `localhost:3080` and set `client_max_body_size 160m;` so video uploads aren't cut off.

### Backups

Back up the data folder (`./data`, or the `vouchwall-data` volume in Docker). It contains:

| File | What it is |
|---|---|
| `vouchwall.json` | All forms, testimonials and walls |
| `uploads/` | Videos and photos |
| `admin-token` | Your admin token |

### Updating

```bash
git pull
```

Then restart, with `npm start` or `docker compose up -d --build`. Your data folder is untouched.

---

## Configuration

All settings are environment variables.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3080` | Port the server listens on |
| `VOUCHWALL_DATA` | `./data` (Docker: `/data`) | Folder for `vouchwall.json`, `uploads/` and `admin-token` |
| `VOUCHWALL_PUBLIC_URL` | taken from each request | Public address used in share links, media URLs and embed code. **Set this in production**, e.g. `https://proof.yourdomain.com` |
| `VOUCHWALL_ADMIN_TOKEN` | generated on first start | Use your own admin token instead of the generated one |

Built-in limits: 150 MB per video, 3 MB per photo, 2 minutes of in-browser recording, 8 extra
questions per form, and 30 uploads or submissions per IP address per 10 minutes.

---

## Connect Vouchwall to Claude

You need a running Vouchwall (local or deployed) and its admin token.

### Claude Code (plugin with MCP server + skills)

**1. Install the plugin.** Inside Claude Code, run:

```bash
/plugin marketplace add dhavalrana-dev/Vouchwall
```

```bash
/plugin install vouchwall@vouchwall
```

**2. Tell it where your Vouchwall is.** The plugin reads two settings:

| Setting | Value |
|---|---|
| `VOUCHWALL_URL` | Your Vouchwall address, e.g. `https://proof.yourdomain.com`. Defaults to `http://localhost:3080` |
| `VOUCHWALL_TOKEN` | Your admin token |

The simplest way is to add them to your Claude Code settings file, `~/.claude/settings.json`
(on Windows: `C:\Users\<you>\.claude\settings.json`). If the file already has content, add the
`env` block inside the existing braces:

```json
{
  "env": {
    "VOUCHWALL_URL": "https://proof.yourdomain.com",
    "VOUCHWALL_TOKEN": "your-admin-token"
  }
}
```

Or set them in the terminal before starting Claude Code:

```bash
export VOUCHWALL_URL=https://proof.yourdomain.com VOUCHWALL_TOKEN=your-admin-token
```

On Windows PowerShell:

```powershell
$env:VOUCHWALL_URL="https://proof.yourdomain.com"; $env:VOUCHWALL_TOKEN="your-admin-token"
```

**3. Restart Claude Code and check.** Run `/mcp`; `plugin:vouchwall:vouchwall` should show as connected.
Then ask: *"Show me my testimonial stats."*

**Updating the plugin** later:

```bash
/plugin marketplace update vouchwall
```

### Claude Desktop (or any other MCP client)

Clone this repo, then add the server to your Claude Desktop config. Find it under **Settings → Developer → Edit Config**
(`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "vouchwall": {
      "command": "node",
      "args": ["/absolute/path/to/Vouchwall/mcp/server.mjs"],
      "env": {
        "VOUCHWALL_URL": "https://proof.yourdomain.com",
        "VOUCHWALL_TOKEN": "your-admin-token"
      }
    }
  }
}
```

On Windows, write the path with double backslashes, e.g. `"C:\\Users\\you\\Vouchwall\\mcp\\server.mjs"`.
Restart Claude Desktop afterwards.

### Skills in Claude.ai / Claude Desktop

The skills are the instructions that make Claude follow good practice: verbatim quotes, permission
checks, and when to ask. To add them, zip each folder inside `skills/` (for example `skills/testimonial-curation`
becomes `testimonial-curation.zip`). Upload each zip under **Settings → Capabilities → Skills**.

---

## Using it with Claude

Just ask in plain words. Claude picks the right skill and tools.

| You want to... | Try asking | Skill used |
|---|---|---|
| Get more testimonials | *"I want more video testimonials for my SEO audit service. Set up the form and write the email I'll send to clients."* | `testimonial-request` |
| Review what came in | *"What testimonials are waiting for review? Recommend what to do with each."* | `testimonial-curation` |
| Approve and organize | *"Approve Ann's and Marco's, tag them checkout, give each a highlight, and reject the spam."* | `testimonial-curation` |
| Add praise from elsewhere | *"A client emailed me this: '...'. Add it to Vouchwall."* or *"Import these 12 G2 reviews."* | `testimonial-curation` |
| Write marketing copy | *"Write a social proof section for my pricing page using testimonials tagged roi."* | `testimonial-repurpose` |
| Make content | *"Turn Ann Lee's testimonial into a case study draft and an Instagram carousel."* | `testimonial-repurpose` |
| Publish a wall | *"Create a carousel wall of my featured testimonials and give me the embed code."* | `vouchwall` |

**What Claude will always do**

- Quote customers **word for word**. It may trim with "…", but it never rewords, merges or "improves" a testimonial.
- **Ask before publishing** anything imported from a private email or DM. The server also refuses
  to approve imports without confirmed permission.
- **Recommend first, then act** when reviewing the inbox, unless you tell it to go ahead.
- Keep customer **emails out of its context** unless you ask for them.
- Flag **incentivized** testimonials so you can disclose them, and attribute stats to the customer who gave them.

These behaviors are checked by real-Claude tests. See [Live skill check](#live-skill-check-uses-your-claude-account).

---

## Embedding a wall on your website

Paste the embed code from **Walls & embeds** (or ask Claude for it) where the wall should appear:

```html
<div data-vouchwall="wall-of-love"></div>
<script src="https://proof.yourdomain.com/embed.js" async></script>
```

It works on any site that lets you add HTML: plain HTML, WordPress (Custom HTML block), Webflow (Embed element),
Framer, Shopify, Ghost, and React or Next.js. The widget renders inside a shadow root,
so your site's CSS can't break it.

You can override the wall's settings per embed:

| Attribute | Values | Example |
|---|---|---|
| `data-layout` | `grid`, `carousel`, `list` | `<div data-vouchwall="wall-of-love" data-layout="carousel"></div>` |
| `data-theme` | `auto`, `light`, `dark` | `data-theme="dark"` |
| `data-hide-header` | `true` | Hides the wall's title and subtitle |

You can embed several walls on one page. Each wall also has a shareable page at `https://proof.yourdomain.com/w/wall-of-love`.

---

## Reference

### MCP tools

| Tool | What it does |
|---|---|
| `vouchwall_stats` | Pending, approved, rejected and video counts, average rating, last 30 days, top tags |
| `list_testimonials` | Search and filter by status, form, tag, text, featured, rating. Emails hidden unless `include_email` |
| `get_testimonial` | One testimonial with answers, transcript and media links |
| `update_testimonial` | Approve or reject, set or add tags, feature, set a highlight or transcript. Warns if a highlight isn't verbatim |
| `import_testimonials` | Bulk import from email, review sites, LinkedIn, X, Slack. Lands as pending unless consent is confirmed |
| `list_forms` / `create_form` / `update_form` | Collection forms and their share links |
| `list_walls` / `create_wall` / `update_wall` | Walls, filters and embed code (filter updates merge) |
| `export_testimonials` | Markdown, CSV or JSON of approved testimonials for repurposing. Never includes emails |

### Skills

| Skill | Covers |
|---|---|
| `vouchwall` | Setup, troubleshooting, routing to the other skills, and the rules that never bend |
| `testimonial-request` | Who to ask and when, form setup, the request message and one follow-up |
| `testimonial-curation` | Inbox review, tags, verbatim highlights, video transcripts, imports with permission |
| `testimonial-repurpose` | Landing and pricing pages, posts, carousels, ads, emails, case study drafts, walls |

### HTTP API

**Public** (no auth; CORS-enabled so embeds work on any domain):

| Method & path | Purpose |
|---|---|
| `GET /c/:slug` | Collection form page |
| `GET /w/:slug` | Wall page |
| `GET /embed.js` | Embed widget |
| `GET /api/public/walls/:slug` | Approved testimonials for a wall (JSON) |
| `GET /api/public/forms/:slug` | Form settings |
| `POST /api/public/upload` | Upload a video or photo as the raw request body with its `Content-Type` (`video/webm`, `video/mp4`, `video/quicktime`, `image/png`, `image/jpeg`, `image/webp`). Returns `{ "file": "u_....webm" }` |
| `POST /api/public/forms/:slug/submit` | Submit a testimonial (JSON; `name` and `consent: true` required) |
| `GET /media/:file` | Uploaded media (public only once its testimonial is approved) |
| `GET /health` | Health check |

**Admin** (header `Authorization: Bearer <token>`; writes need `Content-Type: application/json`):

| Method & path | Purpose |
|---|---|
| `GET /api/admin/stats` | Counts and top tags |
| `GET /api/admin/testimonials?status=&form=&tag=&q=&featured=&min_rating=&limit=` | List and search |
| `POST /api/admin/testimonials` | Import one testimonial |
| `GET` / `PATCH` / `DELETE /api/admin/testimonials/:id` | Read, update, delete (deleting also removes its files) |
| `GET` / `POST /api/admin/forms`, `PATCH /api/admin/forms/:id` | Forms (`:id` may be the slug) |
| `GET` / `POST /api/admin/walls`, `PATCH /api/admin/walls/:id` | Walls (`:id` may be the slug) |

Example: list pending testimonials.

```bash
curl -H "Authorization: Bearer $VOUCHWALL_TOKEN" "https://proof.yourdomain.com/api/admin/testimonials?status=pending"
```

---

## Security and privacy

- **Consent:** customers must tick a consent box to submit. Imported testimonials can't be approved
  until you confirm you have permission to publish them.
- **Only approved content is public:** pending or rejected testimonials, and their videos and photos,
  need the admin token.
- **Emails stay private:** never shown on walls, never exported, and kept out of Claude's context by default.
- **Spam protection:** a hidden honeypot field, per-IP rate limits, file type checks and size limits.
- **Admin access:** the token is compared in constant time. The browser session uses an `HttpOnly`,
  `SameSite=Strict` cookie, and admin writes must be JSON, which blocks cross-site form attacks.
- **Safe rendering:** all customer content is escaped in pages and inserted as plain text in the widget.
- **Keep your admin token secret.** Anyone with it can manage your testimonials. To change it, set
  `VOUCHWALL_ADMIN_TOKEN` (or delete `data/admin-token`) and restart.

If you find a security issue, please open a GitHub issue without exploit details and ask for a private contact.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Lost the admin token | It's in `data/admin-token` (Docker: `docker compose exec vouchwall cat /data/admin-token`) |
| Claude says *"Can't reach Vouchwall"* | The server isn't running or `VOUCHWALL_URL` is wrong. Open `<your URL>/health` in a browser; it should say `{"ok":true}` |
| Claude says *"VOUCHWALL_TOKEN is not set"* or *"rejected VOUCHWALL_TOKEN"* | Set `VOUCHWALL_TOKEN` to the contents of `data/admin-token` ([how](#claude-code-plugin-with-mcp-server--skills)), then restart Claude |
| `/mcp` doesn't list `plugin:vouchwall:vouchwall` | Check `/plugin` shows Vouchwall as enabled, then restart Claude Code. Node 20+ must be on your PATH (`node --version`) |
| Share links or embed code show `localhost` | Set `VOUCHWALL_PUBLIC_URL` to your public address and restart |
| Video recording button does nothing | Browsers only allow the camera on HTTPS (or `localhost`). Serve Vouchwall over HTTPS. Customers can also upload a video file |
| Video uploads fail on a server | Raise your proxy's upload limit, e.g. Nginx `client_max_body_size 160m;` |
| "Too many submissions" | The rate limit is 30 per IP per 10 minutes; wait, or test from another network |
| Wall shows "No testimonials yet" | Only approved testimonials appear. Check the wall's filters (tags, featured only, minimum rating) in **Walls & embeds** |
| Port 3080 is in use | Start with another port: `PORT=4000 npm start` |

---

## Project structure

```
Vouchwall/
├── .claude-plugin/
│   ├── plugin.json          Plugin manifest + MCP server config
│   ├── marketplace.json     Lets people install it with /plugin marketplace add
│   └── icon.png
├── server/
│   ├── index.mjs            HTTP server, routes, auth, uploads
│   ├── store.mjs            JSON storage for forms, testimonials, walls
│   └── views.mjs            HTML for the form, wall and admin pages
├── public/
│   ├── admin.js             Admin dashboard
│   ├── collect.js           Collection form (text, video recording, upload)
│   ├── embed.js             Wall of Love widget
│   └── app.css
├── mcp/server.mjs           MCP server Claude uses (talks to the admin API)
├── skills/                  The 4 Claude skills (SKILL.md each)
├── test/
│   ├── app.test.mjs         Server, security and MCP tests
│   ├── skills.test.mjs      Each skill's workflow through the MCP tools
│   └── live/scenarios.mjs   Real-Claude skill check (opt-in)
├── Dockerfile
└── docker-compose.yml
```

---

## Development and tests

```bash
npm test
```

There are 17 tests. They start a real server, drive it over HTTP, and run the MCP server over stdio
against it the same way Claude does. `test/skills.test.mjs` walks each skill's workflow step by step
through the MCP tools.

To work on it locally, run `npm start` and open <http://localhost:3080/admin>. Restart the server after
changing files in `server/`. Changes in `public/` show after a hard reload (Ctrl+F5); browsers cache
`/embed.js` and `/static/*` for up to 5 minutes.

### Live skill check (uses your Claude account)

```bash
node test/live/scenarios.mjs
```

This runs six real requests through Claude Code (`claude -p`) with the plugin loaded, each against a
fresh seeded instance. It checks that the right skill loads and that Claude behaves correctly: quotes stay
verbatim, nothing is published without permission, emails don't leak, and setup errors are explained.
It needs a signed-in Claude Code CLI. Pass `--claude <path>` if `claude` isn't on your PATH, or pass
scenario names (such as `inbox-review repurpose-pricing`) to run only some. Run it after editing any skill.

---

## Roadmap

- Automatic video transcripts with local Whisper
- Import from Google, G2, Trustpilot and Product Hunt by URL
- Send requests and reminders by email from the dashboard (SMTP)
- Shareable testimonial images for social posts
- Multiple users and workspaces

## Contributing

Issues and pull requests are welcome.

1. Fork the repo and create a branch.
2. Make your change, and run `npm test`. If you changed a skill, also run the live skill check.
3. Open a pull request describing what changed and why.

Please keep the project dependency-free unless there's a strong reason.

## License

[MIT](LICENSE) © Dhaval Rana
