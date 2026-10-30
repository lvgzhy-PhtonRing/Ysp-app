# 手机只读查询新版主数据实施计划

日期：2026-10-31
设计：`docs/superpowers/specs/2026-10-31-mobile-main-readonly-design.md`

## 任务 1：私有主数据认证与读取

- [x] 在手机加载页增加账号、密码输入和登录/登出状态。
- [x] 使用配置中的 Supabase URL/anon key 调用 Auth password 与 refresh-token 接口；令牌仅放 sessionStorage。
- [x] 读取 `id=main` 时发送登录 JWT，不再要求 `is_public=true`；保持 GET-only。
- [x] 会话过期时续期一次，失败则清会话并返回登录界面；加入请求超时与重试提示。
- [x] 配置、身份认证和读取错误分别给出用户可读说明。

## 任务 2：新版数据呈现

- [x] 增加与主程序一致的全局 Owner 筛选（默认 Papa）；商品查询和批次统计继续跨 Owner。
- [x] 销售页按主程序规则提供“当前 Owner / 全部 Owner”范围切换，并显示跨 Owner 标识。
- [x] 销售增加渠道筛选及记录展示；缺失 Owner/shop 时按主程序迁移约定推导。
- [x] 显示可选交易确认状态和入账日期；若新版字段不存在则不显示。
- [x] Payton 库存长短线文案映射为自留/投资；支付宝计算器匹配主程序的 Papa 销售、收支、借贷、库存、采购口径及 Payton 基金。
- [x] 补齐现金流与负债监控；按当前 Owner、Payton 开业日期和月末快照复用主程序计算规则。
- [x] Payton Owner 财务入口显示只读皮蛋金库；Papa Owner 显示公共收支和借贷页。

## 任务 3：刷新、状态和文档

- [x] 增加全局刷新与 `updated_at` 展示；刷新期间禁用重复点击，失败时保留现有数据。
- [x] 登录成功后允许手动登出并清除 sessionStorage。
- [x] 更新 README 手机页说明，删除不存在的 JSON URL 回退入口描述。

## 任务 4：检查与交付

- [x] 静态检查变更 diff，确认手机页只有 Auth/GET/Logout 请求、没有主数据写入；7 段内嵌脚本解析通过。
- [x] 使用现有依赖完成生产 build；输出成功，只有现有 CSS 选择器、Browserslist 数据和包体积警告。
- [ ] 尚未用真实云端账号做登录后的浏览器验收；本轮不触碰 Supabase 数据。
- [x] 不连接或修改 Supabase 数据，不推送部署；向大王陛下汇报线上验证所需条件。

## Review Focus

- `publicRead:false` 时仍需通过 Auth JWT 读取私有 main；匿名访问应失败。
- 过期/无效令牌不可进入空数据页；续期失败清会话。
- 首页支付宝公式必须始终使用主程序的 Papa 账目及 Payton 基金口径；Owner 和店铺筛选不改变该公式。
- 商品查询、批次回款、转运记录应按主程序跨 Owner 取数；批次收入按 Owner+SID+下单日分组并累加。
- 未知或缺失字段不使旧、新 payload 崩溃；渠道推断与主程序截止日一致。
- 页面刷新失败时保留旧快照和旧更新时间，并显示失败提示。
