/**
 * zh messages — source of truth for the Messages shape.
 * Other locales must satisfy `Messages` (compile-time key parity).
 */
export const zh = {
  nav: {
    openMenu: '打开菜单',
    closeMenu: '关闭菜单',
    switchToDark: '切换到暗色模式',
    switchToLight: '切换到亮色模式',
    switchLocale: '切换语言',
    rss: 'RSS 订阅',
  },
  sidebar: {
    expandGroup: '展开分组',
    collapseGroup: '折叠分组',
    resizeWidth: '调整侧栏宽度',
  },
  toc: {
    title: '本页目录',
    backToTop: '返回顶部',
  },
  article: {
    createdAt: '创建日期',
    lastUpdated: '最后编辑',
    // 构建期统计仍写入 payload；当前文章顶部 meta 不展示，留给归档卡片等处。
    readingTime: '约 {n} 分钟',
    category: '分类',
    tag: '标签',
  },
  feed: {
    empty: '暂无文章',
  },
  archive: {
    categoryTitle: '分类：{name}',
    tagTitle: '标签：{name}',
    empty: '该分组下暂无文章',
  },
  pagination: {
    prev: '上一页',
    next: '下一页',
    pageLabel: '第 {n} 页',
  },
  related: {
    title: '相关文章',
  },
  heimu: {
    /** Default hover tooltip baked into spoiler bars at build time. */
    tip: '你知道的太多了',
  },
  mermaid: {
    /** aria-label of the small reset button on pan/zoom diagrams. */
    resetZoom: '重置缩放',
    /** title hint describing the diagram interactions. */
    zoomHint: 'Ctrl+滚轮缩放 · 拖拽平移 · 双击复位',
  },
  zoomedImg: {
    /** veil text over a masked image until it is revealed by click. */
    clickToView: '点击查看',
  },
  search: {
    placeholder: '搜索文档',
    /** aria-label of the icon-only search button on mobile. */
    label: '搜索',
  },
  xlist: {
    searchPlaceholder: '搜索条目…',
    sortLabel: '排序方式',
    sortDefault: '默认排序',
    sortTitleAsc: '按标题升序',
    sortTitleDesc: '按标题降序',
    expandAll: '全部展开',
    collapseAll: '全部收起',
    expandHint: '点击表格行可以展开详细内容哦！',
    count: '{shown} / {total} 条',
    empty: '没有匹配的条目',
    untitled: '未命名条目',
  },
  gate: {
    title: '此页面已加密',
    hint: '提示：{hint}',
    placeholder: '请输入密码',
    submit: '解锁',
    error: '密码错误，请重试',
    remember: '记住密码',
  },
  notFound: {
    /** Standalone 404 page copy; emitted with the default locale. */
    title: '页面不存在',
    message: '你要找的页面不存在，或已被移动。',
    backHome: '返回首页',
  },
};

export type Messages = typeof zh;
