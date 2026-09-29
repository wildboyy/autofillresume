# resume-autofill

用你自己的 Chrome（经浏览器扩展桥接，不新起浏览器实例），把一份本地档案自动填进招聘站的简历表单。

## 安装

### 需要什么环境

| 组件 | 要求 | 说明 |
| --- | --- | --- |
| 操作系统 | **macOS** | 本 skill 靠读 `~/Library/Messages/chat.db` 自动取短信验证码。`bsk` 本身支持 macOS / Linux / Windows，但换成非 macOS 就只能人工输入验证码 |
| 浏览器 | Chrome 或 Edge，Chromium 125+ | 要求是**装着扩展、且持有目标账号登录态的那个 profile**，未必是你日常刷网页的那个。Agent Window 共享该 profile 的登录态——它不是独立账号，也不是安全沙箱，agent 会以你已登录站点的权限行事 |
| bsk CLI | 最新版 | 自带后台守护进程，是 agent 与浏览器之间的桥 |
| DSH 插件 | `browser-skill` 插件 | 提供 `browser_*` 工具；**自带** browser-skill skill，无需再跑 `bsk install-skill` |
| 模型 | 低价档 | 请求数很大，高价模型容易超预算 |
| 工作目录 | 一个专用目录 | 存放档案文件和站点笔记 |

### 第 1 步：装 bsk CLI

```sh
curl -fsSL https://raw.githubusercontent.com/Tencent/BrowserSkill/main/install.sh | sh
export PATH="${BSK_INSTALL_DIR:-$HOME/.local/bin}:$PATH"
```

默认装到 `~/.local/bin`。**这一步最容易出问题的地方是 PATH**：agent 进程的 PATH 和你终端里的往往不一致。装完必须确认：

```sh
bsk --version        # 在将要跑 agent 的那个环境里执行
```

已经开着的 agent 找不到 `bsk`，重启它才会读到新 PATH；或者干脆在插件配置里写死二进制绝对路径。

### 第 2 步：装浏览器扩展并连接

