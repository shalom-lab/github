/** BYOK keys — localStorage only, flat names. */
export const APP = "highutb";
export const TOKEN_KEY = `gh-${APP}-token`;
export const REPO_KEY = `gh-${APP}-repo`; // last selected owner/repo

export function readToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function readRepo(): string {
  return localStorage.getItem(REPO_KEY) ?? "";
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function saveRepo(repo: string): void {
  localStorage.setItem(REPO_KEY, repo.trim());
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function clearRepo(): void {
  localStorage.removeItem(REPO_KEY);
}

export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 4) return "****";
  return `${"•".repeat(Math.min(token.length - 4, 24))}${token.slice(-4)}`;
}
