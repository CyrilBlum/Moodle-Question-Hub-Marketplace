import crypto from 'crypto';
import { getConfig } from '../config';
import { getDatabase } from '../database/connection';

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

const NAME = '[A-Za-z0-9_.-]+';
const REPO_PATTERNS = [
  new RegExp(`^git@github\\.com:(${NAME})/(${NAME})$`),
  new RegExp(`^ssh://git@github\\.com/(${NAME})/(${NAME})$`),
  new RegExp(`^https://github\\.com/(${NAME})/(${NAME})/?$`),
];

/**
 * Optional mirror of packages to GitHub. A user stores a GitHub token (encrypted at rest); a package
 * admin links a package to a repository, and every new release is committed there as `<package-id>.xml`
 * with the release notes as commit message and tagged `v<version>`. The Hub talks to the GitHub REST API
 * over HTTPS with the token; the SSH URL only names the repository.
 */
export class GitHubService {
  private static instance: GitHubService | null = null;

  public static getInstance(): GitHubService {
    if (!GitHubService.instance) {
      GitHubService.instance = new GitHubService();
    }
    return GitHubService.instance;
  }

  /** owner/repo from an SSH or HTTPS GitHub URL; null when the input is not one. */
  public static parseRepoUrl(input: string): GitHubRepoRef | null {
    const trimmed = input.trim();
    for (const pattern of REPO_PATTERNS) {
      const m = trimmed.match(pattern);
      if (m) {
        const repo = m[2].replace(/\.git$/, '');
        if (!repo || repo === '.' || repo === '..') return null;
        return { owner: m[1], repo };
      }
    }
    return null;
  }

  public static canonicalUrl(ref: GitHubRepoRef): string {
    return `git@github.com:${ref.owner}/${ref.repo}.git`;
  }

  private static key(): Buffer {
    const config = getConfig();
    return crypto.createHash('sha256').update(`github-token:${config.GITHUB_TOKEN_KEY || config.JWT_SECRET}`).digest();
  }

  public static encryptToken(token: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
  }

  /** null when the stored value cannot be decrypted (e.g. the key changed). */
  public static decryptToken(stored: string): string | null {
    const [version, iv, tag, data] = stored.split(':');
    if (version !== 'v1' || !iv || !tag || !data) return null;
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }

  private async call(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
    let res: Response;
    try {
      res = await fetch(`${getConfig().GITHUB_API_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'moodle-question-hub',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err: any) {
      throw new Error(`GitHub ist nicht erreichbar (${err?.name === 'TimeoutError' ? 'Zeitüberschreitung' : 'Netzwerkfehler'}).`);
    }
    let data: any = null;
    try {
      data = await res.json();
    } catch {}
    return { status: res.status, data };
  }

  private static apiError(action: string, res: { status: number; data: any }): Error {
    const detail = res.data?.message ? `: ${res.data.message}` : '';
    return new Error(`${action} fehlgeschlagen (GitHub ${res.status}${detail}).`);
  }

  public async getConnection(userId: string): Promise<{ connected: boolean; login: string | null; connected_at: string | null }> {
    const row = await getDatabase()('users').where({ id: userId }).first('github_token_enc', 'github_login', 'github_connected_at');
    if (!row?.github_token_enc) return { connected: false, login: null, connected_at: null };
    return {
      connected: true,
      login: row.github_login || null,
      connected_at: row.github_connected_at ? new Date(row.github_connected_at).toISOString() : null,
    };
  }

  /** Checks the token against GitHub and stores it encrypted; throws BAD_REQUEST when GitHub rejects it. */
  public async connect(userId: string, token: string): Promise<{ connected: true; login: string }> {
    const res = await this.call(token, 'GET', '/user');
    if (res.status !== 200 || !res.data?.login) {
      throw new Error('BAD_REQUEST: GitHub hat den Token nicht akzeptiert. Prüfen Sie Token und Ablaufdatum.');
    }
    await getDatabase()('users').where({ id: userId }).update({
      github_token_enc: GitHubService.encryptToken(token),
      github_login: String(res.data.login).slice(0, 100),
      github_connected_at: new Date(),
    });
    return { connected: true, login: res.data.login };
  }

  public async disconnect(userId: string): Promise<void> {
    await getDatabase()('users').where({ id: userId }).update({ github_token_enc: null, github_login: null, github_connected_at: null });
  }

  private async tokenOf(userId: string | null): Promise<string> {
    const row = userId ? await getDatabase()('users').where({ id: userId }).first('github_token_enc') : null;
    const token = row?.github_token_enc ? GitHubService.decryptToken(row.github_token_enc) : null;
    if (!token) {
      throw new Error('Kein GitHub-Konto verbunden. Hinterlegen Sie einen GitHub-Token in Ihrem Konto.');
    }
    return token;
  }

  /** Throws BAD_REQUEST unless the user has a GitHub token with write access to the repository. */
  public async assertRepoWritable(userId: string, ref: GitHubRepoRef): Promise<void> {
    let token: string;
    try {
      token = await this.tokenOf(userId);
    } catch (err: any) {
      throw new Error(`BAD_REQUEST: ${err.message}`);
    }
    const res = await this.call(token, 'GET', `/repos/${ref.owner}/${ref.repo}`);
    if (res.status === 404 || res.status === 403) {
      throw new Error(`BAD_REQUEST: Das GitHub-Repository ${ref.owner}/${ref.repo} existiert nicht oder Ihr Token hat keinen Zugriff darauf.`);
    }
    if (res.status !== 200) throw new Error(`BAD_REQUEST: ${GitHubService.apiError('Prüfen des Repositorys', res).message}`);
    if (res.data?.permissions && res.data.permissions.push === false) {
      throw new Error(`BAD_REQUEST: Ihr GitHub-Token darf nicht in ${ref.owner}/${ref.repo} schreiben.`);
    }
  }

  /**
   * Commits the release file to the repository's default branch and tags the commit `v<version>`.
   * Returns the commit URL; a failed tag is reported in `warning` (the commit stays).
   */
  public async pushRelease(params: {
    userId: string | null;
    repoUrl: string;
    packageId: string;
    version: string;
    xml: string;
    message: string;
  }): Promise<{ commit_url: string; warning: string | null }> {
    const ref = GitHubService.parseRepoUrl(params.repoUrl);
    if (!ref) throw new Error(`Ungültige GitHub-Adresse: ${params.repoUrl}`);
    const token = await this.tokenOf(params.userId);
    const repoPath = `/repos/${ref.owner}/${ref.repo}`;
    const filePath = `${encodeURIComponent(params.packageId)}.xml`;

    const existing = await this.call(token, 'GET', `${repoPath}/contents/${filePath}`);
    if (existing.status !== 200 && existing.status !== 404) {
      throw GitHubService.apiError('Lesen der bisherigen Datei', existing);
    }
    const put = await this.call(token, 'PUT', `${repoPath}/contents/${filePath}`, {
      message: params.message,
      content: Buffer.from(params.xml, 'utf8').toString('base64'),
      ...(existing.status === 200 && existing.data?.sha ? { sha: existing.data.sha } : {}),
    });
    if (put.status !== 200 && put.status !== 201) throw GitHubService.apiError('Commit', put);
    const commitSha: string = put.data?.commit?.sha;
    const commitUrl: string = put.data?.commit?.html_url || `https://github.com/${ref.owner}/${ref.repo}/commit/${commitSha}`;

    const tag = await this.call(token, 'POST', `${repoPath}/git/refs`, { ref: `refs/tags/v${params.version}`, sha: commitSha });
    const warning = tag.status === 201 ? null : GitHubService.apiError(`Tag v${params.version}`, tag).message;
    return { commit_url: commitUrl, warning };
  }
}
