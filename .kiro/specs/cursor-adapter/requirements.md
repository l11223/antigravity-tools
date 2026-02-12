# 需求文档：Cursor 编辑器适配

## 简介

本功能旨在将 Antigravity Tools 现有的全部核心能力（账号管理、协议代理、配额监控、模型路由、安全防护、监控日志等）适配到 Cursor 编辑器。Cursor 作为一款基于 VS Code 的 AI 编辑器，通过 OpenAI 兼容协议与后端 AI 服务通信。本适配将使 Antigravity Tools 能够作为 Cursor 的 AI 后端代理，实现多账号轮换、协议转换、智能路由等全部功能，达到"完美复刻只能超越"的目标。

## 术语表

- **Cursor_Editor**: 基于 VS Code 的 AI 代码编辑器，通过 OpenAI 兼容 API 调用 AI 模型
- **Proxy_Server**: Antigravity Tools 内置的 Axum HTTP 代理服务器，负责接收外部请求并转发至上游 AI 服务
- **Token_Manager**: 负责管理多个 AI 账号 Token 的模块，支持轮询、权重分配和自动切换
- **Model_Router**: 模型路由模块，负责将请求中的模型 ID 映射到实际的上游模型
- **Protocol_Mapper**: 协议转换器，负责在 OpenAI/Anthropic/Gemini 等不同协议格式之间进行转换
- **CLI_Sync**: CLI 配置同步模块，负责将 Antigravity 的代理配置自动写入外部工具的配置文件
- **Quota_Monitor**: 配额监控模块，负责跟踪和展示各账号的 AI 模型使用配额
- **Dashboard**: 前端仪表盘页面，展示全局账号健康状况和配额概览
- **Cursor_Provider**: 在 Antigravity 系统中代表 Cursor 编辑器的提供商配置实体
- **Account_Service**: 账号服务层，负责账号的添加、删除、切换和 OAuth 授权流程
- **Warmup_Handler**: 预热处理器，负责在启动时预热账号连接以减少首次请求延迟

## 需求

### 需求 1：Cursor 账号认证与登录

**用户故事：** 作为开发者，我希望通过 Antigravity 管理用于 Cursor 的 AI 账号，以便使用 OAuth 授权或 Token 导入的方式添加和管理账号。

#### 验收标准

1. WHEN 用户通过 OAuth 2.0 流程添加 Google 账号, THE Account_Service SHALL 完成授权码交换、获取用户信息和项目 ID，并将该账号持久化存储且标记为可用于 Cursor 代理
2. WHEN 用户通过手动输入 Refresh Token 添加账号, THE Account_Service SHALL 使用该 Token 获取 Access Token 和用户信息，验证有效性后将账号加入可用账号池
3. WHEN 用户通过 JSON 批量导入账号, THE Account_Service SHALL 逐一验证每个账号的 Token 有效性，将所有有效账号加入可用账号池，并报告导入结果（成功数/失败数）
4. WHEN 账号的 Access Token 即将过期（剩余有效期少于 5 分钟）, THE Token_Manager SHALL 使用 Refresh Token 自动刷新 Access Token
5. IF Token 刷新失败, THEN THE Token_Manager SHALL 将该账号标记为不可用，并在日志中记录失败原因
6. WHEN 用户在账号列表中启用或禁用某账号的代理状态, THE Token_Manager SHALL 实时更新该账号在代理池中的可用性
7. WHEN 账号被检测到 403 封禁状态, THE Token_Manager SHALL 自动标记该账号为禁用（is_forbidden），并在后续调度中跳过该账号
8. WHEN 用户在仪表盘点击"一键切换"推荐账号, THE Account_Service SHALL 将当前活跃账号切换为系统推荐的最佳账号

### 需求 2：Cursor 协议代理端点

**用户故事：** 作为开发者，我希望 Antigravity 能代理 Cursor 编辑器的 API 请求，以便通过多账号轮换和协议转换来使用 AI 功能。

#### 验收标准

1. WHEN Cursor_Editor 发送 OpenAI 兼容的 `/v1/chat/completions` 请求, THE Proxy_Server SHALL 识别该请求来源为 Cursor 并正确转发至上游 AI 服务
2. WHEN Cursor_Editor 发送流式请求（`stream: true`）, THE Proxy_Server SHALL 以 SSE（Server-Sent Events）格式返回流式响应
3. WHEN Cursor_Editor 发送非流式请求, THE Proxy_Server SHALL 返回完整的 JSON 响应体
4. WHEN Cursor_Editor 发送 `/v1/models` 请求, THE Proxy_Server SHALL 返回当前可用的模型列表，包含 Cursor 支持的模型 ID
5. WHEN Proxy_Server 接收到包含 Cursor 特有请求头（如 `x-cursor-*`）的请求, THE Proxy_Server SHALL 保留这些头信息用于日志记录，并在转发时移除非标准头
6. WHEN Cursor_Editor 发送包含 `tools` 或 `functions` 字段的请求, THE Protocol_Mapper SHALL 将工具调用格式正确转换为上游 AI 服务支持的格式
7. WHEN 上游 AI 服务返回工具调用响应, THE Protocol_Mapper SHALL 将其转换回 OpenAI 兼容的工具调用格式返回给 Cursor_Editor

