# Implementation Plan: Cursor 编辑器适配

## Overview

本实现计划将 Cursor 编辑器适配功能分解为增量式编码任务。每个任务基于前一个任务构建，最终将所有组件连接在一起。重点是在现有 Antigravity Tools 代码库中新增 Cursor 支持，复用已有的代理、路由、安全和监控基础设施。

## Tasks

- [x] 1. Cursor 配置同步后端模块
  - [x] 1.1 创建 `src-tauri/src/proxy/cursor_sync.rs` 模块
    - 实现 `CursorSyncStatus` 结构体（installed, config_path, is_synced, has_backup, current_base_url）
    - 实现 `get_cursor_config_dir()` 跨平台路径检测（macOS/Windows/Linux）
    - 实现 `check_cursor_installed()` 检测 Cursor 安装状态
    - 实现 `get_sync_status()` 检查当前同步状态
    - 实现 `sync_config()` 将代理配置写入 Cursor settings.json（仅修改 AI 代理字段，保留其他设置）
    - 实现 `restore_config()` 从 .antigravity.bak 备份恢复
    - 实现 `get_config_content()` 读取当前 Cursor 配置内容
    - 遵循 `opencode_sync.rs` 的模式和错误处理风格
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 1.2 编写 cursor_sync 模块的属性测试
    - **Property 11: 配置同步-恢复往返一致性**
    - **Property 12: 配置同步保留非 AI 代理字段**
    - 使用 proptest 生成随机 settings.json 内容
    - **Validates: Requirements 4.4, 4.6**

  - [ ]* 1.3 编写 cursor_sync 模块的单元测试
    - 测试跨平台路径检测逻辑
    - 测试 Cursor 未安装时的错误处理
    - 测试备份文件创建和恢复
    - 测试 JSON 字段合并（保留非 AI 字段）
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [x] 2. Cursor 模型映射预设
  - [x] 2.1 实现 Cursor 默认模型映射预设
    - 在 `src-tauri/src/proxy/cursor_sync.rs` 或新建 `cursor_models.rs` 中定义 `get_cursor_default_mapping()` 函数
    - 映射 GPT 系列（gpt-4, gpt-4o, gpt-4o-mini, gpt-3.5-turbo, gpt-4-turbo）到 Gemini 模型
    - 映射 Claude 系列（claude-3.5-sonnet, claude-3-opus, claude-3-sonnet, claude-3-haiku）到对应上游模型
    - 映射 Cursor 特有模型名（cursor-small, cursor-large）
    - 定义 `CursorModelPreset` 结构体
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 2.2 编写模型映射的属性测试
    - **Property 8: 模型映射正确性**
    - **Property 9: 自定义映射优先于默认预设**
    - **Property 10: 未知模型返回 404**
    - **Validates: Requirements 3.1, 3.2, 3.4, 3.5**

- [x] 3. Checkpoint - 确保后端核心模块测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Cursor 请求来源识别
  - [x] 4.1 增强监控中间件的来源检测逻辑
    - 在 `src-tauri/src/proxy/middleware/monitor.rs` 中添加 Cursor 来源检测
    - 检测 User-Agent 中的 "cursor" 关键词
    - 检测 `x-cursor-*` 前缀的请求头
    - 将来源标识写入日志条目的 `client_source` 字段
    - _Requirements: 2.1, 2.5, 9.4_

  - [x] 4.2 增强 ProxyLogEntry 数据模型
    - 在日志条目中添加 `client_source` 字段（如尚未存在）
    - 确保监控模块在记录日志时填充该字段
    - _Requirements: 9.1, 9.4_

  - [ ]* 4.3 编写来源识别的属性测试
    - **Property 5: Cursor 来源识别与日志标记**
    - **Property 6: Cursor 特有请求头在转发时被移除**
    - 使用 proptest 生成包含各种 User-Agent 和请求头的请求
    - **Validates: Requirements 2.1, 2.5, 9.4**

