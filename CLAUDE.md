# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**白守 (BaiShou Next)** 是一款开源的、注重隐私的 AI 记忆陪伴应用，数据完全存储在本地。用户可以通过日记记录生活，AI 伙伴能够通过 RAG 语义搜索真正「记得」用户，并通过层级化总结（日记→周记→月报→季报→年鉴）构建完整的个人记忆体系。

**核心理念**：不仅仅依靠 RAG，而是像人类一样通过时间沉淀记忆——拥抱冗余，保留上下文和时间感，将短期记忆逐步转化为长期记忆。

## 技术架构

这是一个 **pnpm workspace + Turborepo** 管理的 monorepo：

- **桌面端**：Electron + React + TypeScript（使用 electron-vite）
- **移动端**：Expo / React Native（**只支持 Android**，需开发版 APK，不能用 Expo Go）
- **共享逻辑**：在 `packages/` 中统一管理
  - `core`：日记、助手、会话、归档、备份等核心业务逻辑
  - `ai`：AI 提供商集成、Agent 工具、RAG、MCP 协议
  - `database`：libSQL/SQLite + Drizzle ORM
  - `shared`：跨平台工具（日志、i18n、类型定义）
  - `store`：状态管理
  - `ui`：UI 组件库与主题系统
- **平台适配**：
  - 桌面端：`core-desktop`、`database-desktop`
  - 移动端：`core-mobile`

## 环境要求

- **Node.js** ≥ 20.19.4
- **pnpm** 10（由 `packageManager` 字段强制）
- **移动端开发**需要 Android SDK（WSL2 用户注意端口转发）

## 常用命令

### 开发启动

```bash
# 桌面端开发
pnpm dev:desktop

# 移动端日常开发（仅改 JS/TS）
pnpm dev:mobile

# 移动端全量重装（升级 Expo、加原生模块、闪退时）
pnpm dev:mobile:clear
```

### 测试与质量检查

```bash
# 运行所有测试
pnpm test

# 运行特定包的测试
pnpm test --filter=@baishou/core
pnpm test --filter=@baishou/ai

# 类型检查
pnpm typecheck

# 代码检查
pnpm lint

# 格式化
pnpm format

# 提交 PR 前必须运行（与 GitHub CI 对齐）
pnpm ci:check
```

### 数据库

```bash
# 生成 Drizzle schema 类型
pnpm db:generate

# 推送 schema 到数据库
pnpm db:push
```

### 构建与发布

```bash
# 桌面端构建（Windows 官方支持，需 Inno Setup）
pnpm release:desktop:win

# 移动端导出 Android 离线包
pnpm mobile:export

# 正式签名 Android APK
pnpm release:android
```

## 核心开发规范（必读）

### 1. 工作流程（不可跳步）

```
准备（分支 + 范围） → 调研复用 → 规格确认 → TDD（红→绿→重构） → 自测 → 提交 PR
```

- **准备**：在功能分支上工作；创建本地 `SCOPE.md`（已 gitignore）记录任务边界
- **调研**：搜索 monorepo 内已有实现，避免重复造轮子
- **规格**：新模块先定义类型/接口/错误场景，非 trivial 改动须用户确认后再实现
- **TDD**：先写失败测试 → 最小实现 → 重构；测试命名用 `should … when …`
- **自测**：提交 PR 前确保 `pnpm ci:check` 全部通过

### 2. 测试覆盖率要求

| 包类型                              | 行覆盖率目标 |
| ----------------------------------- | ------------ |
| `packages/shared` / `store`         | ≥ 85%        |
| `packages/core` / `ai` / `database` | ≥ 80%        |
| `apps/*`                            | ≥ 70%        |

- **每个测试只验证一件事**；必须覆盖边界值与错误路径
- 使用 Vitest（`vi.fn()` / `vi.mock()`），禁止引入 Jest/Mocha
- Mock 环境变量用 `vi.stubEnv()`，禁止依赖真实 API Key
- **不写测试的代码不合并**（单行 hotfix、纯文档除外）

### 3. TypeScript 与代码风格

- **严格模式**全开；禁止 `@ts-ignore` 掩盖类型问题
- **注释用中文**，解释「为什么」而非「是什么」
- 导入顺序：外部包 → `@baishou/*` → 相对路径
- 文件命名：`kebab-case.ts`；React 组件 `PascalCase.tsx`
- 自定义错误类优先于裸 `throw new Error`
- **单文件建议 ≤ 500 行**（ESLint `max-lines` 为 warn，不是阻断项）

### 4. 拆分与模块边界（关键）

**优先级**：按职责拆 → 按数据流拆 → 按可测试单元拆 → 按行数拆（最后手段）

**必须遵守的边界**：

