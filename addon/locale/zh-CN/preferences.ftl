pref-shortcut-section = 快捷键
pref-shortcut-search-label = 打开 Spotlight 搜索
pref-shortcut-command-label = 打开命令模式
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
pref-shortcut-off = 关闭
pref-shortcut-conflict-note = 选择已在使用的快捷键时，两个操作的快捷键会自动交换。
pref-results-section = 结果限制
pref-results-limit = 结果数量上限

pref-window-section = 窗口尺寸
pref-window-height = 高度 (px)
pref-window-width = 宽度 (px)
pref-search-section = 搜索
pref-search-annotations = 搜索批注
pref-restore-search = 重新打开 Spotlight 时恢复上一次搜索
pref-show-filter-hint-bar = 显示过滤提示栏
pref-priority-section = 默认搜索范围
pref-priority-hint = 选择默认搜索哪些图书馆。未勾选的图书馆不会出现在结果中，但您仍可在搜索中访问全部内容——`:col 关键词` 始终搜索所有图书馆中的全部分类。也可以让未勾选的图书馆保持可搜索但排名较低。 可用 "matching": {"mode": "field", "typoDistance": 1, "minTokenLength": 4} 调整单词匹配；设为 "loose" 可恢复旧的整条记录模糊匹配。
pref-priority-libraries-label = 默认搜索的图书馆
pref-priority-unlisted = 未选中的图书馆仍可搜索，但优先级较低
pref-priority-tiers-label = 结果类型层级（1 = 最高）
pref-priority-advanced = 高级：直接编辑 JSON
pref-matching-label = 单词匹配
pref-matching-mode = 匹配模式
pref-matching-mode-field = 字段（整词匹配，容忍拼写错误）
pref-matching-mode-loose = 宽松（旧版整条记录模糊匹配）
pref-matching-typo = 拼写错误容忍度
pref-matching-minlen = 拼写容错适用的最短单词长度
pref-priority-status-valid = 已保存。新的搜索将使用这些设置。
pref-priority-status-invalid = JSON 无效——更改未保存。
pref-reset-defaults = 恢复默认设置
