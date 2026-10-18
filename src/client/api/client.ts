const API_BASE = '/api/v1';

/** Fired on login, logout and profile changes, so components outside the current page (navbar) update. */
export const AUTH_CHANGED_EVENT = 'mqh-auth-changed';

function notifyAuthChanged(): void {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function getToken(): string | null {
  return localStorage.getItem('mqh_token');
}

export function setToken(token: string): void {
  localStorage.setItem('mqh_token', token);
  notifyAuthChanged();
}

export function clearToken(): void {
  localStorage.removeItem('mqh_token');
  localStorage.removeItem('mqh_user');
  notifyAuthChanged();
}

export function getStoredUser(): any | null {
  const raw = localStorage.getItem('mqh_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user: any): void {
  localStorage.setItem('mqh_user', JSON.stringify(user));
  notifyAuthChanged();
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorData: any = {};
    try {
      errorData = await res.json();
    } catch {
      errorData = { message: res.statusText };
    }
    const err: any = new Error(errorData.message || 'Netzwerkfehler');
    err.status = res.status;
    err.data = errorData;
    throw err;
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

export const api = {
  // Taxonomy
  getTaxonomy: () => request('/taxonomy'),

  // Packages
  getPackages: (params: Record<string, any> = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, String(value));
      }
    }
    const qs = query.toString();
    return request(`/packages${qs ? `?${qs}` : ''}`);
  },

  getPackage: (id: string) => request(`/packages/${id}`),

  getPackagePreview: (id: string, version?: string) => {
    return request(`/packages/${id}/preview${version ? `?version=${version}` : ''}`);
  },
  requestPackageAccess: (id: string, data: { message?: string; share_contact: boolean }) =>
    request(`/packages/${encodeURIComponent(id)}/access-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getPackageAccessRequests: (id: string) => request(`/account/packages/${encodeURIComponent(id)}/access-requests`),
  setPackageAccessRequestStatus: (packageId: string, requestId: string, status: 'approved' | 'denied', message?: string) =>
    request(`/packages/${encodeURIComponent(packageId)}/access-requests/${encodeURIComponent(requestId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, message }),
    }),
  downloadPackage: async (id: string, version: string) => {
    const token = getToken();
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`${API_BASE}/packages/${encodeURIComponent(id)}/releases/${encodeURIComponent(version)}/download`, { headers });
    if (!res.ok) {
      let errorData: any = {};
      try { errorData = await res.json(); } catch {}
      throw new Error(errorData.message || 'Download fehlgeschlagen.');
    }
    return res.blob();
  },

  preflightXml: async (xml: string) => {
    return request('/packages/preflight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml }),
    });
  },

  publishPackage: async (metadata: any, xml: string) => {
    return request('/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata, xml }),
    });
  },

  // Auth
  register: async (data: { email: string; password: string; full_name: string; institution: string; canton: string; altcha: string }) => {
    const res = await request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.token) {
      setToken(res.token);
      setStoredUser(res.user);
    }
    return res;
  },

  login: async (email: string, password: string, altcha: string) => {
    const res = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, altcha }),
    });
    if (res.token) {
      setToken(res.token);
      setStoredUser(res.user);
    }
    return res;
  },

  getMe: () => request('/auth/me'),
  updateProfile: (data: Record<string, string>) => request('/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  // Tokens
  getTokens: () => request('/account/tokens'),
  createToken: (name: string, expiresInDays?: number) => {
    return request('/account/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, expires_in_days: expiresInDays }),
    });
  },
  getMyPackages: () => request('/account/packages'),
  getGitHubConnection: () => request('/account/github'),
  connectGitHub: (token: string) => request('/account/github', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  }),
  disconnectGitHub: () => request('/account/github', { method: 'DELETE' }),
  getPackageMembers: (id: string) => request(`/packages/${encodeURIComponent(id)}/members`),
  addPackageMember: (id: string, email: string, role: 'member' | 'editor' | 'admin') =>
    request(`/packages/${encodeURIComponent(id)}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    }),
  setPackageMemberRole: (id: string, userId: string, role: 'member' | 'editor' | 'admin') =>
    request(`/packages/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }),
  removePackageMember: (id: string, userId: string) =>
    request(`/packages/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),

  // Administration (admins only)
  getAdminOverview: () => request('/admin/overview'),
  purgeWithdrawnPackage: (id: string) => request(`/admin/withdrawn/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createUser: (data: Record<string, string>) => request('/admin/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  deleteUser: (id: string) => request(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  emailUser: (id: string, subject: string, message: string) => request(`/admin/users/${encodeURIComponent(id)}/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, message }),
  }),
  updatePackage: (id: string, patch: Record<string, unknown>) =>
    request(`/packages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  withdrawPackage: (id: string) =>
    request(`/packages/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  withdrawRelease: (id: string, version: string) =>
    request(`/packages/${encodeURIComponent(id)}/releases/${encodeURIComponent(version)}`, { method: 'DELETE' }),
  // Forks and merge requests
  forkPackage: (id: string, data: { id?: string; title?: string; version?: string; visibility?: string; license?: string }) =>
    request(`/packages/${encodeURIComponent(id)}/forks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  getForks: (id: string) => request(`/packages/${encodeURIComponent(id)}/forks`),
  suggestForkId: (id: string) => request(`/packages/${encodeURIComponent(id)}/fork-id-suggestion`),
  getForkStatus: (id: string, details = false) => request(`/packages/${encodeURIComponent(id)}/fork-status${details ? '?details=1' : ''}`),
  syncFork: (id: string, data: { version?: string; release_notes?: string; resolutions?: Record<string, string> }) =>
    request(`/packages/${encodeURIComponent(id)}/sync-upstream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  getMergeRequests: (id: string, status = 'open') => request(`/packages/${encodeURIComponent(id)}/merge-requests?status=${status}`),
  getMyMergeRequests: () => request('/account/merge-requests'),
  createMergeRequest: (id: string, data: { source_package_id: string; title: string; description?: string; accept_license: boolean }) =>
    request(`/packages/${encodeURIComponent(id)}/merge-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  getMergeRequest: (id: string, n: number | string) => request(`/packages/${encodeURIComponent(id)}/merge-requests/${n}`),
  getMergeRequestChanges: (id: string, n: number | string) => request(`/packages/${encodeURIComponent(id)}/merge-requests/${n}/changes`),
  updateMergeRequest: (id: string, n: number | string, patch: Record<string, unknown>) =>
    request(`/packages/${encodeURIComponent(id)}/merge-requests/${n}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }),
  commentMergeRequest: (id: string, n: number | string, data: { body: string; question_key?: string; question_name?: string }) =>
    request(`/packages/${encodeURIComponent(id)}/merge-requests/${n}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateMergeRequestNote: (id: string, n: number | string, noteId: string, patch: { body?: string; resolved?: boolean }) =>
    request(`/packages/${encodeURIComponent(id)}/merge-requests/${n}/notes/${noteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }),
  deleteMergeRequestNote: (id: string, n: number | string, noteId: string) =>
    request(`/packages/${encodeURIComponent(id)}/merge-requests/${n}/notes/${noteId}`, { method: 'DELETE' }),
  setMergeRequestApproval: (id: string, n: number | string, approve: boolean) =>
    request(`/packages/${encodeURIComponent(id)}/merge-requests/${n}/approval`, { method: approve ? 'PUT' : 'DELETE' }),
  mergeMergeRequest: (id: string, n: number | string, data: { version?: string; release_notes?: string; resolutions?: Record<string, string>; source_version?: string; target_version?: string }) =>
    request(`/packages/${encodeURIComponent(id)}/merge-requests/${n}/merge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  oauthAuthorize: (params: Record<string, string>) =>
    request(`/oauth/authorize?${new URLSearchParams(params).toString()}`, {
      headers: { Accept: 'application/json' },
    }),
  revokeToken: (id: string) => {
    return request(`/account/tokens/${id}`, {
      method: 'DELETE',
    });
  },
};
