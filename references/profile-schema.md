# Profile schema

The profile is the single source of truth for every site. Format: flat `key: value`,
one fact per line, no tables, no nesting, no commentary. Flat wins because the model
parses it in one read and the user can edit a line without understanding a structure.

Default filename: `简历信息-解析版.md` in the working directory. Keep a filled example
next to it if useful, but the live file is the one the agent reads.

Rules:

- A blank value means "unknown", not "none". Write 无 explicitly when the answer is none.
- Add site-specific keys with a prefix rather than restructuring: `教育3学校:`.
- Never delete a line; correct it. Old values are the audit trail.
- When a site needs something new, append it here so the next site reuses it.

## Identity

```
姓名
曾用名
性别
出生日期            # YYYY-MM-DD
年龄
民族
政治面貌
身高cm
体重kg
婚姻状态
籍贯                # country + province + city (+ district if the site forces one)
出生地
户籍所在地
证件类型
证件号码
```

## Contact

```
手机号
电子邮箱
备用邮箱
紧急联系人姓名
紧急联系人关系
紧急联系电话
微信号
QQ号
社交主页名称
社交主页地址
现居住国家
现居住城市
现居住地址
```

## Employment status and expectations

Sites branch hard on these; getting them wrong makes whole blocks required or optional.

```
应聘类型            # 校招/社招
目前状态            # 在校 / 应届毕业生 / 在职 / 已离职
参加工作日期        # YYYY-MM
实际工作年限        # years, integer only on most portals
金融工作从业年限    # whichever unit the site uses; state the unit in the value
现工作单位
现工作单位所属行业
所在部门及岗位
目前税前年薪万元
期望税前年薪万元
期望工作地点
期望岗位
可到岗时间
```

## Language, skills, certificates

```
英语水平
英语补充水平说明    # e.g. the score
其他语言水平
计算机水平
职业资格证书
```

## Narrative fields

These are the expensive ones to type and the cheapest to fill, because real `textarea`
elements accept `fill` in one call. Keep them ready-made here.

```
奖惩情况
培训情况
特长及爱好
自我评价
```

## Compliance questions

Bank and state-owned portals ask a fixed block of yes/no questions, almost always
answered 无/否. Keep the answers here so they are never re-asked.

```
是否受过处分或曾被惩诫开除辞退
是否曾有违法违规违纪涉黑涉恶或其他不良行为
是否与应聘单位在职员工有近亲属关系
是否患有精神病传染病及其他严重疾病
是否与现单位签订竞业限制或脱密协议
是否有经商办企业或在其他单位兼职
```

## Education, one block per entry, **most recent first**

```
教育N学校
教育N学历            # 高中 / 大学本科 / 硕士研究生 / 博士研究生
教育N学位            # 理学学士 / 工学硕士 ... ; 无 for high school
教育N专业
教育N学院
教育N起止            # YYYY-MM ~ YYYY-MM
教育N学历类型        # 全日制 / 非全日制 / 成人教育
教育N是否最高学历
教育N是否第一学历    # exactly one entry must be 是
教育NGPA或排名
教育N主修课程
教育N导师
```

Portals frequently force a **high-school row** and a **专业类别** cascader
(category -> group -> major). Ask the user for the high-school name and dates up front;
it is the most common hard blocker.

## Internships and jobs, **most recent first**

```
实习N公司
实习N职位
实习N起止
实习N内容
实习N离职原因
工作N公司
工作N职位
工作N起止
工作N内容
工作N离职原因
```

## Projects

```
项目N名称
项目N角色
项目N起止
项目N链接
项目N内容
```

## Family

```
家庭N关系
家庭N姓名
家庭N工作单位
家庭N职务
家庭N联系电话
```

## Attachments

Local absolute paths, or `~`-relative. Needed for upload handoffs.

```
证件照文件
生活照文件
简历附件文件名
```