1. **单一数据源**：同一业务状态只从一个来源解析（URL / store / 明确 props）
2. **单一副作用入口**：同一用户路径只有一个 handler；子组件只回调
3. **布局 DOM 是 API**：改组件层级前检查 CSS 依赖（如 `calc(100% - 76px)`）
4. **显式依赖**：禁止 `(repo as any).db`；Repository 须暴露 `getDb()` 或通过构造函数注入
5. **React 边界**：禁止用 ref 守卫阻断 `useEffect` 在 StrictMode 下的必要初始化

### 5. UI 主题规范（桌面端与移动端）

**严禁硬编码颜色**：

- 禁止使用 `#ffffff`、`#000000`、`white`、`black` 等固定色彩
- 禁止兜底色（如 `var(--color-surface, #FFFFFF)`）

**必须使用语义化 CSS 变量**（`packages/ui/src/theme/css-variables.css`）：

- 背景：`--bg-app`、`--bg-surface`、`--bg-surface-normal`、`--bg-surface-highest`、`--bg-glass-surface`
- 文本：`--text-primary`、`--text-secondary`、`--text-tertiary`
- 边框：`--border-subtle`、`--border-strong`

**移动端**：使用 `useNativeTheme().colors`，不写死 `#hex`；文案使用 `useTranslation` 的 `t('i18n.key')`。

**动效约束**：组件内动效控制在 `0.2s` 以内；按钮交互通过阴影或 `opacity` 传达反馈。

### 6. 安全与依赖

- 密钥、`.env`、本地数据库**不得提交**；新增 env 须同步 `.env.example`
- 新增依赖须在 SCOPE 说明理由；Native addon、>500KB 包、新构建链须人工审批
- 使用 `@baishou/shared` 的 `logger`，禁止裸 `console.log`

### 7. Commit 格式

遵循 Conventional Commits（中文说明）：

```
<type>(<scope>): <简短说明>

feat(core): 新增日记按日期查询
fix(desktop): 修复切换助手后会话列表不刷新
refactor(ui-web): 按职责拆分 Agent 侧栏，保持单一切换入口
```

类型：`feat` / `fix` / `refactor` / `chore` / `test` / `docs` / `style`

### 8. 贡献流程

1. **Fork** 仓库（不要直接向上游 `main` 推送）
2. 在 Fork 上创建功能分支开发
3. 运行 **`pnpm ci:check`** 确保通过
4. 推送到 Fork 并向上游创建 Pull Request
5. PR 说明须含改动动机与测试方式

## 项目结构理解

### 核心业务层（`packages/core`）

包含所有核心业务逻辑模块：

- `diary`：日记读写、查询
- `assistant`：AI 助手管理
- `session`：会话管理
- `summary`：记忆总结（周记、月报等）
- `vault`：工作区管理
- `archive`：归档与导出
- `sync`：云同步与备份
- `migration`：数据迁移
- `settings`：设置管理

### AI 层（`packages/ai`）

- `providers`：AI 提供商集成（Gemini、OpenAI、Anthropic 等）
- `agent`：Agent 框架与工具调用
- `rag`：RAG 语义检索（向量 + 全文 + 融合排序）
- `tools`：AI 工具（日记读写、网络搜索、记忆管理）
- `mcp`：MCP 协议实现（SSE 传输）

### 数据库层（`packages/database`）

使用 **Drizzle ORM** + **libSQL/SQLite**：

- Schema 定义在 `src/schemas/`
- 修改 schema 后运行 `pnpm db:generate` 生成类型
- 使用 `pnpm db:push` 推送到数据库

## 常见问题

### 移动端开发

- **不能用 Expo Go**，必须安装开发版 APK（`com.baishou.baishou.dev`）
- **WSL2 用户**：确保使用 WSL 内的 adb（`which adb` 应在 WSL 路径）
- **连不上 bundler**：运行 `pnpm mobile:connect` 重新 reverse 并打开 App
- **升级 Expo 后**：运行 `pnpm mobile:fix` 对齐依赖，再 `pnpm dev:mobile:clear`

### better-sqlite3 错误

```bash
pnpm rebuild better-sqlite3
```

### 格式化检查失败

```bash
pnpm format
```

## 重要文档

- [AI 编码规范](./docs/1-AI-Code/1-AI-Code-Rule.md)
- [UI 主题规范](./docs/1-AI-Code/2-UI-Theme-Rule.md)
- [提交规范](./docs/2-Submit/1-Submit-Rule.md)
- [桌面端 README](./apps/desktop/README.md)
- [移动端 README](./apps/mobile/README.md)

## 官方支持平台

- **桌面端**：仅 Windows（Electron）
- **移动端**：仅 Android（Expo）

Linux / macOS / iOS 不在官方支持范围内，可自行编译但不保证兼容性。
