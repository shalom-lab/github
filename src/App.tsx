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
import { clearTemplate, loadTemplate, saveTemplate } from "./lib/idb";
import { DEFAULT_TEMPLATE, parseSecretsText } from "./lib/parseSecrets";

type Status = { kind: "idle" | "ok" | "err" | "busy"; text: string };
type TabId = "inject" | "settings" | "help";

const TABS: { id: TabId; label: string }[] = [
  { id: "inject", label: "注入" },
  { id: "settings", label: "设置" },
  { id: "help", label: "说明" },
];

export default function App() {
  const [tab, setTab] = useState<TabId>("inject");
  const [tokenInput, setTokenInput] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [login, setLogin] = useState("");
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [secretsText, setSecretsText] = useState(DEFAULT_TEMPLATE);
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
    void loadTemplate().then((text) => {
      if (text) setSecretsText(text);
    });
    if (t) {
      void bootstrapWithToken(t, r);
    } else {
      setTab("settings");
    }
  }, []);

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

  async function onSaveTemplate() {
    setIdbStatus({ kind: "busy", text: "保存中…" });
    try {
      const secrets = parseSecretsText(secretsText);
      const json = JSON.stringify(secrets, null, 2);
      await saveTemplate(json);
      setSecretsText(json);
      setIdbStatus({ kind: "ok", text: "已保存为 JSON 到 IndexedDB" });
    } catch (e) {
      setIdbStatus({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function onClearTemplate() {
    if (!confirm("确定清除 IndexedDB 中保存的键值模板？")) return;
    setIdbStatus({ kind: "busy", text: "清除中…" });
    try {
      await clearTemplate();
      setSecretsText(DEFAULT_TEMPLATE);
      setIdbStatus({ kind: "ok", text: "已清除模板" });
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

  return (
    <div className="bench">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="logo" aria-hidden>
            H
          </span>
          <div>
            <p className="brand">Highutb</p>
            <p className="tagline">Actions Secrets 工作台</p>
          </div>
        </div>
        <div className="topbar-meta">
          <span className={`chip ${tokenReady ? "chip-ok" : "chip-warn"}`}>
            {tokenReady
              ? `@${login || "…"} · ${maskToken(savedToken)}`
              : "未配置 Token"}
          </span>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="工作台分区">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? "tab-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="workspace" role="tabpanel">
        {tab === "inject" && (
          <section className="pane" aria-label="注入">
            <div className="pane-head">
              <h1>注入 Secrets</h1>
              <p>选择仓库，编辑键值对，写入 Actions Secrets。</p>
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
              <span>Secrets 键值对（KEY=VALUE 或 JSON）</span>
              <textarea
                rows={14}
                spellCheck={false}
                value={secretsText}
                onChange={(e) => setSecretsText(e.target.value)}
                disabled={busy}
                placeholder={'API_KEY=xxx\nOTHER=yyy\n\n# 或\n{"API_KEY":"xxx"}'}
              />
            </label>

            <div className="actions">
              <button type="button" className="btn" onClick={onSaveTemplate} disabled={busy}>
                保存 JSON
              </button>
              <button type="button" className="btn" onClick={onClearTemplate} disabled={busy}>
                清除模板
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={onInject}
                disabled={busy || !tokenReady || !selectedRepo}
              >
                注入
              </button>
            </div>
            <StatusLine status={idbStatus} />
            <StatusLine status={injectStatus} />
          </section>
        )}

        {tab === "settings" && (
          <section className="pane" aria-label="设置">
            <div className="pane-head">
              <h1>BYOK 设置</h1>
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
              <h1>使用说明</h1>
              <p>本机直连 GitHub API，不经第三方中转。</p>
            </div>
            <ol className="steps">
              <li>
                在「设置」填入 PAT 并保存（Classic 勾选 <code>repo</code>；Fine-grained
                需 Secrets: Read and write）。
              </li>
              <li>到「注入」下拉选择目标仓库。</li>
              <li>
                编辑 <code>KEY=VALUE</code> 或 JSON；点「保存 JSON」会规范化成 JSON
                对象写入 IndexedDB。
              </li>
              <li>点「注入」创建/覆盖该仓库的 Actions Secrets。</li>
            </ol>
            <p className="hint">
              键值模板存 IndexedDB；Token 存 localStorage。两者互不混用。
            </p>
          </section>
        )}
      </main>

      <footer className="foot">
        shalom-lab/github · Token / 模板只留在本机浏览器
      </footer>
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle" || !status.text) return null;
  return (
    <p className={`status status-${status.kind}`} role="status">
      {status.text}
    </p>
  );
}
