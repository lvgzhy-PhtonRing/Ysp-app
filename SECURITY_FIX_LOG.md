# Ysp-app 隐私泄露修复 — 操作日志与同步指南

## 日期：2026-05-28

---

## 一、问题背景

Ysp-app 是 GitHub 公开仓库，以下文件存在隐私泄露：

| 文件 | 问题 |
|------|------|
| `public/a.json`（837KB） | 780 条完整财务/进销存数据，含支付宝账号、采购批次、利润、借贷记录等 |
| `public/cloud-config.json` | Supabase 项目 URL + anon key 明文暴露在仓库源码中 |

---

## 二、已完成的操作（远程仓库侧）

### 1. 修改 `.gitignore`
添加了以下两行，防止敏感文件被重新提交：
```
public/a.json
public/cloud-config.json
```

### 2. 修改 `cloud-config.json`
将 `"publicRead": true` 改为 `"publicRead": false`

### 3. 修改 `.github/workflows/deploy.yml`
新增步骤，在部署时从 GitHub Secret 动态生成 `cloud-config.json`：
```yaml
- name: Create cloud-config.json from secret
  run: echo '${{ secrets.CLOUD_CONFIG_JSON }}' > public/cloud-config.json
```
插入位置：在 `Install deps` 步骤之前。

### 4. 添加 GitHub Actions Secret
在仓库 Settings → Secrets and variables → Actions 中添加了：
- **Name**: `CLOUD_CONFIG_JSON`
- **Value**: 
```json
{"supabaseUrl":"https://mqdxmbsaddebxlallgos.supabase.co","supabaseAnonKey":"sb_publishable_pwZYqYeBwpJbj4Pt1vaQyQ_av4QZZ-U","stateId":"main","enabled":true,"publicRead":false}
```

### 5. 从 Git 历史中彻底清除敏感文件
使用 `git filter-branch` 重写了全部 63 个提交，从所有历史记录中移除了 `public/a.json` 和 `public/cloud-config.json`，然后 force push 到 GitHub。

### 6. 配置 Supabase RLS（行级安全策略）
在 ysp_state 表上执行了以下 SQL：
```sql
ALTER TABLE ysp_state ENABLE ROW LEVEL SECURITY;

-- 删除了原有的公开读取策略
DROP POLICY IF EXISTS "Public read" ON ysp_state;
DROP POLICY IF EXISTS "ysp_state_public_select" ON ysp_state;

-- 新建策略：只有已认证用户可以读写
CREATE POLICY "Auth users can read own state" ON ysp_state
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Auth users can insert own state" ON ysp_state
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Auth users can update own state" ON ysp_state
  FOR UPDATE USING (auth.uid() = owner_id);
```
保留了原有的 authenticated 策略（`ysp_state_owner_select/insert/update`）。

### 7. 验证结果

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 仓库中 a.json | 404 | 已删除 |
| 仓库中 cloud-config.json | 404 | 已删除 |
| Git 历史中敏感文件 | 已清除 | filter-branch 重写全部历史 |
| cloud-config.example.json | 200 | 保留（只有占位符，无敏感信息）|
| GitHub Pages 部署 | 成功 | cloud-config.json 由 Secret 动态生成 |
| 部署后 a.json 可访问性 | 404 | 不可访问 |
| 匿名访问 Supabase | 返回空数组 `[]` | RLS 已生效 |
| App 首页 | 200 | 正常运行 |

---

## 三、另一台电脑需要执行的操作

### 步骤 0：前提确认

> 以下命令在另一台电脑上的 `Ysp-app` 仓库目录下执行。
> 推荐打开终端（PowerShell 或 Git Bash），逐条复制执行。

### 步骤 1：备份本地数据文件

这两个文件在远程已被删除，但本地可能还有数据，先备份：

```bash
# 如果文件存在就备份
if [ -f "public/a.json" ]; then
  cp public/a.json ~/backup-a.json
  echo "a.json 已备份到 ~/backup-a.json"
fi

if [ -f "public/cloud-config.json" ]; then
  cp public/cloud-config.json ~/backup-cloud-config.json
  echo "cloud-config.json 已备份到 ~/backup-cloud-config.json"
fi
```

### 步骤 2：同步远程仓库

**警告**：这会把本地仓库强制重置为远程状态，未提交的修改会丢失。确保步骤 1 的备份已完成。

```bash
git fetch origin
git reset --hard origin/main
```

执行后 `git log --oneline -3` 应该看到：
```
73990f6 trigger deploy
54a6103 fix: remove sensitive data from public repo
...  (更早的提交)
```

### 步骤 3：恢复本地数据文件

把备份的数据文件放回 `public/` 目录（`.gitignore` 已配置，不会被提交）：

```bash
# 恢复 a.json
if [ -f ~/backup-a.json ]; then
  cp ~/backup-a.json public/a.json
  echo "a.json 已恢复到 public/"
fi

# 恢复 cloud-config.json
if [ -f ~/backup-cloud-config.json ]; then
  cp ~/backup-cloud-config.json public/cloud-config.json
  echo "cloud-config.json 已恢复到 public/"
fi
```

### 步骤 4：确认 git 不会跟踪这些文件

```bash
git status
```

输出中应该**看不到** `public/a.json` 或 `public/cloud-config.json`。如果看到，说明 `.gitignore` 有问题，联系我修复。

### 步骤 5：确认远程仓库连接正常

```bash
git remote -v
```

应该输出：
```
origin  https://github.com/lvgzhy-PhtonRing/Ysp-app.git (fetch)
origin  https://github.com/lvgzhy-PhtonRing/Ysp-app.git (push)
```

---

## 四、日常使用注意事项

1. **不要 `git add public/a.json` 或 `git add public/cloud-config.json`**——即使加了也会被 `.gitignore` 阻止
2. **如果需要在另一台电脑上也修改代码并推送**：正常 `git commit` + `git push`，`cloud-config.json` 会由 GitHub Actions 在部署时自动生成，不影响本地开发
3. **`cloud-config.json` 中的 anon key 仍然有效**——Supabase 的 anon key 本身设计为客户端可公开，真正的安全防线是 RLS。如果以后需要更换 key，同时更新：
   - GitHub Secret `CLOUD_CONFIG_JSON`
   - 本地各电脑上的 `public/cloud-config.json`
   - Supabase 项目设置中的 JWT secret
4. **Supabase RLS 的 `owner_id`**：确保 Supabase 中 `ysp_state` 表的 `owner_id` 字段填写了你的 Supabase 用户 UUID（在 Authentication → Users 中可以找到），这样登录后你才能读写数据

---

## 五、相关链接

| 用途 | 链接 |
|------|------|
| App 地址 | https://lvgzhy-phtonring.github.io/Ysp-app/ |
| 仓库地址 | https://github.com/lvgzhy-PhtonRing/Ysp-app |
| 仓库 Actions | https://github.com/lvgzhy-PhtonRing/Ysp-app/actions |
| 仓库 Secrets | https://github.com/lvgzhy-PhtonRing/Ysp-app/settings/secrets/actions |
| Supabase 项目 | https://supabase.com/dashboard/project/mqdxmbsaddebxlallgos |
| Supabase SQL Editor | https://supabase.com/dashboard/project/mqdxmbsaddebxlallgos/sql/new |
| Supabase API Settings | https://supabase.com/dashboard/project/mqdxmbsaddebxlallgos/settings/api |
