# Documentation presentations

Open Code should not treat the generated paper as the only way to explain a project. The card graph is the source of truth, and documentation is a presentation layer over that graph.

## Presentation modes

| Mode | Best for | Output |
| --- | --- | --- |
| Paper | Narrative review and design reasoning | Markdown |
| Spec | Implementation contracts, dependencies, files, and conflicts | Markdown |
| Roadmap | Status review and sequencing | Markdown |
| Agent handoff | Briefing the next coding or merge agent | Markdown |
| Website | Stakeholder or human review with visual sections | In-app website view |

## Product rules

- Cards, topics, dependencies, linked files, conflicts, and agent runs remain the canonical data.
- A presentation mode must not mutate card logic.
- Human logic conflicts must appear in every presentation, even if the layout changes.
- Website presentation is not a marketing page; it is a clear visual review surface for the current project logic.
- Generated Markdown remains useful for GitHub review and commit history.

## MVP behavior

The browser preview now includes a documentation selector with paper, spec, roadmap, handoff, and website modes. The website mode renders a structured visual presentation from the same in-memory project object instead of hand-authored HTML.

## Native app path

The Tauri app should use the same modes when saving or exporting logic:

- `logic/open-code.paper.md` remains the default long-form file.
- Additional exports can be generated later as `logic/open-code.spec.md`, `logic/open-code.roadmap.md`, `logic/open-code.handoff.md`, and a static website folder.
- The website export should be static HTML/CSS generated from the project graph, with no server requirement.

## Agent guidance

When an agent edits documentation behavior, it should update:

- the presentation renderer
- the UI selector or export command
- tests that prove each presentation uses the same card graph
- this document when a new presentation mode is added
