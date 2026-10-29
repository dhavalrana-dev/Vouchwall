---
name: testimonial-curation
description: Review, organize and add testimonials in Vouchwall, including the pending inbox, approve/reject suggestions, tags by theme, verbatim highlights, video transcripts, and importing praise from emails, review sites, LinkedIn, X, Slack or DMs (with the permission check before publishing). Use whenever the user wants to add, save or publish a testimonial, review or kind words someone sent them, e.g. "a client emailed me this", "add this review", "put this on my wall", "save this feedback", "import my G2 reviews", or to manage what came in, e.g. "review my testimonials", "approve these", "tag my testimonials", "pick the best quotes", "transcribe this video testimonial".
---

# Curate testimonials

## Review the inbox

1. `list_testimonials` with `status: "pending"`.
2. For each, recommend approve or reject with a one-line reason. Reject spam, abuse, empty
   submissions, and anything naming a third party negatively. Don't reject honest but lukewarm
   ones on your own; flag them and let the user decide.
3. Suggest **tags** by theme and audience so walls can filter, e.g. `onboarding`, `support`,
   `roi`, `ease-of-use`, `agency`, `ecommerce`, `vs-competitor`. Reuse tags already in use
   (`vouchwall_stats` → `top_tags`) before making new ones.
4. Suggest a **highlight**: the strongest phrase, copied verbatim, under ~140 characters. Prefer
   specifics (numbers, before/after, named outcome) over adjectives ("amazing", "great").
5. Suggest **featured** for the 1–3 most specific, credible ones (full name + role + concrete result).

Show it all as a table and apply with `update_testimonial` **only after the user agrees**.
If the result has `warnings` (a highlight that isn't verbatim), fix the highlight to the
customer's exact words and update again.

## Video testimonials

Claude can't watch the video. If the user pastes a transcript (from YouTube, Descript,
Whisper, or their phone's captions), save it with `update_testimonial` `transcript`, then pick a
highlight from it. The transcript feeds search, exports and repurposing.

## Import from elsewhere

When the user pastes reviews, emails, LinkedIn recommendations, tweets or Slack messages:

1. Extract each into `name`, `text` (verbatim), `title`, `company`, `rating` (only if stated),
   `source`, `source_url`, `created_at` (original date if known).
2. Show the parsed list for a quick check.
3. Ask: "Do you have permission to publish these?" Public reviews (G2, Google, Trustpilot) and
   LinkedIn recommendations are generally fine to quote with a link; private emails and DMs need the
   author's OK.
4. `import_testimonials`. Set `consent: true, status: "approved"` only for the ones the user
   confirmed; leave the rest pending.

Never correct a customer's grammar or wording inside `text`. If a typo hurts readability, the
user can fix it with the author's OK.
