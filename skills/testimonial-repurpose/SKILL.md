---
name: testimonial-repurpose
description: Turn approved Vouchwall testimonials into marketing copy and assets like social proof sections for homepage, pricing and landing pages, social posts and carousels, ad copy, email snippets, sales one-pagers, case study drafts and Wall of Love embeds. Use whenever copy should quote or draw on the user's testimonials, reviews or customer quotes, e.g. "write a social proof section", "testimonials for my pricing page", "use my testimonials", "make a post from this review", "testimonial carousel", "case study from this customer", "proof for my ads", "best quotes for the homepage", or "embed testimonials on my site".
---

# Repurpose testimonials

## 1. Pull the right proof

`export_testimonials` (markdown) filtered to the job: `tag` for the topic, `min_rating`,
`featured`, or `q` for a keyword. Match proof to the claim it supports:

| Where it goes | Pick testimonials that… |
|---|---|
| Hero / above the fold | Name the core outcome, with full name + role |
| Pricing page | Talk about value, ROI, "worth it" |
| Feature section | Mention that specific feature |
| Objection handling | Start with a doubt: "I wasn't sure…, but…" |
| Ads | Short, specific, about the result |
| Sales deck / one-pager | Match the prospect's industry or size |

## 2. Write the asset

Quote verbatim. Trim with "…" only where it doesn't change meaning, and attribute every
quote (name, role, company as given). Never stitch two customers into one quote.

- **Landing page section:** headline written by you; 3–6 testimonials verbatim; highlight in bold.
  Or a wall: `create_wall` filtered by tag, then hand over the `embed` snippet.
- **Social post / carousel:** one testimonial per post or slide. Your hook on top, their words as
  the body, your CTA last. If the `ig-carousel`, `social` or `ad-creative` skills are installed,
  follow their format rules.
- **Ad copy:** testimonial as primary text, outcome in the headline. Testimonial ads must reflect
  typical results; if the quote is an outlier ("10x revenue"), the user needs a typical-results
  disclosure.
- **Email:** one testimonial per email, placed right before the CTA.
- **Case study draft:** use one customer's testimonial, answers and transcript for
  *before → what they tried → what changed → result*. Mark every gap with `[ASK CUSTOMER: …]`
  instead of filling it. The user sends the draft to the customer for approval before publishing.

## 3. Check before handing over

- Every quote matches the stored text exactly (apart from marked trims).
- Every claim in your own copy is supported by a testimonial you cited.
- Incentivized testimonials carry the disclosure.
- No emails or private details leaked into the asset.
