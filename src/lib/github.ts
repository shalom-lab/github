const API = "https://api.github.com";

export type RepoItem = {
  full_name: string;
  private: boolean;
  permissions?: { admin?: boolean; push?: boolean };
};

export type InjectResult = {
  name: string;
  ok: boolean;
  error?: string;
};

async function gh<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message ? `：${body.message}` : "";
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      throw new Error(`认证失败（401）${detail}。请检查 PAT 是否有效`);
    }
    if (res.status === 403) {
      throw new Error(
        `权限不足（403）${detail}。需要 repo 权限，且对目标仓库有 admin（才能写 Actions Secrets）`,
      );
    }
    if (res.status === 404) {
      throw new Error(`未找到（404）${detail}。仓库名或 Secrets 接口权限可能不对`);
    }
    throw new Error(`GitHub API ${res.status}${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Validate token by fetching the authenticated user. */
export async function verifyToken(token: string): Promise<{ login: string }> {
  return gh<{ login: string }>(token, "/user");
}

/** List repos the token can access (paginated). Prefer those with admin. */
export async function listRepos(token: string): Promise<RepoItem[]> {
  const all: RepoItem[] = [];
  let page = 1;
  const perPage = 100;
  while (page <= 10) {
    const batch = await gh<RepoItem[]>(
      token,
      `/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
    );
    all.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return all;
}

type PublicKey = { key_id: string; key: string };

async function getActionsPublicKey(
  token: string,
  owner: string,
  repo: string,
): Promise<PublicKey> {
  return gh<PublicKey>(token, `/repos/${owner}/${repo}/actions/secrets/public-key`);
}

async function encryptSecret(secret: string, publicKeyB64: string): Promise<string> {
  const sodium = (await import("libsodium-wrappers")).default;
  await sodium.ready;
  const keyBytes = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
  const messageBytes = sodium.from_string(secret);
  const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
  return sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);
}

/** Create or update a single Actions secret. */
export async function putActionSecret(
  token: string,
  owner: string,
  repo: string,
  name: string,
  value: string,
  publicKey: PublicKey,
): Promise<void> {
  const encrypted_value = await encryptSecret(value, publicKey.key);
  await gh(token, `/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({
      encrypted_value,
      key_id: publicKey.key_id,
    }),
  });
}

export async function injectSecrets(
  token: string,
  fullName: string,
  secrets: Record<string, string>,
): Promise<InjectResult[]> {
  const slash = fullName.indexOf("/");
  if (slash <= 0) throw new Error("仓库格式应为 owner/repo");
  const owner = fullName.slice(0, slash);
  const repo = fullName.slice(slash + 1);
  const entries = Object.entries(secrets);
  if (!entries.length) throw new Error("没有可注入的密钥");

  const publicKey = await getActionsPublicKey(token, owner, repo);
  const results: InjectResult[] = [];
  for (const [name, value] of entries) {
    try {
      await putActionSecret(token, owner, repo, name, value, publicKey);
      results.push({ name, ok: true });
    } catch (e) {
      results.push({
        name,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

export function splitRepo(fullName: string): { owner: string; repo: string } {
  const slash = fullName.indexOf("/");
  if (slash <= 0) throw new Error("仓库格式应为 owner/repo");
  return { owner: fullName.slice(0, slash), repo: fullName.slice(slash + 1) };
}
