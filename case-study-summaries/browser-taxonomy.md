# Recommended Browser Taxonomy

This is a smaller, browser-oriented facet set derived from the full case study corpus. It is intended to replace or sit alongside the noisier raw `categories` and `key_themes` fields.

## Recommended facets

- `sector`: broad institutional context
- `browser_use_cases`: what the case study is mainly for
- `browser_ai_roles`: how the AI behaves in the workflow
- `browser_audience`: who benefits most directly
- `browser_guardrails`: what caveats matter when browsing examples
- `tools`: keep as a secondary filter, but grouped or deduped in the UI

## Use Cases

- Administration & Operations: 28
- Research & Scholarship: 27
- Teaching, Learning & Assessment: 26
- Coding, Automation & Tool Building: 19
- Analysis, Review & Decision Support: 9
- Search, Knowledge Access & Discovery: 7
- Writing, Communication & Content: 5

## AI Roles

- Coding & Building: 33
- Analysis & Review: 30
- Drafting & Editing: 20
- Tutoring & Coaching: 18
- Search & Knowledge: 16
- Workflow Automation: 4

## Audience

- Researchers: 26
- Educators: 17
- Professional Services Staff: 17
- Students: 16

## Guardrails

- Human review required: 22
- Accuracy limitations: 14
- Pedagogical or integrity concerns: 9
- Privacy or security sensitive: 3

## Suggested UI approach

- Put `sector` and `browser_use_cases` first. They will do most of the navigation work.
- Keep `tools` as an optional advanced filter, because tool names are less stable than workflow patterns.
- Show `browser_ai_roles` and `browser_guardrails` as badges on cards rather than mandatory filters.
- Use raw `categories` only as hidden metadata or search terms, not as top-level chips.

