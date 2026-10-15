export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  institution: string;
  canton: string;
  role: 'teacher' | 'admin';
  profile_role?: string | null;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export interface UserPublicProfile {
  id: string;
  email: string;
  full_name: string;
  institution: string;
  canton: string;
  role: 'teacher' | 'admin';
  profile_role?: string | null;
  created_at?: string;
}

export interface PersonalAccessToken {
  id: string;
  user_id: string;
  name: string;
  token_prefix: string;
  token_hash: string;
  last_used_at: string | Date | null;
  expires_at: string | Date | null;
  created_at: string | Date;
}

export interface OAuthClient {
  client_id: string;
  client_secret: string | null;
  name: string;
  redirect_uris: string;
  created_at: string | Date;
}

export interface OAuthAuthCode {
  code: string;
  client_id: string;
  user_id: string;
  code_challenge: string;
  code_challenge_method: string;
  redirect_uri: string;
  used: boolean | number;
  expires_at: string | Date;
  created_at: string | Date;
}
