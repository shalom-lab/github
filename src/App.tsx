import { useEffect, useState } from "react";
import {
  clearRepo,
  clearToken,
  maskToken,
  readRepo,
  readToken,
  saveRepo,
  saveToken,
  TOKEN_KEY,
  REPO_KEY,
} from "./lib/byok";
import {
  injectSecrets,
  listRepos,
  type RepoItem,
  verifyToken,
} from "./lib/github";
import {
  deleteTemplate,
  getActiveTemplateId,
  listTemplates,
  saveNamedTemplate,
  setActiveTemplateId,
  type SecretsTemplate,
} from "./lib/idb";
import { DEFAULT_TEMPLATE, parseSecretsText } from "./lib/parseSecrets";

type Status = { kind: "idle" | "ok" | "err" | "busy"; text: string };
type TabId = "inject" | "templates" | "settings" | "help";

const NAV: { id: TabId; label: string; hint: string }[] = [
  { id: "inject", label: "注入", hint: "写入 Secrets" },
  { id: "templates", label: "模板", hint: "JSON 管理" },
  { id: "settings", label: "设置", hint: "BYOK Token" },
  { id: "help", label: "说明", hint: "使用指引" },
];

export default function App() {
  const [tab, setTab] = useState<TabId>("inject");
  const [tokenInput, setTokenInput] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [login, setLogin] = useState("");
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [secretsText, setSecretsText] = useState(DEFAULT_TEMPLATE);
  const [templates, setTemplates] = useState<SecretsTemplate[]>([]);
  const [activeTemplateId, setActiveId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [settingsStatus, setSettingsStatus] = useState<Status>({
    kind: "idle",
    text: "",
  });
  const [injectStatus, setInjectStatus] = useState<Status>({
    kind: "idle",
    text: "",
  });
  const [idbStatus, setIdbStatus] = useState<Status>({ kind: "idle", text: "" });
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    const t = readToken();
    const r = readRepo();
    setSavedToken(t);
    setTokenInput(t);
    setSelectedRepo(r);
    void refreshTemplates();
    if (t) {
      void bootstrapWithToken(t, r);
    } else {
      setTab("settings");
    }
  }, []);

  async function refreshTemplates(preferId?: string) {
    const [rows, active] = await Promise.all([listTemplates(), getActiveTemplateId()]);
    setTemplates(rows);
    const nextId =
      preferId ||
      (active && rows.some((x) => x.id === active) ? active : rows[0]?.id || "");
    setActiveId(nextId);
    setPreviewId((prev) =>
      prev && rows.some((x) => x.id === prev) ? prev : nextId,
    );
    const chosen = rows.find((x) => x.id === nextId);
    if (chosen) {
      setSecretsText(chosen.json);
      setTemplateName(chosen.name);
    }
  }

  async function bootstrapWithToken(token: string, preferredRepo: string) {
    setSettingsStatus({ kind: "busy", text: "正在验证 Token…" });
    try {
      const user = await verifyToken(token);
      setLogin(user.login);
      setSettingsStatus({ kind: "busy", text: "正在拉取仓库列表…" });
      const list = await listRepos(token);
      setRepos(list);
      const names = new Set(list.map((x) => x.full_name));
      if (preferredRepo && names.has(preferredRepo)) {
        setSelectedRepo(preferredRepo);
      } else if (!preferredRepo && list[0]) {
        setSelectedRepo(list[0].full_name);
      }
      setSettingsStatus({
        kind: "ok",
        text: `已登录 @${user.login}，共 ${list.length} 个仓库`,
      });
    } catch (e) {
      setLogin("");
      setRepos([]);
      setSettingsStatus({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
      setTab("settings");
    }
  }

  async function onSaveToken() {
    const token = tokenInput.trim();
    if (!token) {
      setSettingsStatus({ kind: "err", text: "请先填写 GitHub PAT" });
      return;
    }
    setSettingsStatus({ kind: "busy", text: "保存并验证中…" });
    try {
      const user = await verifyToken(token);
      saveToken(token);
      setSavedToken(token);
      setLogin(user.login);
      const list = await listRepos(token);
      setRepos(list);
      const names = new Set(list.map((x) => x.full_name));
      if (selectedRepo && names.has(selectedRepo)) {
        saveRepo(selectedRepo);
      } else if (list[0]) {
        setSelectedRepo(list[0].full_name);
        saveRepo(list[0].full_name);
      }
      setSettingsStatus({
        kind: "ok",
        text: `已保存。@${user.login}，${list.length} 个仓库可选`,
      });
      setTab("inject");
    } catch (e) {
      setSettingsStatus({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    }
  }

  function onClearToken() {
    if (!confirm("确定清除本地 PAT？")) return;
    clearToken();
    clearRepo();
    setSavedToken("");
    setTokenInput("");
    setLogin("");
    setRepos([]);
    setSelectedRepo("");
    setSettingsStatus({ kind: "ok", text: "已清除 Token" });
  }

  async function onSelectTemplate(id: string) {
    const row = templates.find((t) => t.id === id);
    if (!row) return;
    setActiveId(id);
    setPreviewId(id);
    setSecretsText(row.json);
    setTemplateName(row.name);
    await setActiveTemplateId(id);
    setIdbStatus({ kind: "ok", text: `已选用模板「${row.name}」` });
  }

  async function onSaveTemplate(asNew: boolean) {
    setIdbStatus({ kind: "busy", text: "保存中…" });
    try {
      const secrets = parseSecretsText(secretsText);
      const json = JSON.stringify(secrets, null, 2);
      const name =
        templateName.trim() ||
        `模板 ${new Date().toLocaleString("zh-CN", { hour12: false })}`;
      const targetId = asNew ? undefined : previewId || activeTemplateId || undefined;
      const saved = await saveNamedTemplate(name, json, targetId);
      setSecretsText(json);
      setTemplateName(saved.name);
      await refreshTemplates(saved.id);
      setIdbStatus({
        kind: "ok",
        text: asNew
          ? `已新建模板「${saved.name}」`
          : `已更新模板「${saved.name}」`,
      });
    } catch (e) {
      setIdbStatus({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function onDeleteTemplate(id: string) {
    const row = templates.find((t) => t.id === id);
    if (!row) return;
    if (!confirm(`确定删除模板「${row.name}」？此操作不可恢复。`)) return;
    setIdbStatus({ kind: "busy", text: "删除中…" });
    try {
      await deleteTemplate(id);
      const remaining = templates.filter((t) => t.id !== id);
      if (!remaining.length) {
        setSecretsText(DEFAULT_TEMPLATE);
        setTemplateName("");
        setActiveId("");
        setPreviewId("");
      }
      await refreshTemplates(remaining[0]?.id);
      setIdbStatus({ kind: "ok", text: `已删除「${row.name}」` });
    } catch (e) {
      setIdbStatus({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function onInject() {
    const token = savedToken || readToken();
    if (!token) {
      setInjectStatus({ kind: "err", text: "请先到「设置」保存 GitHub PAT" });
      setTab("settings");
      return;
    }
    if (!selectedRepo) {
      setInjectStatus({ kind: "err", text: "请选择目标仓库" });
      return;
    }
    let secrets: Record<string, string>;
    try {
      secrets = parseSecretsText(secretsText);
    } catch (e) {
      setInjectStatus({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    const keys = Object.keys(secrets);
    if (!keys.length) {
      setInjectStatus({ kind: "err", text: "没有可注入的键值对" });
      return;
    }
    if (
      !confirm(
        `将向 ${selectedRepo} 注入 / 覆盖 ${keys.length} 个 Actions Secret：\n${keys.join(", ")}\n\n继续？`,
      )
    ) {
      return;
    }

    saveRepo(selectedRepo);
    setInjectStatus({ kind: "busy", text: `正在注入 ${keys.length} 个 Secret…` });
    try {
      const results = await injectSecrets(token, selectedRepo, secrets);
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        setInjectStatus({
          kind: "err",
          text: `完成但有失败：${failed.map((f) => `${f.name}(${f.error})`).join("；")}`,
        });
      } else {
        setInjectStatus({
          kind: "ok",
          text: `已注入 ${results.length} 个 Secret 到 ${selectedRepo}`,
        });
      }
    } catch (e) {
      setInjectStatus({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const tokenReady = Boolean(savedToken);
  const busy =
    settingsStatus.kind === "busy" ||
    injectStatus.kind === "busy" ||
    idbStatus.kind === "busy";
  const preview = templates.find((t) => t.id === previewId) ?? templates[0];
  const activeName = templates.find((t) => t.id === activeTemplateId)?.name;

  const pageTitle =
    NAV.find((n) => n.id === tab)?.label ?? "工作台";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 32 32" width="22" height="22">
              <g
                transform="rotate(-45 16 16)"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.5 6.2h7" />
                <path d="M14 6.2v3.2" />
                <rect x="11.2" y="9.2" width="5.6" height="12.2" rx="1.2" />
                <rect
                  x="12.2"
                  y="14.2"
                  width="3.6"
                  height="5.8"
                  rx="0.6"
                  fill="currentColor"
                  stroke="none"
                  opacity="0.35"
                />
                <path d="M16.8 11.4h1.6M16.8 13.2h1.6M16.8 15h1.6" strokeWidth="1.3" />
                <path d="M12.4 21.4h3.2v1.6h-3.2z" fill="currentColor" stroke="none" />
                <path d="M14 23v4.4" />
              </g>
            </svg>
          </span>
          <div>
            <p className="brand">Highutb</p>
            <p className="tagline">Secrets 工作台</p>
          </div>
        </div>

        <nav className="side-nav" aria-label="主导航">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`nav-item ${tab === n.id ? "nav-item-active" : ""}`}
              aria-current={tab === n.id ? "page" : undefined}
              onClick={() => setTab(n.id)}
            >
              <span className="nav-label">{n.label}</span>
              <span className="nav-hint">{n.hint}</span>
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <div className={`side-status ${tokenReady ? "is-ok" : "is-warn"}`}>
            <span className="dot" aria-hidden />
            <div>
              <strong>{tokenReady ? "Token 已就绪" : "未配置 Token"}</strong>
              <p>
                {tokenReady
                  ? `@${login || "…"} · ${maskToken(savedToken)}`
                  : "请到设置填写 PAT"}
              </p>
            </div>
          </div>
          <a
            className="gh-link"
            href="https://github.com/shalom-lab/github"
            target="_blank"
            rel="noreferrer"
            title="shalom-lab/github"
            aria-label="打开 GitHub 仓库 shalom-lab/github"
          >
            <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
            <span>shalom-lab/github</span>
          </a>
        </div>
      </aside>

      <div className="main">
        <header className="main-head">
          <div>
            <p className="eyebrow">工作台</p>
            <h1>{pageTitle}</h1>
          </div>
          {activeName && tab === "inject" && (
            <span className="chip chip-soft">模板 · {activeName}</span>
          )}
        </header>

        <main className="content">
        {tab === "inject" && (
          <section className="pane" aria-label="注入">
            <div className="pane-head">
              <p>选择仓库与 JSON 模板，写入 Actions Secrets。</p>
            </div>

            {!tokenReady && (
              <div className="banner">
                尚未配置 Token。
                <button type="button" className="linkish" onClick={() => setTab("settings")}>
                  去设置
                </button>
              </div>
            )}

            <label className="field">
              <span>目标仓库</span>
              <select
                value={selectedRepo}
                onChange={(e) => {
                  setSelectedRepo(e.target.value);
                  if (e.target.value) saveRepo(e.target.value);
                }}
                disabled={!tokenReady || busy || repos.length === 0}
              >
                {repos.length === 0 ? (
                  <option value="">请先在「设置」保存有效 Token</option>
                ) : (
                  repos.map((r) => (
                    <option key={r.full_name} value={r.full_name}>
                      {r.full_name}
                      {r.private ? " · private" : ""}
                      {r.permissions?.admin ? " · admin" : ""}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="field">
              <span>
                选用模板
                {activeName ? ` · 当前：${activeName}` : ""}
              </span>
              <div className="row">
                <select
                  value={activeTemplateId}
                  onChange={(e) => void onSelectTemplate(e.target.value)}
                  disabled={busy || templates.length === 0}
                >
                  {templates.length === 0 ? (
                    <option value="">暂无模板，请到「模板」页新建</option>
                  ) : (
                    templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))
                  )}
                </select>
                <button type="button" className="btn" onClick={() => setTab("templates")}>
                  管理模板
                </button>
              </div>
            </label>

            <label className="field">
              <span>Secrets 内容（KEY=VALUE 或 JSON，可再改）</span>
              <textarea
                rows={12}
                spellCheck={false}
                value={secretsText}
                onChange={(e) => setSecretsText(e.target.value)}
                disabled={busy}
                placeholder={'API_KEY=xxx\nOTHER=yyy\n\n# 或\n{"API_KEY":"xxx"}'}
              />
            </label>

            <div className="actions">
              <button
                type="button"
                className="btn primary"
                onClick={onInject}
                disabled={busy || !tokenReady || !selectedRepo}
              >
                注入
              </button>
            </div>
            <StatusLine status={injectStatus} />
          </section>
        )}

        {tab === "templates" && (
          <section className="pane" aria-label="模板">
            <div className="pane-head">
              <p>保存在本机 IndexedDB；可选用、更新、删除。</p>
            </div>

            <div className="tmpl-layout">
              <div className="tmpl-list" role="list">
                {templates.length === 0 ? (
                  <p className="hint">还没有模板。下方填写名称与 JSON 后点「新建」。</p>
                ) : (
                  templates.map((t) => (
                    <div
                      key={t.id}
                      role="listitem"
                      className={`tmpl-item ${previewId === t.id ? "tmpl-item-active" : ""}`}
                    >
                      <button
                        type="button"
                        className="tmpl-pick"
                        onClick={() => {
                          setPreviewId(t.id);
                          setSecretsText(t.json);
                          setTemplateName(t.name);
                        }}
                      >
                        <strong>{t.name}</strong>
                        <span>
                          {Object.keys(safeParseKeys(t.json)).length} 个键 ·{" "}
                          {new Date(t.updatedAt).toLocaleString("zh-CN", {
                            hour12: false,
                          })}
                          {activeTemplateId === t.id ? " · 选用中" : ""}
                        </span>
                      </button>
                      <div className="tmpl-item-actions">
                        <button
                          type="button"
                          className="btn"
                          disabled={busy}
                          onClick={() => void onSelectTemplate(t.id)}
                        >
                          选用
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          disabled={busy}
                          onClick={() => void onDeleteTemplate(t.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="tmpl-editor">
                <label className="field">
                  <span>模板名称</span>
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="例如：生产环境 / Chrome 发布"
                    disabled={busy}
                  />
                </label>
                <label className="field">
                  <span>JSON 内容</span>
                  <textarea
                    rows={12}
                    spellCheck={false}
                    value={secretsText}
                    onChange={(e) => setSecretsText(e.target.value)}
                    disabled={busy}
                    placeholder='{"API_KEY":"xxx","TOKEN":"yyy"}'
                  />
                </label>
                {preview && (
                  <p className="hint">
                    预览中：{preview.name}
                    {activeTemplateId === preview.id ? "（当前注入选用）" : ""}
                  </p>
                )}
                <div className="actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void onSaveTemplate(true)}
                  >
                    新建
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || !activeTemplateId}
                    onClick={() => void onSaveTemplate(false)}
                  >
                    更新当前
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || !activeTemplateId}
                    onClick={() => {
                      void onSelectTemplate(activeTemplateId);
                      setTab("inject");
                    }}
                  >
                    去注入
                  </button>
                </div>
                <StatusLine status={idbStatus} />
              </div>
            </div>
          </section>
        )}

        {tab === "settings" && (
          <section className="pane" aria-label="设置">
            <div className="pane-head">
              <p>Token 仅存本机 localStorage，启动自动读取。</p>
            </div>

            <p className="hint">
              键名 <code>{TOKEN_KEY}</code> / <code>{REPO_KEY}</code>
              。也可事先写入 localStorage。PAT 需对目标仓库有{" "}
              <strong>admin</strong>（写 Actions Secrets）。
            </p>

            <label className="field">
              <span>Personal Access Token</span>
              <div className="row">
                <input
                  type={showToken ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ghp_… 或 fine-grained token"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowToken((v) => !v)}
                >
                  {showToken ? "隐藏" : "显示"}
                </button>
              </div>
            </label>

            <div className="actions">
              <button
                type="button"
                className="btn primary"
                onClick={onSaveToken}
                disabled={busy}
              >
                保存
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={onClearToken}
                disabled={busy}
              >
                清除
              </button>
            </div>
            <StatusLine status={settingsStatus} />
          </section>
        )}

        {tab === "help" && (
          <section className="pane" aria-label="说明">
            <div className="pane-head">
              <p>本机直连 GitHub API，不经第三方中转。</p>
            </div>
            <ol className="steps">
              <li>
                在「设置」填入 PAT 并保存（Classic 勾选 <code>repo</code>；Fine-grained
                需 Secrets: Read and write）。
              </li>
              <li>
                在「模板」新建多个 JSON 模板，可随时选用或删除。
              </li>
              <li>到「注入」选仓库与模板，点「注入」写入 Actions Secrets。</li>
            </ol>
            <p className="hint">
              模板以 JSON 存 IndexedDB；Token 存 localStorage。两者互不混用。
            </p>
          </section>
        )}
        </main>
      </div>
    </div>
  );
}

function safeParseKeys(json: string): Record<string, string> {
  try {
    return parseSecretsText(json);
  } catch {
    return {};
  }
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle" || !status.text) return null;
  return (
    <p className={`status status-${status.kind}`} role="status">
      {status.text}
    </p>
  );
}
