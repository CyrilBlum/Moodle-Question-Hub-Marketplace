import { describe, it, expect } from 'vitest';
import { GitHubService } from '../../src/services/github.service';

describe('GitHubService', () => {
  it('accepts SSH and HTTPS GitHub URLs and rejects others', () => {
    const ref = { owner: 'octo', repo: 'my.questions' };
    expect(GitHubService.parseRepoUrl('git@github.com:octo/my.questions.git')).toEqual(ref);
    expect(GitHubService.parseRepoUrl(' ssh://git@github.com/octo/my.questions.git ')).toEqual(ref);
    expect(GitHubService.parseRepoUrl('https://github.com/octo/my.questions')).toEqual(ref);
    expect(GitHubService.canonicalUrl(ref)).toBe('git@github.com:octo/my.questions.git');
    for (const bad of ['', 'git@gitlab.com:octo/q.git', 'git@github.com:octo/../x', 'https://github.com/octo', 'git@github.com:octo/q.git; rm -rf /']) {
      expect(GitHubService.parseRepoUrl(bad)).toBeNull();
    }
  });

  it('encrypts tokens so the stored value neither contains nor reveals them', () => {
    const token = 'github_pat_unit_test_0123456789';
    const stored = GitHubService.encryptToken(token);
    expect(stored).not.toContain(token);
    expect(GitHubService.encryptToken(token)).not.toBe(stored);
    expect(GitHubService.decryptToken(stored)).toBe(token);
    const parts = stored.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(GitHubService.decryptToken(parts.join(':'))).toBeNull();
  });
});