### 需求 3：Cursor 模型路由与映射

**用户故事：** 作为开发者，我希望 Cursor 中使用的模型名称能正确映射到 Antigravity 支持的上游模型，以便无缝使用各种 AI 模型。

#### 验收标准

1. WHEN Cursor_Editor 请求模型 ID 为 `gpt-4`、`gpt-4o`、`gpt-3.5-turbo` 等 OpenAI 模型名称, THE Model_Router SHALL 根据配置的映射规则将其路由到对应的 Gemini 或 Claude 上游模型
2. WHEN Cursor_Editor 请求模型 ID 为 `claude-3.5-sonnet`、`claude-3-opus` 等 Anthropic 模型名称, THE Model_Router SHALL 将其路由到对应的 Anthropic 上游账号
3. THE Model_Router SHALL 提供 Cursor 专用的默认模型映射预设，覆盖 Cursor 编辑器中常见的所有模型 ID
4. WHEN 用户在前端配置了自定义 Cursor 模型映射, THE Model_Router SHALL 优先使用用户自定义映射而非默认预设
5. WHEN Cursor_Editor 请求的模型 ID 在映射表中不存在, THE Model_Router SHALL 尝试使用通用模型映射规则进行匹配，匹配失败时返回 HTTP 404 错误及描述性错误信息

### 需求 4：Cursor 配置同步

**用户故事：** 作为开发者，我希望 Antigravity 能一键同步配置到 Cursor 编辑器，以便快速完成接入而无需手动修改配置文件。

#### 验收标准

1. WHEN 用户点击 Cursor 同步按钮, THE CLI_Sync SHALL 自动检测 Cursor 编辑器的安装路径和配置文件位置（macOS: `~/Library/Application Support/Cursor/User/settings.json`，Windows: `%APPDATA%/Cursor/User/settings.json`，Linux: `~/.config/Cursor/User/settings.json`）
2. WHEN CLI_Sync 检测到 Cursor 已安装, THE CLI_Sync SHALL 将 Antigravity 的代理地址和 API Key 写入 Cursor 的 `settings.json` 配置文件中对应的 OpenAI 代理字段
3. WHEN CLI_Sync 执行同步前, THE CLI_Sync SHALL 自动创建原始配置文件的 `.antigravity.bak` 备份
4. WHEN 用户点击恢复按钮, THE CLI_Sync SHALL 从备份文件恢复 Cursor 的原始配置
5. IF Cursor 编辑器未安装或配置文件路径不存在, THEN THE CLI_Sync SHALL 返回描述性错误信息，指明期望的安装路径
6. WHEN CLI_Sync 写入 Cursor 配置时, THE CLI_Sync SHALL 仅修改 AI 代理相关字段，保留用户的其他 Cursor 设置不变

### 需求 5：Cursor 请求的智能自愈与账号轮换

**用户故事：** 作为开发者，我希望在使用 Cursor 时遇到 API 错误能自动恢复，以便获得不中断的编码体验。

#### 验收标准

1. WHEN Cursor 请求遇到上游 HTTP 429（Too Many Requests）错误, THE Proxy_Server SHALL 在 300 毫秒内自动切换到下一个可用账号并重试请求
2. WHEN Cursor 请求遇到上游 HTTP 401（Unauthorized）错误, THE Token_Manager SHALL 尝试刷新当前账号的 Token，刷新失败时切换到下一个可用账号
3. WHEN Cursor 请求遇到上游 HTTP 503（Service Unavailable）错误, THE Proxy_Server SHALL 自动重试请求，最多重试 3 次，每次间隔递增
4. WHILE 所有账号均处于限流状态, THE Proxy_Server SHALL 返回 HTTP 503 错误及包含预计恢复时间的 JSON 错误响应
5. WHEN 账号轮换发生时, THE Proxy_Server SHALL 确保 Cursor 的流式响应不中断，对用户透明
6. WHEN Cursor 请求遇到上游 HTTP 404 错误, THE Proxy_Server SHALL 以 300 毫秒短延迟重试并自动切换到下一个可用账号

### 需求 6：Cursor 配额监控与展示

**用户故事：** 作为开发者，我希望在 Dashboard 上看到 Cursor 使用的配额消耗情况，以便合理规划 AI 使用量。

#### 验收标准

1. WHEN Cursor 请求通过 Proxy_Server 完成, THE Quota_Monitor SHALL 记录该请求消耗的 Token 数量，并关联到对应的账号和模型
2. WHEN 用户查看 Dashboard, THE Dashboard SHALL 展示 Cursor 来源请求的独立统计数据，包括请求次数、Token 消耗和成功率
3. WHEN Cursor 请求的 Token 消耗导致某账号配额低于保护阈值, THE Quota_Monitor SHALL 触发配额保护机制，将该账号从可用账号池中移除
4. THE Dashboard SHALL 在 Cursor 统计卡片中展示当前活跃账号数量和平均剩余配额百分比
5. WHEN 账号配额在保护期后恢复到安全水平, THE Quota_Monitor SHALL 自动将该账号重新加入可用账号池

