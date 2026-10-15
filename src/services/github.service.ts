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
 * admin links a package to a repository (created if missing), and every new release is committed there as `<package-id>.xml`
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

  /**
   * Makes sure the user's GitHub token can write to the repository. A repository the token cannot see is
   * created (private, with an initial commit) in the user's account or, for another owner, in that
   * organisation. Throws BAD_REQUEST when that is not possible.
   */
  public async ensureRepo(userId: string, ref: GitHubRepoRef): Promise<{ created: boolean }> {
    let token: string;
    try {
      token = await this.tokenOf(userId);
    } catch (err: any) {
      throw new Error(`BAD_REQUEST: ${err.message}`);
    }
    const name = `${ref.owner}/${ref.repo}`;
    const res = await this.call(token, 'GET', `/repos/${name}`);
    if (res.status === 200) {
      if (res.data?.permissions && res.data.permissions.push === false) {
        throw new Error(`BAD_REQUEST: Ihr GitHub-Token darf nicht in ${name} schreiben.`);
      }
      return { created: false };
    }
    if (res.status !== 404 && res.status !== 403) {
      throw new Error(`BAD_REQUEST: ${GitHubService.apiError('Prüfen des Repositorys', res).message}`);
    }

    // Not visible to the token: create it. Private, because packages may contain solutions.
    const user = await getDatabase()('users').where({ id: userId }).first('github_login');
    const own = String(user?.github_login || '').toLowerCase() === ref.owner.toLowerCase();
    const created = await this.call(token, 'POST', own ? '/user/repos' : `/orgs/${ref.owner}/repos`, {
      name: ref.repo,
      private: true,
      auto_init: true,
      description: 'Fragenpaket aus dem Moodle Question Hub',
    });
    if (created.status === 201) return { created: true };
    if (created.status === 422) {
      throw new Error(`BAD_REQUEST: Das GitHub-Repository ${name} existiert bereits, aber Ihr Token hat keinen Zugriff darauf.`);
    }
    throw new Error(
      `BAD_REQUEST: Das GitHub-Repository ${name} existiert nicht und konnte nicht angelegt werden (GitHub ${created.status}). ` +
      'Zum Anlegen braucht der Token Zugriff auf alle Repositorys und die Berechtigung «Administration: Read and write»; ' +
      'sonst legen Sie das Repository selbst auf GitHub an.'
    );
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

    const content = Buffer.from(params.xml, 'utf8').toString('base64');
    // A just created repository can answer 404/409 for a moment, and a concurrent commit changes the file's sha: retry.
    let put: { status: number; data: any } = { status: 0, data: null };
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 1500));
      const existing = await this.call(token, 'GET', `${repoPath}/contents/${filePath}`);
      if (existing.status !== 200 && existing.status !== 404) {
        throw GitHubService.apiError('Lesen der bisherigen Datei', existing);
      }
      put = await this.call(token, 'PUT', `${repoPath}/contents/${filePath}`, {
        message: params.message,
        content,
        ...(existing.status === 200 && existing.data?.sha ? { sha: existing.data.sha } : {}),
      });
      if (put.status !== 404 && put.status !== 409) break;
    }
    if (put.status !== 200 && put.status !== 201) throw GitHubService.apiError('Commit', put);
    const commitSha: string = put.data?.commit?.sha;
    const commitUrl: string = put.data?.commit?.html_url || `https://github.com/${ref.owner}/${ref.repo}/commit/${commitSha}`;

    const tag = await this.call(token, 'POST', `${repoPath}/git/refs`, { ref: `refs/tags/v${params.version}`, sha: commitSha });
    const warning = tag.status === 201 ? null : GitHubService.apiError(`Tag v${params.version}`, tag).message;
    return { commit_url: commitUrl, warning };
  }
}
