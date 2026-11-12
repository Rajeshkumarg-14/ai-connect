# Connect site design

This site uses an original, dependency-free product and documentation design. It is part of the project's MIT-licensed source.

## Product presentation

Lead with the actual job: bring independent coding agents into one project. The first viewport pairs a concise explanation with an explicitly illustrative task, implementation, and review record. The interactive workspace remains a labelled illustration and never starts an agent.

Use a small number of substantial regions instead of repeated feature cards: product demonstration, workflow, operating boundaries, verification, questions, and setup. Creator links and publication status remain factual.

## Tokens

- Dark background `#10151d`; surface `#151d29`; text `#edf2f6`; secondary text `#a3b0c0`; rules `#303d4e`; primary action `#add9ce`.
- Light background `#f5f7f8`; surface `#ffffff`; text `#182535`; secondary text `#536476`; rules `#ced8df`; primary action `#245c4e`.
- System UI typography for dependable offline rendering. Body text is 15–16 px on desktop and 14–15 px on mobile. Headings use moderate contrast and a maximum 62 px display size.
- A 1,200 px content width, 80 px combined desktop margins, and 30–36 px combined mobile margins. Content grouping follows consistent 4 px increments where practical.
- Small controls use 5–7 px radii. Product frames use 10 px. Rules define structure; shadows are limited to the primary product illustration.

## Documentation

All generated HTML pages use the same header, footer, theme controls, navigation, and reading measure. Desktop documentation has a persistent left navigation and an in-page contents list. Mobile replaces that rail with a wrapping navigation row. Forms use a two-column desktop grid and a single mobile column.

## Interaction and accessibility

Preserve visible keyboard focus, semantic links and buttons, tab keyboard navigation, native dialog focus management, labelled forms, and a skip link. Theme choice is browser-local. Reveals only affect below-the-fold content and respect reduced motion. FAQ answers, report drafting, clipboard actions, and setup acknowledgment use local browser APIs without network requests.

No external assets, analytics, fonts, runtime libraries, or background service calls are required. Ordinary creator links only navigate when selected. Independent provider CLIs have their own network behavior, separate from this static site.
