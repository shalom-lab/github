/** BYOK keys — localStorage only, flat names. */
export const APP = "inception";
export const TOKEN_KEY = `gh-${APP}-token`;
export const REPO_KEY = `gh-${APP}-repo`; // last selected owner/repo

const LEGACY_TOKEN_KEY = "gh-highutb-token";
const LEGACY_REPO_KEY = "gh-highutb-repo";

export function readToken(): string {
  const current = localStorage.getItem(TOKEN_KEY);
  if (current) return current;
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY) ?? "";
  if (legacy) {
    localStorage.setItem(TOKEN_KEY, legacy);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
  return legacy;
}

export function readRepo(): string {
  const current = localStorage.getItem(REPO_KEY);
  if (current) return current;
  const legacy = localStorage.getItem(LEGACY_REPO_KEY) ?? "";
  if (legacy) {
    localStorage.setItem(REPO_KEY, legacy);
    localStorage.removeItem(LEGACY_REPO_KEY);
  }
  return legacy;
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim());
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function saveRepo(repo: string): void {
  localStorage.setItem(REPO_KEY, repo.trim());
  localStorage.removeItem(LEGACY_REPO_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function clearRepo(): void {
  localStorage.removeItem(REPO_KEY);
  localStorage.removeItem(LEGACY_REPO_KEY);
}

export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 4) return "****";
  return `${"•".repeat(Math.min(token.length - 4, 24))}${token.slice(-4)}`;
}