- [Chrome 应用商店](https://chromewebstore.google.com/detail/hhcmgoofomhgciiibhipgmgkgnoenaoi) · [Edge 加载项](https://microsoftedge.microsoft.com/addons/detail/browserskill/emacgiaaaiojkkpkddmmdfhmokgmnikg)
- 打开扩展弹窗，**启用本地连接**，等 CLI 起来后确认状态显示 Connected。

扩展里两个开关默认开启，建议保持：*借用标签页前确认*、*允许请求人工协助*。

**装在哪个 profile 里，是个需要想一下的选择。**

- 约束只有一条：**扩展所在的 profile 必须持有目标网站的登录态**。因为 Agent Window 继承的就是这个登录态，登录态换不来——短信验证码发到你手机上，跟 profile 无关。
- 用**日常 profile**：零配置，cookie 现成，这次实测新会话打开浙商直接就是登录态。
- 用**专用 profile**（只登求职站那些账号）：更安全。官方明确说 Agent Window **不是安全沙箱**，agent 会以该 profile 里所有已登录站点的权限行事——日常 profile 意味着把邮箱、IM、云盘一起交出去了。代价是要在这个 profile 里先把求职站登一遍。
- 多 profile 可以共存并显式选择：`bsk browsers` 列实例，`bsk session start --browser "Work profile"` 绑定指定实例。

### 第 3 步：装 DSH 插件

```sh
dsh plugin --profile web add @wxg-prc-cpg/browser-skill-dsh-plugin
```

DSH Desktop 用户也可以直接在应用内的插件市场安装（该插件已在 profile 的 bundle 列表里）。

要求 `bsk` 在启动 dsh 的 PATH 上，或在插件配置里设 `bskPath`。

**懒加载**：插件默认只在 skill 被调用后才注入 `browser_*` 工具。也就是说新会话里如果没先加载 `browser-skill` skill，所有 `browser_*` 调用都会报 unknown tool——本 skill 的流程里第一步就是处理这件事。

### 第 4 步：装本 skill

放到任一被扫描的位置：

| 位置 | 生效范围 |
| --- | --- |
| `<项目根>/.dsh/skills/` | 仅该项目（**项目根判定只看是否存在 `.git`**） |
| `<项目根>/.agents/skills/` | 仅该项目 |
| `$DSH_HOME/skills/` | 全应用 |
| `~/.agents/skills/` | 全应用 |

本目录是项目级安装。要全局可用：

```sh
ln -s "<工作目录>/.dsh/skills/resume-autofill" "$DSH_HOME/skills/resume-autofill"
```

改动由文件监听器实时拾取，无需重启。

### 第 5 步：验证

```sh
bsk doctor                            # 守护进程、扩展连接、协议版本
node scripts/preflight.mjs            # 操作系统 / 工作目录 / 档案文件 / CLI / 插件
```

`bsk doctor` 全绿**不等于** skill 能被发现——它只验证连接。skill 是否加载，要看新会话里 `browser-skill` 能不能被调用。

### 更新

```sh
bsk update --yes                                            # CLI（会重启守护进程）
dsh plugin --profile web update @wxg-prc-cpg/browser-skill-dsh-plugin --latest
# 扩展在浏览器商店里更新
```

CLI、守护进程、扩展、插件四者版本要配套，不配套会出新特性缺失甚至协议不兼容。

## 能力边界

**能自动完成**

| 能力 | 说明 |
| --- | --- |
| 登录 | 密码登录；短信验证码（macOS 自动读 `chat.db`）；可读的数字/字母图形验证码 |
| 导航穿透 | 多级嵌套 iframe 内的菜单与表单 |
| 填表 | 文本域、单行输入、单选、多选、多级级联、日期控件、被包装成按钮的输入框 |
| 保存校验 | 以站点自己的成功信号为准（成功提示 / 板块状态 / 完整度百分比） |

**做不到，必须人工**

| 做不到 | 原因 |
| --- | --- |
| 图形拼图验证码 | 画布 + iframe，截图无法求解（字节校招就是这种） |
| 文件上传 | 插件无 upload 能力。`bsk` CLI 有 `bsk upload`，但 browser-skill 规范禁止用另一个进程操作浏览器，是否破例属**用户决策** |
| 非 macOS 自动读短信 | 依赖 macOS Messages 数据库 |
| 姓名等锁定字段 | 部分站点（如浙商）姓名只读 |

## 使用

```bash
# 1. 环境自检（缺 bsk / 插件时 agent 可照官方 AGENT_INSTALL.md 自己装；扩展必须人工装）
node scripts/preflight.mjs --workdir <工作目录>

# 2. 引导档案：从用户现有简历自动解析出草稿，而不是让人对着空模板手填一百多项
node scripts/bootstrap-profile.mjs --file ~/Desktop/resume.pdf
#    产出 简历信息-草稿.md，并列出"仍需人工填写"的键
#    确定性的部分（标签行/日期/证件号/手机/邮箱/教育段）由脚本填；
#    散文段落（实习内容、项目内容、自我评价）由 agent 读原文补；
#    私人事实（期望薪资、紧急联系人、合规问答）只能问用户
#    草稿非经确认不得用于填表；确认后改名为 简历信息-解析版.md

# 3. 让 agent 使用 resume-autofill skill；它会读 SKILL.md 并按站点读 references/
```

站点状态见 `references/sites.md`：浙商银行、小米已端到端验证，字节部分验证，其余标 `unverified`。

**测试流程**要另存一份改掉敏感值的档案（文件名带 `mock`），跑完必须用真实档案重跑一遍覆盖回去。

### 移植到另一个人 / 另一台机器

skill 目录只放**知识**（流程、控件机制、站点笔记），**不含个人数据**；个人数据只存在于工作目录的档案文件里。所以移植 = 拷 skill 目录 + 补三样：

| 缺什么 | 谁来补 |
| --- | --- |
| 环境（bsk / 插件） | agent 照官方 `AGENT_INSTALL.md` 自装；**浏览器扩展必须人工从商店安装并允许本地连接** |
| 个人信息 | agent 用 `extract-resume.mjs` 从现有简历抽草稿 → 用户逐项确认 |
| 站点知识 | 已随 skill 一起走（浙商 / 小米 / 字节） |

## 基本原理

**成本模型决定一切。** 每次浏览器读取或操作 = 一次模型请求 = 重发整段上下文：

```
总成本 ≈ Σ(每次请求时的上下文长度) ≈ 上下文长度 × 请求次数
```

所以优化对象是**请求次数**，不是文档长度。三条落地手段：

- `SKILL.md` 只放流程和铁律，每次调用都进上下文，压到最短；
- 站点细节放 `references/`，只在处理该站时读，可以写细；
- 易错逻辑（短信解码、环境检查、成本计量）下沉成 `scripts/`，避免每次让模型重新推导。

**控件分类**（`references/browser-playbook.md` 有完整做法）：

| 类型 | 处理方式 |
| --- | --- |
| 真 `textarea` / `input` | `fill` 一次搞定 |
| 单行输入被包成 `div[role=button]` | `click` 聚焦后再 `press` **逐字符**输入（支持中文）；`fill` 会报 not fillable |
| 单选 / 多选 | `click` 字段 → `observe` → 点选项 ref |
| 多选（带筛选） | 输入筛选词后**点选项**，不要按 `ArrowDown`（会跳到未筛选列表首项，选错值） |
| 多级级联 | 逐级展开，只有叶子可选 |
| 日期 | 点年份标签切到十年表，`前一年` 一次跳十年，再点月份 |

**ref 规则**（踩坑总结）：

- 每次 `observe` 会**替换全部** ref，跨 observe 复用会点错元素；
- `maxTokens` 截断后未输出的 ref 一律无效，不能用"字段 ref + k"推算到截断点外；
- 不要批量执行"点开下拉"+"点选项"，选项可能还没渲染；
- `press` 不支持组合键，`press "Meta+a"` 会真的输入一个 `a`；清空字段用 `End` + 逐字 `Backspace`。

## 目录结构

```
resume-autofill/
├── SKILL.md                    流程编排。模型唯一加载的文件，约 120 行
├── README.md                   本文件（使用者文档，模型不读）
├── HANDBOOK.md                 开发者手册：项目目标、约束、工程原则、已知坑、自检清单
├── references/                 按需读取
│   ├── browser-playbook.md     通用机制与全部踩坑记录
│   ├── profile-schema.md       档案字段清单 / 模板
│   ├── sites.md                站点注册表（公司 / URL / 状态 / reference）
│   └── sites/
│       ├── czbank.md           浙商银行（已验证）
│       ├── xiaomi.md           小米 / Moka ATS（已验证）
│       └── bytedance.md        字节跳动（部分验证）
└── scripts/
    ├── preflight.mjs           环境闸门，一次调用给出全部结论
    ├── check-no-pii.mjs        交付前校验：个人数据不得出现在本目录（手册 C2）
    ├── bootstrap-profile.mjs   从简历自动解析出档案草稿 + 缺失清单
    ├── extract-resume.mjs      从简历抽取纯文本（给模型读散文段落用）
    ├── lib/extract-text.mjs    上面两个共用的取文本实现
    ├── read-sms-code.mjs       读短信验证码（含 attributedBody 解码）
    └── cost-report.mjs         回放 session 事件流，估算时间与 token
```

**加新站点**：在 `references/sites.md` 加一行标 `unverified` → 跑一次 → 照 `czbank.md` 的骨架写 `references/sites/<name>.md`（入口、登录、字段与可用控件、坑、成功信号、需人工项）→ 状态改 `verified`。站点文档可写细，注册表保持短。
