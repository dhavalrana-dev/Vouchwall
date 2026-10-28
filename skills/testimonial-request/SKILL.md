---
name: testimonial-request
description: Get more testimonials. Decides who to ask and when, sets up the right Vouchwall collection form, and writes the request message (email, DM, in-app, WhatsApp, post-call) plus one follow-up. Use when the user says "ask for testimonials", "get reviews", "I need social proof", "write a testimonial request", "nobody leaves reviews", "collect video testimonials", or "how do I ask clients for a testimonial".
---

# Ask for testimonials

## 1. Pick the moment

The best time is right after the customer gets a result, not after they pay. Ask the user what
"success" looks like for their customers and suggest a trigger:

| Business | Ask right after… |
|---|---|
| SaaS | First key outcome (first report sent, first invoice paid), or an NPS of 9–10 |
| Agency / freelancer | Project handoff with results, or the first metric win |
| Course / coaching | Module finished, or the student posts a win |
| E-commerce | 7–14 days after delivery |
| Community / creator | Someone thanks you publicly or in DMs |

People who already praised you (support chats, DMs, Slack, emails) are the easiest yes. Ask
for those words directly: "Can I share what you said here?"

## 2. Set up the form

`list_forms`; if none fits, `create_form` with:

- `name` the product or service.
- `prompt` that asks for a story, not a rating: "What was going on before you found us, and what changed?"
- `questions` (2–3 max) that pull specifics, e.g.
  - "What were you using or doing before?"
  - "What result can you point to? A number helps."
  - "Who would you recommend this to?"
- `collect_video: true` unless the user only wants text. Video is optional for customers.

## 3. Write the ask

Short, personal, and makes it easy to say yes. Draft in the user's voice:

- Their first name and the specific win ("since the Shopify migration your checkout errors dropped").
- One sentence on why it matters ("it helps other founders decide if we're a fit").
- The form link. Time it: "takes 2 minutes; video is optional".
- An easy out ("no worries if not").

Give versions for the channels they use (email, LinkedIn/IG DM, WhatsApp, in-app). Add one
follow-up for 4–5 days later, shorter than the first. Never more than one follow-up.

No incentive by default. If the user offers one (discount, gift), it must be given for an
**honest** review, not a positive one, and disclosed where the testimonial is shown.

## 4. Close the loop

Tell the user the next step: share the link, then come back to **testimonial-curation** when
submissions arrive (`vouchwall_stats` shows pending count).
