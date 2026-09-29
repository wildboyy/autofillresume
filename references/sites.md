# Site registry

One row per target. `status` is one of:

- `verified` — a full run succeeded and `references/sites/<name>.md` reflects reality;
- `partial` — some flow confirmed, no successful end-to-end save yet;
- `unverified` — listed but never attempted. Expect to spend calls discovering the flow,
  and write the reference doc on the way out.

The agent works only on the sites the user asked for. Never crawl this list on its own.

| Site | URL | Status | Reference | Notes |
| --- | --- | --- | --- | --- |
| 浙商银行 | https://zp.czbank.com.cn/zpweb/planController/gotoIndex.mvc?pageType=1 | verified | `sites/czbank.md` | SMS + text CAPTCHA, fully automatable. Two required photo uploads need a human. |
| 字节跳动 | ByteDance campus recruiting | partial | `sites/bytedance.md` | Click-the-shapes CAPTCHA needs a human. Formily bare inputs. |
| 阿里巴巴 | https://campus-talent.alibaba.com/personal/resume | verified | `sites/alibaba.md` | 校招主站 campus-talent；登录=短信/淘宝支付宝/微信，用户用微信（弹窗交用户选）。微信账号简历已完整（PDF 自动解析过），无需填写。talent.alibaba.com 是集团门户/阿里星，别混。 |
| 腾讯 | https://join.qq.com | verified | `sites/tencent.md` | **QQ and WeChat are TWO separate accounts** — ask which one before logging in. Resume at `/resume.html`; editor saves without navigating, verify on the view page. |
| 美团 | https://zhaopin.meituan.com | partial | `sites/meituan.md` | Campus job list found; no login entry on any public page — login is triggered by 投递 or the avatar. Not yet located. |
| 华为 | https://career.huawei.com/cn | verified | `sites/huawei.md` | 手机号短信登录可全自动；个人中心→我的简历→编辑简历，简历已完整。注意导师姓名=本人（疑似解析错）。 |
| 百度 | https://talent.baidu.com/jobs/trend | partial | `sites/baidu.md` | browser navigate 落 about:blank（SPA/重定向问题未解决），web_fetch 可达。 |
| 京东 | https://campus.jd.com/#/resume | verified | `sites/jd.md` | SPA；简历直达 #/resume（账号菜单 portal 不展开）。已登录，简历 100% 完整。 |
| 网易 | https://hr.163.com | verified | `sites/netease.md` | 校招在 campus.163.com；登录=证件+手机号+短信，每次获取验证码都过网易易盾滑块（需人工）；简历已完整。 |
| 小米 | https://xiaomi.jobs.f.mioffice.cn/campus | verified | `sites/xiaomi.md` | Moka ATS. Phone + SMS login; slider CAPTCHA needs a human. Resume at `/campus/resume/edit`. Upload the PDF first — Moka parses it, then resets 年龄/证件/所在地点. |
| 中国工商银行 | https://job.icbc.com.cn | unverified | — | Bank portals skew to long required forms; expect the bank pattern. |
| 中国建设银行 | https://job.ccb.com | unverified | — | |
| 中国银行 | https://campus.chinahr.com | unverified | — | |
| 招商银行 | https://career.cmbchina.com | unverified | — | |
| 国家电网 | https://zhaopin.sgcc.com.cn | unverified | — | |

## Adding a row

Append with `status: unverified` and no reference. After the first real run, create
`references/sites/<name>.md` using the shape of `sites/czbank.md`:

1. entry URL, resume path, stack, iframe nesting;
2. login mechanism and whether it is automatable;
3. field inventory with the control type that worked for each field;
4. traps, in the order they cost time;
5. the site's success signal;
6. what a human still has to do.

Keep each site doc under ~150 lines. Site docs are read on demand, so they are cheap to
keep detailed; this registry is read every run, so keep it short.
