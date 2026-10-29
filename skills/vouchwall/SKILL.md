---
name: vouchwall
description: Collect, manage and publish customer testimonials with a self-hosted Vouchwall instance (open-source alternative to Senja and Testimonial.to). Use when the user mentions testimonials, reviews, social proof, "wall of love", "collect testimonials", "video testimonials", "customer quotes", "case study quotes", "embed reviews on my site", Senja, Testimonial.to, or wants to set up, check or use Vouchwall. Routes to testimonial-request (asking customers), testimonial-curation (reviewing and tagging) and testimonial-repurpose (turning testimonials into copy).
---

# Vouchwall

Vouchwall runs on the user's own server. Customers write or record a testimonial on a
collection form; the user approves it; approved testimonials show on walls that embed anywhere.
The `vouchwall` MCP server talks to that instance's admin API.

## Pick the workflow

| The user wants to... | Use |
|---|---|
| Get more testimonials, write the ask, decide who and when to ask | **testimonial-request** |
| Review the inbox, approve, tag, pick highlights, transcribe videos, import from elsewhere | **testimonial-curation** |
| Use testimonials in a landing page, post, ad, email, sales deck or case study | **testimonial-repurpose** |
| Put a Wall of Love on their site | `create_wall`, then give them the `embed` snippet |

## First run

If tools fail with "Can't reach Vouchwall", "VOUCHWALL_TOKEN is not set" or "rejected
VOUCHWALL_TOKEN", walk the user through setup:

1. Start the server from the cloned repo: `npm start` (Node 20+) or `docker compose up -d` (see README).
2. Copy the admin token printed on first start (also saved in `data/admin-token`).
3. Set `VOUCHWALL_URL` (e.g. `https://proof.example.com`) and `VOUCHWALL_TOKEN` in the environment Claude runs in, then restart Claude.

Then `create_form` for their product and give them the share link.

## Tools

`vouchwall_stats` · `list_testimonials` · `get_testimonial` · `update_testimonial` ·
`import_testimonials` · `list_forms` · `create_form` · `update_form` · `list_walls` ·
`create_wall` · `update_wall` · `export_testimonials`

## Rules that never bend

1. **Never invent, merge or improve a testimonial.** Quote customers word for word. Trimming
   with an ellipsis is fine; changing meaning, adding claims or fixing their opinion is not.
2. **Never fabricate a name, title, company, rating or photo.** If it's missing, leave it missing.
3. **Publish only with permission.** Form submissions include consent. Imported ones don't:
   ask the user before passing `confirm_permission: true`.
4. **Keep emails private.** Only request `include_email` when the user needs to contact someone.
5. **Disclose incentives.** If customers got a discount or gift for reviewing, say so wherever
   the testimonial is used (FTC endorsement guides in the US, ASA/CMA in the UK).
