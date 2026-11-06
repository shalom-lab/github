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

export default function App() {
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

  // Bootstrap BYOK + IndexedDB
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
      // validate before save
      parseSecretsText(secretsText);
      await saveTemplate(secretsText);
      setIdbStatus({ kind: "ok", text: "已保存到 IndexedDB" });
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
      setInjectStatus({ kind: "err", text: "请先在上方保存 GitHub PAT" });
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
    <div className="page">
      <header className="hero">
        <p className="brand">Highutb</p>
        <h1>Actions Secrets 注入</h1>
        <p className="lede">
          BYOK 填入 PAT，编辑键值对，选中仓库一键写入 GitHub Actions Secrets。
        </p>
      </header>

      <section className="panel" aria-labelledby="byok-title">
        <div className="panel-head">
          <h2 id="byok-title">BYOK · GitHub Token</h2>
          <span className={`pill ${tokenReady ? "pill-ok" : "pill-muted"}`}>
            {tokenReady
              ? `已保存${login ? ` · @${login}` : ""} · ${maskToken(savedToken)}`
              : "未设置"}
          </span>
        </div>
        <p className="hint">
          本地键名 <code>{TOKEN_KEY}</code> / <code>{REPO_KEY}</code>
          。可在 Settings 填写，也可事先写入 localStorage；启动会自动读。
          PAT 需具备目标仓库的 <strong>admin</strong>（写 Actions Secrets）。
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
              className="btn ghost"
              onClick={() => setShowToken((v) => !v)}
            >
              {showToken ? "隐藏" : "显示"}
            </button>
          </div>
        </label>
        <div className="actions">
          <button type="button" className="btn primary" onClick={onSaveToken} disabled={busy}>
            保存
          </button>
          <button type="button" className="btn danger" onClick={onClearToken} disabled={busy}>
            清除
          </button>
        </div>
        <StatusLine status={settingsStatus} />
      </section>

      <section className="panel" aria-labelledby="inject-title">
        <div className="panel-head">
          <h2 id="inject-title">注入到仓库</h2>
        </div>

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
              <option value="">请先保存有效 Token</option>
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
            rows={12}
            spellCheck={false}
            value={secretsText}
            onChange={(e) => setSecretsText(e.target.value)}
            disabled={busy}
            placeholder={"API_KEY=xxx\nOTHER=yyy\n\n# 或\n{\"API_KEY\":\"xxx\"}"}
          />
        </label>

        <div className="actions">
          <button
            type="button"
            className="btn ghost"
            onClick={onSaveTemplate}
            disabled={busy}
          >
            保存到 IndexedDB
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={onClearTemplate}
            disabled={busy}
          >
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

      <footer className="foot">
        Token 仅存本机 localStorage；键值模板存 IndexedDB。注入时经浏览器直连
        api.github.com，不经第三方中转。
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
