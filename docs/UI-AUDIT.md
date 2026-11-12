# UI and responsive verification

Verified on 12 November 2026 using an installed local Chromium and synthetic fixture data. No provider or existing user session was contacted.

| Surface | Checks | Result |
| --- | ---: | --- |
| Local app | 107 | All passed |
| Landing and HTML pages | 156 | All passed |

Both audits cover 360, 390, 768, 1024, 1440, and 1920 pixel viewport widths. Reports and captures are generated under ignored `output/workspace-audit/` and `output/site-audit/`.

The app audit exercises stable loading, successful bootstrap, unavailable and malformed responses, an eight-second hung-startup timeout, retry without reload, blocked browser storage, Settings navigation, notifications/activity, a reminder datetime picker, light/dark themes, Agents disclosure, task/finding forms, Role selection, automation/plan access, discovery, and saved transcripts. It checks overflow and uncaught browser errors during those flows.

The site audit visits all eight HTML pages at each viewport width, checks headings/IDs/overflow, and exercises FAQ expansion, keyboard-driven demo tabs, themes, scroll reveals, a local issue draft, and unchecked setup acknowledgment. The tested flows make no external HTTP requests.

Visual inspection included desktop/mobile app conversations, Settings, startup, the landing hero/product view, documentation, contact, light mode, and the setup dialog. Defects addressed include hidden mobile Agents controls, an inherited fixed conversation height, Role-dropdown positioning, duplicate navigation/notifications, and scroll timing affecting setup-dialog clicks.

These checks are not instrumented frontend line/branch coverage, a screen-reader certification, or a claim about every browser/device. Backend line coverage is reported independently in [COVERAGE.md](COVERAGE.md).

Run the fixture server and site preview in separate terminals, then `npm run audit:ui`. Existing browser installation is required; the scripts do not download test tooling.
