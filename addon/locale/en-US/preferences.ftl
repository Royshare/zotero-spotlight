pref-shortcut-section = Shortcuts
pref-shortcut-search-label = Open Spotlight search
pref-shortcut-command-label = Open command mode
pref-shortcut-mod-p = { PLATFORM() ->
        [macos] ⌘+P
       *[other] Ctrl+P
    }
pref-shortcut-mod-shift-p = { PLATFORM() ->
        [macos] ⌘+⇧+P
       *[other] Ctrl+Shift+P
    }
pref-shortcut-mod-k = { PLATFORM() ->
        [macos] ⌘+K
       *[other] Ctrl+K
    }
pref-shortcut-mod-o = { PLATFORM() ->
        [macos] ⌘+O
       *[other] Ctrl+O
    }
pref-shortcut-off = Off
pref-shortcut-conflict-note = Choosing a shortcut already in use swaps the two assignments.
pref-results-section = Results
pref-results-limit = Results limit

pref-window-section = Window Size
pref-window-height = Height (px)
pref-window-width = Width (px)
pref-search-section = Search
pref-search-annotations = Search annotations
pref-restore-search = Restore last search when reopening Spotlight
pref-show-filter-hint-bar = Show filter hint bar
pref-priority-section = Default Search Scope
pref-priority-hint = Choose which libraries are searched by default. Unchecked libraries are excluded from results, but you can still reach everything from the search itself - `:col query` always searches every collection in every library. Optionally keep deselected libraries searchable at a lower rank.
pref-priority-libraries-label = Libraries searched by default
pref-priority-unlisted = Keep deselected libraries searchable with lower priority
pref-priority-tiers-label = Result type tiers (1 = highest)
pref-priority-advanced = Advanced: edit raw JSON
pref-priority-status-valid = Saved. New searches use these settings.
pref-priority-status-invalid = Invalid JSON - changes were not saved.
pref-reset-defaults = Reset to defaults
