const API_BASE = '/api/v1';

export function getToken(): string | null {
  return localStorage.getItem('mqh_token');
}

export function setToken(token: string): void {
  localStorage.setItem('mqh_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('mqh_token');
  localStorage.removeItem('mqh_user');
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
  requestPackageAccess: (id: string) => request(`/packages/${encodeURIComponent(id)}/access-requests`, { method: 'POST' }),
  getPackageAccessRequests: (id: string) => request(`/account/packages/${encodeURIComponent(id)}/access-requests`),
  setPackageAccessRequestStatus: (packageId: string, requestId: string, status: 'approved' | 'denied') =>
    request(`/packages/${encodeURIComponent(packageId)}/access-requests/${encodeURIComponent(requestId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
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
  register: async (data: { email: string; password: string; full_name: string; institution: string; canton: string }) => {
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

  login: async (email: string, password: string) => {
    const res = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
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
