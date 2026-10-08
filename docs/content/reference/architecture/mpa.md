---
title: 多页应用（MPA）
---

MPA（Multi-Page Application）的每个路由对应一个独立 HTML 文档，导航靠文档切换。框架在 MPA 之上叠加客户端软导航（fetch 目标页并交换内容区），保留 MPA 的可退化性：JS 失效或加载失败时链接仍然可用。
