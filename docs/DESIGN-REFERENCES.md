# Design references

Connect's original app interface uses task-focused hierarchy, readable controls, consistent spacing, and progressive disclosure. Microsoft's [Fluent 2 design principles](https://fluent2.microsoft.design/design-principles) informed the emphasis on clarity and focus; no Fluent implementation or component package is redistributed.

The marketing and documentation site uses an original editorial layout, a restrained navy/mint palette, local system fonts, consistent page navigation, and a clearly labeled illustrative product view. See [site design](../site/DESIGN.md) for its actual tokens and layout choices.

No externally hosted fonts, analytics, image CDNs, UI registries, or animation services are required at runtime. Original React controls replace the previously requested restricted components. The current dependency licenses are reproduced in [third-party notices](../THIRD_PARTY_NOTICES.md).

The app keeps a single Settings entry, with General, Notifications, and Activity sections. Agents can be hidden to focus on the conversation; automation options are initially collapsed. Keyboard navigation, visible focus, reduced-motion preferences, honest delivery statuses, and recoverable loading states take precedence over decorative motion.
