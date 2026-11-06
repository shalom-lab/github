# Highutb

在线工具：[https://shalom-lab.github.io/github/](https://shalom-lab.github.io/github/)

GitHub Pages 上的 **Actions Secrets 注入台**：BYOK 填入 PAT，编辑键值对，下拉选仓库，一键写入目标仓库的 GitHub Actions Secrets。

## 功能

- **BYOK**：PAT 存本机 `localStorage`，启动自动读取
- **仓库下拉**：用 Token 拉取可访问仓库列表
- **键值编辑**：支持 `KEY=VALUE` 多行，或 JSON 对象 `{"A":"B"}`
- **注入**：对选中仓库创建/更新 Actions Secrets（libsodium sealed box）
- **IndexedDB**：键值模板可保存 / 清除（与 Token 分开存储）

## localStorage 键名

| 键 | 含义 |
| --- | --- |
| `gh-highutb-token` | GitHub PAT |
| `gh-highutb-repo` | 上次选中的 `owner/repo` |

可在页面填写，也可事先写入 localStorage；启动会自动读。

## 权限要求

PAT 需要对目标仓库有 **admin**（才能写 Actions Secrets）。

- Classic：勾选 `repo`
- Fine-grained：目标仓库 + **Secrets: Read and write**（Metadata: Read）

## 本地开发

```bash
npm install
npm run dev
```

开发地址：`http://127.0.0.1:5173/github/`

## 部署

仓库：`https://github.com/shalom-lab/github.git`（默认分支 `main`，Vite `base` 为 `/github/`）。

1. Push 到 `main`
2. Settings → Pages → Source: **GitHub Actions**
3. 站点：`https://shalom-lab.github.io/github/`

## 安全说明

- Token 与模板只留在浏览器本地，注入时直连 `api.github.com`
- 不要把真实 PAT / Secret 值提交进仓库
