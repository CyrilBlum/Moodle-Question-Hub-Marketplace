import crypto from 'crypto';
import { getDatabase } from '../database/connection';
import { CryptoService } from './crypto.service';
import { User, UserPublicProfile } from '../types/user.types';

export class AuthService {
  private static instance: AuthService | null = null;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public async register(data: {
    email: string;
    password: string;
    full_name: string;
    institution: string;
    canton: string;
  }): Promise<{ user: UserPublicProfile; userId: string }> {
    const knex = getDatabase();

    const existing = await knex('users').where({ email: data.email.trim().toLowerCase() }).first();
    if (existing) {
      throw new Error('CONFLICT: Ein Benutzer mit dieser E-Mail-Adresse existiert bereits.');
    }

    const userId = crypto.randomUUID();
    const passwordHash = CryptoService.hashPassword(data.password);

    await knex('users').insert({
      id: userId,
      email: data.email.trim().toLowerCase(),
      password_hash: passwordHash,
      full_name: data.full_name.trim(),
      institution: data.institution.trim(),
      canton: data.canton.trim().toUpperCase(),
      role: 'teacher',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const user: UserPublicProfile = {
      id: userId,
      email: data.email.trim().toLowerCase(),
      full_name: data.full_name.trim(),
      institution: data.institution.trim(),
      canton: data.canton.trim().toUpperCase(),
      role: 'teacher',
    };

    return { user, userId };
  }

  public async login(email: string, password: string): Promise<UserPublicProfile> {
    const knex = getDatabase();
    const user = await knex('users').where({ email: email.trim().toLowerCase() }).first();

    if (!user) {
      throw new Error('UNAUTHORIZED: Ungültige E-Mail-Adresse oder Passwort.');
    }

    const isValid = CryptoService.verifyPassword(password, user.password_hash);
    if (!isValid) {
      throw new Error('UNAUTHORIZED: Ungültige E-Mail-Adresse oder Passwort.');
    }

    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      institution: user.institution,
      canton: user.canton,
      role: user.role,
      profile_role: user.profile_role,
    };
  }

  public async getUserById(userId: string): Promise<UserPublicProfile | null> {
    const knex = getDatabase();
    const user = await knex('users').where({ id: userId }).first();
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      institution: user.institution,
      canton: user.canton,
      role: user.role,
      profile_role: user.profile_role,
    };
  }

  public async updateProfile(userId: string, data: { email: string; full_name: string; institution: string; canton: string; profile_role?: string; password?: string }): Promise<UserPublicProfile> {
    const knex = getDatabase();
    const email = data.email.trim().toLowerCase();
    const existing = await knex('users').where({ email }).whereNot({ id: userId }).first();
    if (existing) throw new Error('CONFLICT: Ein Benutzer mit dieser E-Mail-Adresse existiert bereits.');
    const update: any = { email, full_name: data.full_name.trim(), institution: data.institution.trim(), canton: data.canton.trim().toUpperCase(), profile_role: data.profile_role?.trim() || null, updated_at: new Date() };
    if (data.password) update.password_hash = CryptoService.hashPassword(data.password);
    await knex('users').where({ id: userId }).update(update);
    return (await this.getUserById(userId))!;
  }
}
