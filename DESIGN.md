---
name: Connect
description: A local collaboration workspace for coding agents.
colors:
  ground: "#0b0e16"
  surface: "#10141f"
  raised: "#161c2a"
  border: "#242c3d"
  text: "#e9edf6"
  muted: "#939fb5"
  primary: "#a4b1ff"
  live: "#71dfd3"
typography:
  headline:
    fontFamily: "Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
  body:
    fontFamily: "Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
  code:
    fontFamily: "Cascadia Code, Consolas, monospace"
rounded:
  control: "7px"
  surface: "12px"
spacing:
  compact: "8px"
  control: "12px"
  group: "16px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ground}"
    rounded: "{rounded.control}"
  input:
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
---

## Overview

Connect uses a futuristic visual language requested by the user, with familiar task-oriented navigation. A dark navy shell, cool periwinkle actions, mint live states, and restrained motion keep agent status and project conversations legible. This is an operating interface: controls and diagnostic evidence carry more weight than decorative effects.

## Colors

The CSS custom properties in `public/style.css` own the ground, surface, raised, border, text, muted, accent, and cyan values recorded above. Raised blue surfaces distinguish menus and input areas. Pink marks failures and destructive actions; it does not imply that an old error is a newly failed attempt. Provider glyphs distinguish Claude's warm tone from Codex's green tone.

## Typography

Segoe UI Variable and platform sans fallbacks provide the normal application text. Cascadia Code and Consolas are reserved for paths, source, identifiers, and technical details. Project headings use the recorded 28px headline; the interface uses smaller title, body, and metadata roles. Conversation text wraps naturally, and long paths are constrained or wrapped within their containing region.

## Layout

Desktop has a fixed 232px project sidebar, a flexible central conversation, and a right-hand agent roster. The roster moves below the conversation on smaller screens; the sidebar becomes a compact icon rail. Main and nested flex/grid children must keep `min-width: 0` so long project names do not create horizontal scrollbars.

Forms use a two-column desktop grid with full-width descriptions, messages, and actions where appropriate, collapsing to one column on mobile. Notification preferences use a compact grid. Dialogs constrain their height to the viewport and scroll in one content region. Discovery shows bounded batches with filters, search, and last-active dates. Mobile captures must include the actual conversation and composer, not only the welcome screen.

## Elevation & Depth

Resting app regions are separated by thin borders and tonal changes. Custom popovers add a downward soft shadow (`0 18px 45px -16px #000c`). Focus belongs to the active control or its outer container, never two competing outlines. Original Connect effects are contained within their component region and respect reduced-motion preferences.

## Shapes

Controls use compact rounded corners; larger surfaces use the recorded 12px family. Provider marks and the Connect glyph are authored SVG geometry. Pill shapes are reserved for small status controls and the selected Original Connect actions. Dialog close controls sit at the top-right of the content area.

## Components

ChatComposer is the original chat composer. Its controlled draft survives failed sends. File chips represent actual local uploads, not pretend provider attachments. SegmentedTabs switches project Conversation, Tasks, and Findings views. AnimatedCheck marks task completion and preferences. ProgressLine and ActivityLoader indicate actual work/loading, without exposing hidden model reasoning.

SwipeToast carries brief notices and errors. Detailed diagnosis and recovery live in animated dialogs; historical failures remain explicitly distinguishable from new attempts. BellToggle controls notification preferences. FuseButton gives archive actions a visible undo interval; deleting Connect history requires a separate confirmation. WarmTooltip provides hover/focus help without browser-default `title` tooltips.

Custom AnimatedSelect provides styled dropdowns with optional search and keyboard navigation. The date/date-time calendar and time lists are custom popovers. Semantic buttons and inputs remain underneath; visible browser-default select/date widgets are not used.

## Do's and Don'ts

- Do preserve clear keyboard focus, accessible names for compact navigation, and reduced-motion support.
- Do load generated component CSS and application CSS directly with the same content version as the script.
- Do keep status language tied to real delivery outcomes and show recovery actions for failures.
- Don't treat a saved transcript or recent modification as proof that a native session is running.
- Don't hide required content to eliminate scrollbars; contain overflow at the correct level.
- Don't render peer messages as HTML or place secrets in tooltips, toast details, or browser storage.

## Simplified workspace
Notifications and recent activity live inside Settings. The main room shows its conversation and composer, with an optional Agents panel. Automation is collapsed by default; pending assistance remains visible. Startup has explicit loading, timeout, error, and retry states. App controls remain legible from360px through1920px. The marketing site uses its own documented editorial system in site/DESIGN.md.
