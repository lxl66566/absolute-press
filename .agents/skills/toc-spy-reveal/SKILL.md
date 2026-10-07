---
name: toc-spy-reveal
description: absolute-press 框架 TOC 右栏的设计档案：scroll-spy 高亮、高亮行自动滚入可视区（reveal）、超长目录折叠。凡改动 Toc.tsx / toc-tree.ts / Toc.css / anchor-highlight，或排查「高亮条目错误 / 跑出视口 / 不跟随滚动」，或要动 #abs-toc、rootMargin、折叠阈值、--abs-nav-h，先读这个。
---

# TOC 右栏：spy / reveal / fold 设计档案

## 组成与文件

| 部分  | 职责                                       | 位置                                |
| ----- | ------------------------------------------ | ----------------------------------- |
| spy   | IntersectionObserver 选出「视线处章节」    | theme/Toc.tsx 观察区 rootMargin     |
| reveal | active 变化时把高亮行最小滚动进 rail 可视区 | theme/Toc.tsx revealActive          |
| fold  | 目录超过 TOC_FOLD_THRESHOLD 条按顶层组折叠 | theme/toc-tree.ts + Toc.css 折叠过渡 |

配套：toc-tree.ts（纯函数：建树/扁平/计数/归属）、Toc.css（隐藏滚动条、折叠过渡）、anchor-highlight.ts（锚点闪烁，独立）。

## 设计决策与原因（改前必读）

### spy 观察区顶边贴导航栏（-64px），不是 20vh

视线在导航栏正下方。曾用顶边 = 20vh（对齐 scroll-margin-top），带内「最靠上的标题」恒比阅读位置低 20vh → 紧凑章节页（博客日志，每条约 70px）高亮超前 2–4 条，且 reveal 上线后高亮常驻可见，超前才显形。

语义：active = 视口顶部正在读的章节。IO 回调只在带内有标题时 setActive，带空时保持原值——天然实现「最近越过视线的标题」的 sticky 语义，无重置闪烁。

约束：锚点落点（`scroll-margin-top: 20vh`）必须落在观察区内，深链/点击跳转后目标标题才保持高亮。改 rootMargin 或 scroll-margin-top 必须一起核对。

### reveal 用 `scrollIntoView({block:'nearest', behavior:'instant'})`，刻意即时

- 平滑滚动追不上连续滚动正文：动画滞后期间高亮一路溜出视口（第一版踩过，用户实测复现）。
- nearest = 最小修正：行可见时 rail 纹丝不动，手动滚 rail 看目录不会被抢。
- `behavior:'instant'` 不能省成 'auto'：'auto' 继承 CSS scroll-behavior，将来全局加 smooth 会复发。
- 页面正文不被牵连，依赖 `#abs-toc` 为 position:fixed 全高（top: nav-h、bottom: 0）：行进 rail 框即进视口，文档层 nearest 调整恒为 0。改布局先重验这一点。

### 手写滚动几何是踩过坑的——不要复活

第一版自算 delta：helper 按内容坐标系（要减 scrollTop），调用处传的是 rect 差值（视口坐标系），恰好差一个 scrollTop → 修正量欠一个 scrollTop、rail 深处向下修正完全不再触发、向上修正把 rail 钳到顶。用户靠「超前量随滚动深度增长、不是固定值」这条观察才定位。结论：滚动对齐交给浏览器，别自算坐标。

### 折叠组展开动画期间行位置不可信

160ms grid-template-rows 过渡中途测量偏短，立即修正只会得到一次无用的半程跳动。流程：grew（本次变化展开了所属组）时跳过立即修正 → transitionend（propertyName=grid-template-rows）精确重瞄准 → FOLD_SETTLE_MS=200 截止兜底（reduced-motion 时 Toc.css 为 transition:none，等不到事件）。常量需同步：Toc.css 的 160ms ↔ Toc.tsx 的 FOLD_SETTLE_MS。

### 令牌与清理

revealToken 随每次 active 变化自增，迟到的 timer/transitionend 先比对令牌；onCleanup 再自增一次，让已卸载页面的定时器全部失效。navigate()（点击 TOC 行）也会 setActive——平滑滚动正文途中 spy 会连续切过中间标题，令牌保证只有最新一次生效。

## 已知坑

- 折叠组（0fr + overflow hidden）内的行 rect 高度为 0、位置压在组顶：scrollIntoView 和 rect 数学都视其为「可见」。无碍——reveal 只指向已展开组的行（spy 会先展开所属组），但给 TOC 行写新几何逻辑时要想到。
- 无头/内嵌面板不渲染帧时：IO、rAF、CSS 过渡全冻结，定时器重度节流（数百 ms 到不触发）。此时 spy/reveal「看起来死了」是假象，不代表代码问题。
- 折叠阈值 TOC_FOLD_THRESHOLD=40 按「折叠后无滚动条且每条可达」取衡；博客日志 ~198 条是基准用例。

## 验证方法

1. `pnpm verify`；再构建博客站（`link:` 指向本仓库）起静态服务器实测。
2. 无头面板里 IO 可能不触发——用点击 TOC 行驱动（navigate 直设 active，不依赖 IO）；临时 `Element.prototype.scrollIntoView = () => {}` 可屏蔽正文平滑滚动以隔离 reveal。
3. 断言模板：`#abs-toc a.font-medium` 相对 `#abs-toc` 的 `relTop`（向上修正后应 = 0）或 `relBottom − clientHeight`（向下修正后应 = 0）；`window.scrollY` 全程不变（reveal 不得牵连页面滚动）。
4. 折叠展开路径在冻结帧环境无法收敛（布局本身悬停半途）；真实浏览器由 transitionend 在 ~160ms 落位。环境验证不了 ≠ 代码错误，注明即可。
