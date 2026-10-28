# Vouchwall

**Open-source, self-hosted alternative to Senja and Testimonial.to, built to be run from Claude.**

Collect text and video testimonials, approve them, and embed a Wall of Love on any website.
Then let Claude do the work most people never get to: asking customers at the right moment,
tagging and picking the best quotes, and turning them into landing-page proof, posts, ads and
case studies.

| | Senja / Testimonial.to | Vouchwall |
|---|---|---|
| Price | $29–$59+/month | Free, MIT |
| Your data | Their servers | Your server, one JSON file + an uploads folder |
| Video testimonials | ✓ | ✓ (recorded in the browser, up to 2 min, or uploaded) |
| Wall of Love embed | ✓ | ✓ (grid, carousel or list; light/dark/auto) |
| AI | Built-in, their model | Claude, via MCP + 4 skills |
| Dependencies | — | **None.** Node 20+ only |

## How it works

1. **Collect:** share a form link (`/c/your-product`). Customers write a testimonial or record a
   video, add a rating, photo and role, and tick consent.
2. **Curate:** approve, reject, tag, feature, and set a highlight quote in the dashboard (`/admin`),
   or ask Claude to go through the inbox.
3. **Publish:** create a wall and paste two lines on your site:

   ```html
   <div data-vouchwall="wall-of-love"></div>
   <script src="https://proof.example.com/embed.js" async></script>
   ```

   The widget renders in a shadow root, so your site's CSS can't break it. Each wall also has its own page at `/w/wall-of-love`.

## Run the server

```bash
git clone https://github.com/YOUR-GITHUB-USER/vouchwall.git
```

```bash
cd vouchwall && npm start
```

Open http://localhost:3080/admin. The **admin token** is printed on first start and saved to
`data/admin-token`.

### Docker

```bash
VOUCHWALL_PUBLIC_URL=https://proof.example.com docker compose up -d
```

```bash
docker compose logs vouchwall
```

The second command shows the generated admin token. Put it behind any HTTPS reverse proxy (Caddy, Nginx, Coolify, Railway, Render, Fly).

### Settings

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3080` | HTTP port |
| `VOUCHWALL_DATA` | `./data` | Where `vouchwall.json` and uploads live; back this up |
| `VOUCHWALL_PUBLIC_URL` | from request | Public base URL used in share links and embed code |
| `VOUCHWALL_ADMIN_TOKEN` | generated | Set your own admin token |

## Use it from Claude

### Claude Code (plugin: MCP server + skills)

```bash
/plugin marketplace add YOUR-GITHUB-USER/vouchwall
```

```bash
/plugin install vouchwall@vouchwall
```

Then set where your instance lives and its token, in the shell that starts Claude:

```bash
export VOUCHWALL_URL=https://proof.example.com VOUCHWALL_TOKEN=your-admin-token
```

### Claude Desktop or any MCP client

```json
{
  "mcpServers": {
    "vouchwall": {
      "command": "node",
      "args": ["/absolute/path/to/vouchwall/mcp/server.mjs"],
      "env": { "VOUCHWALL_URL": "https://proof.example.com", "VOUCHWALL_TOKEN": "your-admin-token" }
    }
  }
}
```

To use the skills in Claude.ai or Claude Desktop, zip each folder in `skills/` and upload it under **Settings → Capabilities → Skills**.

### Things to ask Claude

> Set up a testimonial form for my Shopify migration service and write the ask for clients who finished this month.

> Go through my pending testimonials. Approve the good ones, tag them, and pick a highlight for each.

> Here are 12 G2 reviews and 3 emails from clients. Import them.

> Build the social proof section for my pricing page from testimonials tagged roi.

> Turn Ann Lee's testimonial into a case study draft and an Instagram carousel.

### MCP tools

| Tool | Does |
|---|---|
| `vouchwall_stats` | Pending/approved/video counts, average rating, top tags |
| `list_testimonials` / `get_testimonial` | Search and read (emails hidden unless asked) |
| `update_testimonial` | Approve/reject, tags, feature, highlight, transcript |
| `import_testimonials` | Bulk import from email, review sites, LinkedIn, X, Slack |
| `list_forms` / `create_form` / `update_form` | Collection forms and share links |
| `list_walls` / `create_wall` / `update_wall` | Walls and embed snippets |
| `export_testimonials` | Markdown, CSV or JSON for repurposing |

### Skills

| Skill | For |
|---|---|
| `vouchwall` | Setup, routing, and the rules (never invent or reword a testimonial) |
| `testimonial-request` | Who to ask, when, and the message + one follow-up |
| `testimonial-curation` | Inbox review, tags, verbatim highlights, transcripts, imports |
| `testimonial-repurpose` | Landing pages, posts, carousels, ads, emails, case study drafts |

## Trust and safety built in

- Customers must tick consent before submitting. Imported testimonials can't be approved until
  you confirm you have permission.
- Only **approved** testimonials (and their media) are ever public. Pending videos and photos
  need the admin token.
- Emails are never shown on walls, never exported, and kept out of Claude's context unless you ask.
- A honeypot field and per-IP rate limits block spam. Uploads are type-checked and size-capped (150 MB video, 3 MB image).
- Admin cookie is `HttpOnly` + `SameSite=Strict`; admin writes must be JSON (CSRF-safe).
  The token is compared in constant time.
- All user content is escaped in HTML and rendered as text in the widget.

## API

Public (CORS-enabled for embeds): `GET /api/public/walls/:slug`, `GET /api/public/forms/:slug`,
`POST /api/public/upload`, `POST /api/public/forms/:slug/submit`.

Admin (`Authorization: Bearer <token>`): `/api/admin/stats`, `/api/admin/testimonials[/:id]`,
`/api/admin/forms[/:id]`, `/api/admin/walls[/:id]`.

## Development

```bash
npm test
```

The tests start a real server and drive it over HTTP. They also run the MCP server over stdio
against it, the same way Claude does.

## Roadmap

- Automatic video transcripts with local Whisper
- Import from Google, G2, Trustpilot and Product Hunt by URL
- Email requests and reminders from the dashboard (SMTP)
- Shareable testimonial images for social posts
- Multiple users and workspaces

PRs welcome.

## License

MIT
