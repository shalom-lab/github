/**
 * Accept either JSON object or KEY=VALUE lines.
 * Lines starting with # are comments. Empty lines skipped.
 */
export type ParsedSecrets = Record<string, string>;

export function parseSecretsText(raw: string): ParsedSecrets {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith("{")) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new Error("JSON 解析失败，请检查格式");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("JSON 必须是对象，例如 {\"A\":\"B\"}");
    }
    const out: ParsedSecrets = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const key = k.trim();
      if (!key) continue;
      if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
        throw new Error(`密钥 ${key} 的值必须是字符串/数字/布尔`);
      }
      out[key] = String(v);
    }
    return out;
  }

  const out: ParsedSecrets = {};
  for (const line of trimmed.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("=");
    if (eq <= 0) {
      throw new Error(`无效行（需要 KEY=VALUE）：${s.slice(0, 40)}`);
    }
    const key = s.slice(0, eq).trim();
    let value = s.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`无效密钥名：${key}（仅字母数字下划线，且不能以数字开头）`);
    }
    out[key] = value;
  }
  return out;
}

export function secretsToText(secrets: ParsedSecrets): string {
  return Object.entries(secrets)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

export const DEFAULT_TEMPLATE = `# 每行一个 KEY=VALUE，也可整段 JSON 对象
# 示例：
API_KEY=sk-xxx
DEPLOY_TOKEN=ghp_xxx
`;
