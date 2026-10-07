---
date: 2026-10-08
icon: compass
category: [design]
tag: [ssg]
---

# Design & Implementation

This section is written for developers of static site generators, and for users who want to understand what happens inside the framework. The content leans toward design tradeoffs and implementation details, references source paths, and explains why things are done this way. If you only want to get a site running, go to the [Guide](../index.md).

- [Why Another One](./why.md): positioning, a comparison with Astro / VuePress / VitePress, measured performance, and the costs
- [Architecture](./architecture.md): two-phase build, page shell, mount contract, base detection, and the render cache
- [Build Pipeline](./build-pipeline.md): the markdown-it pipeline, link resolution, archive aggregation, and incremental caching
- [Islands Runtime](./islands-runtime.md): placeholder markers, client-side hydration, and the built-in island implementations
