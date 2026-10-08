# Product

## Register

product

## Platform

web

## Users

普通开发者。长时间在桌面端使用，通常全屏或半屏挂着一个项目，一边让 Agent 干活一边看文件、翻会话、改提示词。他们要的是能连续用几小时不累的界面，不是好看五秒钟的展示页。

## Product Purpose

CodePIddy 是一个基于 Pi 的桌面编码工作台：管理项目、工作项、Agent 会话与权限，把 Agent 的执行过程可视化。本轮的职责边界是**客户端的美化与体验打磨**——不改业务逻辑、不改数据模型、不改 IPC，只让这个客户端看起来和用起来达到专业桌面工具的水准。

成功的样子：界面不再让人一眼觉得是 AI 生成的，长时间使用不刺眼、不疲劳，信息层级清楚到不需要解释。

## Positioning

把 Agent 的工作过程放进一个安静、耐看、信息密度合适的桌面工作台里。

## Brand Personality

克制、精密、可信、简约。

语气直接、技术化、不谄媚；界面不解释自己，不用感叹号，不用营销腔。

## Anti-references

**AI 味重的界面。** 具体表现为：玻璃拟态堆叠、渐变文字、紫色渐变、没有意义的超大圆角卡片网格、用 emoji 当图标、每张卡片都长一样、动效只是为了让页面"动起来"。任何一处如果让人产生"这是 AI 随手生成的"念头，就是失败的。

## Design Principles

工具隐身，任务在前。设计不抢戏，用户的注意力应该落在代码、会话和文件上，而不是界面的装饰上。

层次来自色调，不来自描边。用底色深浅和留白划分区域，而不是给每个卡片加边框和阴影。

一致性优先于惊喜。同一个按钮在设置页和会话页必须长得一样；惊喜留给少数关键时刻，不铺满每一屏。

彩色是信息，不是装饰。颜色只用来表达状态和分类，主体界面保持中性。

每个状态都要设计过。默认、悬停、聚焦、选中、禁用、空、错误、加载——缺一个都算没做完。

## 客户端边界

CodePIddy 保留客户端自己的编排、配置、展示和产品层能力，但不复制 Pi core 已经公开的运行时能力。

- 客户端负责：项目 / Agent 编排、GUI、设置、文件工作台、终端、会话展示、诊断、分享入口和统一的本地配置。
- Pi core 负责：Agent loop、工具注册、MCP / Codemode / Tool Search、模型运行时、认证、trust、packages、compaction、cache warming、retry 和 session 存储。
- 客户端增强只能通过 Pi 扩展点或 Pi 导出的 SDK / CLI / RPC 接入；core 没有公开入口时，不搬 core 内部实现。
- `review` 变更 diff、`retry` 网关并发兜底、`cache-warming` 状态桥、自研 Skills、角色提示词和角色 Skill 分配是保留的客户端扩展。
- 不再维护自研 permission 系统、Tavily 专用 `web_search` MCP 或未加载的 provider / role-guard 扩展。

## Accessibility & Inclusion

没有硬性合规要求。本轮按 WCAG AA 执行：正文与背景对比度不低于 4.5:1，大字号不低于 3:1，动效提供 `prefers-reduced-motion` 降级，聚焦态必须可见。
