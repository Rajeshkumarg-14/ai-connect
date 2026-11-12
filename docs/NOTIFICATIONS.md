# Notifications and saved-session controls

Notification settings and reminder schedules are stored in `.connect/state.json`. They belong to this local Connect installation and do not change Claude Code or Codex settings.

## Defaults and channels

Notifications are enabled by default for managed-agent replies and errors, with in-app delivery enabled. Browser notifications and sound are off until selected in the interface. The backend never asks for OS or browser notification permission. Browser permission must be granted through the interface before browser alerts can appear.

The global settings include enable/disable, in-app, browser, sound, reply alerts, error alerts, and quiet hours. Disabling in-app alerts prevents new records from being added to the in-app notification history; it does not erase old records. SSE events carry the chosen channel flags so the interface can independently honor browser and sound settings. History retains the most recent 200 in-app notifications, with read/unread state.

Quiet hours default to off. Their initial window is 22:00–08:00 in `Asia/Kolkata`. Select another valid timezone when needed. The window can cross midnight. If start and end are equal, the whole day is quiet. Managed reply/error alerts occurring during quiet hours are suppressed; they are not replayed afterward.

## Per-session bells

Managed-agent bell settings use the Connect agent ID. Native discovered-session settings use the stable provider-prefixed ID, for example `claude:<session-id>`. A per-session mute takes precedence over global reply/error alerts.

Native transcript monitoring requires an explicit enabled bell setting. Connect does not poll every discovered transcript automatically. Enabling a native bell establishes a baseline, then checks a bounded latest-message window every 15 seconds while the server runs. At most 20 native sessions can be monitored simultaneously. Only new visible assistant messages produce alerts; historical messages, user messages, tools, and reasoning do not. Multiple new assistant messages in a single poll produce one alert for the latest reply. If the saved cursor falls outside the bounded read window, Connect establishes a new baseline instead of presenting old text as a fresh reply. Native monitoring can therefore miss intermediate replies during a long pause or a very busy session.

Archived native sessions are not polled. A global notification pause also pauses native polling. Nothing is written to native transcript files, session registries, or original agent settings.

## Custom reminders

Create a custom reminder with a title, message, and future date/time. The interface converts the selected date/time to an ISO timestamp with timezone information. Up to 100 reminders can be saved. Reminders can be edited, disabled, or deleted.

The local Connect server must be running to deliver a reminder. This feature does not register a Windows scheduled task, Codex automation, or cloud job. A due reminder is delivered after Connect next runs if it was offline at the scheduled time. Disabled global notifications and quiet hours defer delivery until notifications are allowed. Each reminder persists its fired state before delivery and will not be replayed on restart. Rescheduling a reminder to a new future time resets that fired state.

## Archive, restore, and delete

Archiving a Connect room stops its managed workers, disables automatic replies, and preserves its history. Archived rooms cannot launch new turns until restored. Restoring a room does not resume workers or replay saved messages automatically.

Archiving a discovered native session hides it within Connect only. Its Claude Code or Codex transcript and live process remain untouched. Restoring it removes that Connect visibility override.

Deleting a room requires its exact name as confirmation. It stops its managed workers and removes only that room's Connect agents, messages, tasks, findings, and notification records. It does not delete project files, native sessions, or provider history.
