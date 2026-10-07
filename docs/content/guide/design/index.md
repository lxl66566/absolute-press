---
date: 2026-10-08
icon: compass
category: [设计]
tag: [ssg]
---

# 设计

这个板块写给开发静态站点生成器的同行，以及想弄清楚框架内部发生了什么的使用者。内容偏设计取舍与实现细节，会引用源码路径并解释为什么这样做。只想把站点跑起来的使用者请去[指南](../index.md)。

- [为什么又造一个](./why.md)：定位、与 Astro / VuePress / VitePress 的横评、性能实测与代价
- [整体架构](./architecture.md)：两阶段构建、页面 shell、挂载契约、base 检测与渲染缓存
- [构建管线](./build-pipeline.md)：markdown-it 管线、链接解析、归档聚合与增量缓存
- [Islands 运行时](./islands-runtime.md)：占位标记、客户端激活与内置岛的实现
