# Minebot 优化执行单（下次会话直接按此执行）

更新时间：2026-03-14
目标：先做“降占用 + 提稳定”，再做“安全与可维护性”。

---

## 0. 执行规则（避免重复扫描）

1. 下次会话先读本文件，再按任务顺序执行。
2. 只在本文件列出的路径内改动，不做全仓库开放式搜索。
3. 每完成一个任务，更新本文件的状态（`pending` -> `done`）。
4. 每个任务完成后，至少运行对应的验证命令。

---

## 1. 优先级总览

- P0（必须先做）
  - [done] 修复 Docker Compose 中 `bypass-service` 不存在导致的一键部署风险
  - [skipped] 移除后端 JWT 默认弱安全兜底，改为强制环境变量（本轮按要求跳过）
- P1（紧接着做）
  - [done] 后端 `server/index.js` 路由拆分，降低耦合与维护成本
  - [done] 前端首包优化（路由/大模块懒加载）降低首屏占用
- P2（随后做）
  - [done] 清理仓库中的无关脚本文件，减少噪音
  - [done] 增加最小自动化测试骨架（后端 API 冒烟 + 前端关键渲染）

---

## 2. 任务清单（可直接执行）

### Task A（P0）修复 Docker 一键启动可用性

状态：`done`

背景：`docker-compose.yml` 包含 `bypass-service`，但仓库内不存在对应目录，导致构建失败。

改动路径：
- `docker-compose.yml`
- `README.md`（同步说明）

执行方案：
1. 将 `bypass-service` 服务改为可选 profile（如 `profiles: ["bypass"]`），或在默认 compose 中移除并提供独立示例。
2. 明确 `BYPASS_SERVICE_URL` 在无 bypass 服务时的行为（禁用或提示）。
3. README 增加“无 bypass 的标准启动方式”和“启用 bypass 的前置条件”。

验收命令：
- `docker compose config`
- `npm run build`

通过标准：
- 默认 `docker compose up -d --build` 不因缺少 `bypass-service` 失败。

---

### Task B（P0）安全修复：JWT 密钥策略

状态：`skipped`（按本轮指令跳过）

背景：`server/services/AuthService.js` 存在默认 JWT_SECRET 回退值。

改动路径：
- `server/services/AuthService.js`
- `server/index.js`（启动时配置校验）
- `.env.example`
- `README.md`

执行方案：
1. 删除硬编码默认 JWT 密钥。
2. 启动时若 `JWT_SECRET` 缺失：
   - 开发环境：打印强警告并自动生成临时值（仅内存，不落盘）。
   - 生产环境：拒绝启动并输出明确错误。
3. `.env.example` 和 README 补充 `JWT_SECRET` 必填说明。

验收命令：
- `node --check "server/index.js"`
- `npm run lint`

通过标准：
- 生产模式无 `JWT_SECRET` 时服务不能启动。

---

### Task C（P1）后端拆分 `server/index.js`

状态：`done`

背景：`server/index.js` 体量过大（>1800 行），路由和业务混杂。

改动路径（目标结构）：
- `server/index.js`（仅保留 app 初始化、中间件装配、server 启动）
- `server/routes/auth.js`
- `server/routes/system.js`
- `server/routes/proxy.js`
- `server/routes/bots.js`
- `server/routes/files.js`
- `server/routes/agents.js`
- `server/routes/telegram.js`

执行方案：
1. 先无行为变更地搬运路由（不改业务逻辑）。
2. 用依赖注入传入 `botManager/configManager/agentGateway/...`。
3. 保持原 API 路径和返回结构兼容。

验收命令：
- `node --check "server/index.js"`
- 手动 smoke：登录、读取 bots、文件列表、agent 列表 4 条接口。

通过标准：
- API 行为不变，结构清晰，`index.js` 显著缩短。

---

### Task D（P1）前端首包优化（降占用）

状态：`done`

背景：当前构建主包约 627KB（有 chunk 警告）。

改动路径：
- `src/App.tsx`
- `src/pages/Index.tsx`
- `src/components/MultiServerPanel.tsx`
- `vite.config.ts`（必要时）

执行方案：
1. 对页面路由使用 `React.lazy` + `Suspense`。
2. 对体量较大的面板（如文件管理、详情弹窗）做按需加载。
3. 必要时在 Vite 中设置 `manualChunks`（按 react/vendor/ui 分组）。

验收命令：
- `npm run build`

通过标准：
- 主 chunk 明显下降（目标：<500KB，越低越好）。

---

### Task E（P2）仓库整洁化

状态：`done`

背景：`src` 目录包含无关 userscript 文件，影响可维护性。

候选文件（确认后处理）：
- `src/en`
- `src/fd`
- `src/gre`
- `src/va`
- `src/za`

执行方案：
1. 若确认为历史临时脚本，迁移到 `toolbox/scripts-archive/` 或移除。
2. 确保打包入口不再引用这些文件。

验收命令：
- `npm run build`

通过标准：
- 业务源码目录仅保留项目相关文件。

---

### Task F（P2）最小测试覆盖

状态：`done`

背景：Go/前后端当前基本无实际自动化测试。

改动路径（建议）：
- `server/tests/smoke.auth.test.js`
- `server/tests/smoke.bots.test.js`
- `src/__tests__/app-render.test.tsx`（如引入 Vitest）
- `package.json` / `server/package.json`（新增 test script）

执行方案：
1. 先加最小冒烟测试（登录、鉴权、获取 bots）。
2. 再加前端关键渲染测试（App 路由守卫）。

验收命令：
- `npm test`（若已配置）
- `node --test server/tests/*.test.js`（或等价命令）

通过标准：
- 至少 3-5 条核心流程测试可在 CI 跑通。

---

## 3. 已确认基线（下次无需重复检查）

- 前端：
  - `npm run lint` 通过
  - `npm run build` 通过（主包较大告警）
- Go agent：
  - `go build ./...` 通过
  - `go test ./...` 无测试文件
- 后端语法：
  - `node --check "server/index.js"` 通过

---

## 4. 下次会话启动口令

直接对助手说：

`按 NEXT_SESSION_OPTIMIZATION_PLAN.md 从 Task A 开始执行，完成后更新状态并继续下一个任务。`
