# 百度（校招）

- 状态: partial —— 入口 URL 已确认（web_fetch 可达），但浏览器 navigate 落 about:blank，未登录
- 校招站点: https://talent.baidu.com/jobs/trend

## 入口

- `talent.baidu.com/jobs/trend`（百度校园招聘，web_fetch HTTP 200 可达；页面有「登录」「职位」「招聘动态」等导航）。

## 登录

- 待探：页面上有「登录」入口，具体方式（百度账号 / 手机 / 扫码）未探明。

## 陷阱（未解决）

- **browser navigate 到 talent.baidu.com 反复落 about:blank**（根路径和 /jobs/trend 都这样，
  连试 3 次），但 web_fetch 能拿到 200 + 内容。疑似 SPA / 重定向 / 反自动化问题。
- 待试：换入口（如 `campus.baidu.com`）或借用户已开的 tab 再进。