### 需求 7：Cursor 前端配置界面

**用户故事：** 作为开发者，我希望在 Antigravity 的前端界面中管理 Cursor 的代理配置，以便方便地调整设置。

#### 验收标准

1. WHEN 用户导航到 API 反代页面, THE Dashboard SHALL 在"外部 Providers"区域展示 Cursor 同步卡片，包含同步状态、同步按钮和恢复按钮
2. WHEN 用户点击 Cursor 同步卡片, THE Dashboard SHALL 展示 Cursor 的连接状态（已同步/未同步/Cursor 未安装）
3. WHEN 用户在模型映射页面配置 Cursor 模型映射, THE Dashboard SHALL 提供 Cursor 专用的映射预设一键导入功能
4. WHEN Cursor 同步操作完成, THE Dashboard SHALL 展示操作结果通知（成功/失败及原因）
5. WHEN 用户查看账号列表, THE Dashboard SHALL 支持列表视图和网格视图双模式切换，并在每个账号卡片上展示配额百分比和 403 封禁标注

### 需求 8：Cursor 请求的安全防护

**用户故事：** 作为开发者，我希望 Cursor 的 API 请求受到与其他客户端相同的安全防护，以便保障系统安全。

#### 验收标准

1. WHEN Cursor 请求到达 Proxy_Server, THE Proxy_Server SHALL 对请求执行 API Key 验证
2. WHEN IP 白名单功能启用, THE Proxy_Server SHALL 对 Cursor 请求执行 IP 白名单检查
3. WHEN IP 黑名单功能启用, THE Proxy_Server SHALL 对 Cursor 请求执行 IP 黑名单检查
4. WHEN 限流功能启用, THE Proxy_Server SHALL 对 Cursor 请求执行速率限制检查
5. THE Proxy_Server SHALL 将 Cursor 请求的来源 IP、请求模型和响应状态记录到安全监控日志中
6. WHEN 用户 Token 功能启用, THE Proxy_Server SHALL 支持为 Cursor 用户创建独立的 User Token，支持自定义过期时间和权限范围

### 需求 9：Cursor 请求的监控与日志

**用户故事：** 作为开发者，我希望在监控页面查看 Cursor 的请求日志和统计数据，以便排查问题和优化使用。

#### 验收标准

1. WHEN Cursor 请求通过 Proxy_Server 处理, THE Proxy_Server SHALL 记录完整的请求日志，包括请求时间、模型、Token 消耗、响应状态和延迟
2. WHEN 用户查看监控页面, THE Dashboard SHALL 支持按来源（Cursor）筛选请求日志
3. WHEN 用户查看 Token 统计页面, THE Dashboard SHALL 展示 Cursor 来源的 Token 消耗趋势图（按小时/天/周）
4. THE Proxy_Server SHALL 在日志中标记 Cursor 请求的来源标识，以区分来自不同客户端的请求
5. WHEN 用户启用调试控制台, THE Proxy_Server SHALL 将 Cursor 请求的详细调试信息（包括请求体、响应体、工具调用内容）输出到调试控制台

### 需求 10：Cursor 分级路由支持

**用户故事：** 作为开发者，我希望 Cursor 的请求能利用 Antigravity 的分级路由功能，以便优化账号使用效率。

#### 验收标准

1. WHEN Cursor 请求到达 Model_Router, THE Model_Router SHALL 根据账号类型（Ultra/Pro/Free）和配额重置频率进行分级路由
2. WHEN Cursor 发送后台任务请求（如代码补全建议、标题生成）, THE Model_Router SHALL 识别该请求为低优先级，并路由到 Flash 等轻量模型以保护高级模型配额
3. WHEN 高优先级账号（Ultra）可用时, THE Model_Router SHALL 优先将 Cursor 的交互式请求（如聊天对话）路由到高优先级账号
4. WHEN 用户配置了 Cursor 的粘性会话, THE Token_Manager SHALL 在同一编辑会话内尽量使用同一账号，以保持上下文一致性

### 需求 11：Cursor 账号预热与健康检查

**用户故事：** 作为开发者，我希望 Antigravity 能在启动时预热 Cursor 使用的账号，以便减少首次请求的延迟。

#### 验收标准

1. WHEN Proxy_Server 启动时, THE Warmup_Handler SHALL 对所有启用代理的账号执行预热请求，验证连接可用性
2. WHEN 预热过程中检测到账号返回 403 错误, THE Warmup_Handler SHALL 立即标记该账号为禁用并持久化状态
3. WHEN 用户手动触发"全部预热"操作, THE Warmup_Handler SHALL 对所有账号执行预热并返回预热结果摘要（成功数/失败数/禁用数）
4. WHEN 用户对单个账号触发预热, THE Warmup_Handler SHALL 对该账号执行预热并更新其健康状态