- [x] 5. 后端 Admin API 端点
  - [x] 5.1 在 `server.rs` 中注册 Cursor 同步相关路由
    - 添加 `/proxy/cursor/status` POST 端点（获取同步状态）
    - 添加 `/proxy/cursor/sync` POST 端点（执行同步）
    - 添加 `/proxy/cursor/restore` POST 端点（恢复配置）
    - 添加 `/proxy/cursor/config` POST 端点（获取配置内容）
    - 添加 `/proxy/cursor/preset` GET 端点（获取模型映射预设）
    - 添加 `/proxy/cursor/preset/apply` POST 端点（应用模型映射预设）
    - 实现对应的 handler 函数
    - _Requirements: 4.1, 4.2, 4.4, 3.3, 7.1_

  - [x] 5.2 在 `proxy/mod.rs` 中注册 cursor_sync 模块
    - 添加 `pub mod cursor_sync;`
    - _Requirements: 4.1_

- [x] 6. Checkpoint - 确保后端 API 端点可用
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. 前端 Cursor 同步卡片
  - [x] 7.1 创建 `src/components/proxy/CursorSyncCard.tsx` 组件
    - 展示 Cursor 安装状态和同步状态
    - 提供同步按钮（调用 `/api/proxy/cursor/sync`）
    - 提供恢复按钮（调用 `/api/proxy/cursor/restore`）
    - 提供查看配置按钮（调用 `/api/proxy/cursor/config`）
    - 展示操作结果通知（成功/失败）
    - 遵循现有 CLI Sync 卡片的 UI 模式和样式
    - _Requirements: 7.1, 7.2, 7.4_

  - [x] 7.2 在 API 反代页面集成 Cursor 同步卡片
    - 在 `src/pages/ApiProxy.tsx` 的"外部 Providers"区域添加 CursorSyncCard
    - _Requirements: 7.1_

  - [x] 7.3 添加 Cursor 模型映射预设导入功能
    - 在模型映射配置区域添加"导入 Cursor 预设"按钮
    - 调用 `/api/proxy/cursor/preset/apply` 端点
    - 展示导入结果通知
    - _Requirements: 7.3_

- [x] 8. 前端监控页面增强
  - [x] 8.1 在监控页面添加来源筛选功能
    - 在 `src/pages/Monitor.tsx` 中添加来源筛选下拉框
    - 支持按 Cursor / Claude Code / OpenCode / All 筛选
    - 在日志列表中展示来源标签
    - _Requirements: 9.2, 8.5_

- [x] 9. 国际化支持
  - [x] 9.1 添加 Cursor 相关的中文翻译词条
    - 在 `src/locales/zh.json` 中添加 Cursor 同步相关的翻译
    - 在 `src/locales/en.json` 中添加对应的英文翻译
    - 包括：同步状态、按钮文本、错误信息、通知消息等
    - _Requirements: 7.1, 7.2, 7.4_

- [x] 10. Checkpoint - 确保前端功能正常
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. 集成与连接
  - [x] 11.1 确保 Cursor 请求复用现有安全中间件
    - 验证 API Key 验证、IP 白黑名单、限流对 Cursor 请求生效
    - 确保 Cursor 请求经过完整的中间件链（ip_filter → auth → monitor → handler）
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 11.2 确保 Cursor 请求复用现有自愈与轮换逻辑
    - 验证 429/401/503/404 错误的自动重试和账号轮换对 Cursor 请求生效
    - 验证分级路由（Ultra/Pro/Free）对 Cursor 请求生效
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 10.1, 10.3_

  - [x] 11.3 确保 Cursor 请求的配额监控正常工作
    - 验证 Token 消耗记录关联到正确的账号和模型
    - 验证配额保护机制对 Cursor 请求生效
    - _Requirements: 6.1, 6.3_

  - [ ]* 11.4 编写集成属性测试
    - **Property 14: 安全中间件对 Cursor 请求生效**
    - **Property 15: 分级路由优先级**
    - **Property 17: 粘性会话一致性**
    - **Validates: Requirements 8.1-8.4, 10.1, 10.3, 10.4**

- [x] 12. Final checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- 现有的账号管理、OAuth 授权、Token 刷新、403 检测、预热等功能已完整实现，Cursor 请求自动复用，无需重复实现
- 前端组件应遵循现有的 Ant Design + Tailwind CSS 样式规范
- 所有新增的 Rust 模块应遵循现有的错误处理模式（返回 `Result<T, String>`）
