# 浙商银行 (China Zheshang Bank)

- **Entry**: https://zp.czbank.com.cn/zpweb/planController/gotoIndex.mvc?pageType=1
- **Resume path**: top-right account menu -> 个人中心 -> 我的简历
- **Status**: verified end to end (基本信息 and 教育背景 saved)
- **Stack**: Element Plus (Vue). Form lives in **two nested iframes**:
  `mainframe -> contentframe -> inner`. CSS selectors do not reach it; use refs only.

## Login

Fully automatable, verified several times:

1. click 登录 -> switch to the 短信验证码 tab;
2. fill 手机号 (this field has a real `textbox` ref);
3. the graphic CAPTCHA is **read-and-type** — `screenshot` the captcha element, read the
   characters, fill them;
4. click 发送验证码 (`link` ref);
5. read the SMS with `node scripts/read-sms-code.mjs --wait 180` (it polls internally);
6. the SMS code field **is** reachable by CSS: `input[placeholder="短信验证码"]` — the
   login page is in the main document, unlike the resume form;
7. click 登录.

Login state lives in the user's own Chrome profile, so it is independent of the bsk
session. How long it lasts is the site's server-side session timeout, not anything the
agent controls. **Both outcomes are confirmed**: a fresh session has opened straight into
「欢迎, <name>」 with no login, and on other occasions the session had expired and a full
re-login was needed. So **check the page first** (the nav shows the account name when
logged in) before spending calls on the login flow.

## Sections

`基本信息`, `教育背景`, `工作/实习经历`, `家庭情况`, `业务专长及承诺`, `附件信息`.
Each collapses to read-only with a 编辑 button and shows 不完整 until it passes validation.
The completeness percentage in the banner is the cheapest progress signal.

**Required uploads are the gate on 基本信息**: 上传证件照 and 上传生活照 are both
required, and the plugin has no upload action, so the section cannot save until a human
uploads them. Upfront: they raised completeness 32% -> 42% on their own.

## 基本信息 inventory

Fills cheaply (one `fill` each): 奖惩情况, 培训情况, 特长及爱好 — real textareas.

Dropdowns / cascaders (click, then option):
应聘类型, 目前状态, 婚姻状态, 民族, 政治面貌, 目前居住国家, 目前居住城市, 籍贯,
证件类型, 英语水平, 其他语言水平 (multi), 计算机水平 (multi), 职业资格证书 (multi),
实际工作年限, 金融工作从业年限, 现工作单位所属行业, 目前税前年薪, 期望税前年薪.

`div[role=button]` inputs needing click + `press` per character:
紧急联系电话, 现工作单位, 所在部门及岗位, 目前税前年薪, 期望税前年薪, 社交主页名称,
社交主页地址, 英语水平补充说明.

## Traps

- **姓名 is read-only.** It renders as a focused-looking input but the text is grey and
  typing does nothing. Do not spend calls trying to change the name here; if the profile
  name differs from the account name, tell the user it cannot be changed on this portal.
- **应聘类型 = 校招 changes the required set.** Choosing it turns 参加工作日期,
  实际工作年限, 金融工作从业年限, 现工作单位所属行业, 现工作单位, 所在部门及岗位,
  目前税前年薪, 期望税前年薪 from required into optional. Do this early; it removes
  eight required fields from the critical path.
- **目前居住国家 = 中国 makes 目前居住城市 required.** The picker is only two levels
  (亚洲 -> 中国) and stores 中国大陆.
- **籍贯 is three levels** (province -> city -> district). If the profile only records a
  city, pick the district matching 户籍所在地 and tell the user which one you chose.
- **金融工作从业年限 accepts non-negative integers only.** A value like 0.67 is rejected
  with 请输入不小于0的整数. Convert months to a whole number and say so.
- **Multi-select filter trap**: typing a filter then pressing `ArrowDown` + `Enter`
  selects the first item of the *unfiltered* list. Click the filtered option instead.
- **现工作单位 can arrive pre-filled with junk** (a truncated school name). Overwrite it.
- Save is blocked until both photos exist. The red 请上传证件照 / 请上传生活照 text is the
  tell. Count on a `request-help` handoff here.
- One early Save click is the cheapest way to enumerate the remaining required fields.

## 教育背景

Three entries, all required. The portal auto-adds the 高中 row, and it will not save
without it: 学校名称 plus 入学时间 / 毕业时间.

- `教育类型` is 全日制 / 非全日制 for degree entries, 全日制 / 成人教育 for 高中.
- `学位` is a cascader: 名誉博士 / 博士学位 / 硕士学位 / 学士学位 each expand to a
  second level (哲学硕士…, 工学硕士…, 理学学士…, plus professional degrees). 无 is a leaf.
- `专业类别` is a **three-level** cascader, e.g.
  工学类 -> 电子与信息类 -> 计算机软件, and 理学类 -> 数学类 -> 信息科学.
  Match the major, not the degree name.
- `最高学历近期综合排名(应届生)` is a flat select, 前5％ … 前40％及以下, highest required.
- **Exactly one entry must have 是否第一学历 = 是** — the first degree after high school,
  i.e. the bachelor's, not the master's. The form nags until this is set.
- Dates: the year label switches to a 10-year table and 前一年 jumps a decade. Selecting a
  year may pre-fill month 09, so click the month explicitly.

Verify success by the green toast (教育背景保存成功) and 教育背景 losing its 不完整 badge.

## Measured cost

First full pass over 基本信息 + 教育背景 in a warm session: ~150 browser calls, dominated
by re-observes between dropdown levels. Reading this file before touching the site is the
single largest saving available.
