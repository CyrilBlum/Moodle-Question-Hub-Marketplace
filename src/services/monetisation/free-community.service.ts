import { IMonetisationService, AccessDecision } from './monetisation.interface';

export class FreeCommunityMonetisationService implements IMonetisationService {
  public readonly isEnabled = false;

  public async canAccessPackage(
    _userId: string | null,
    _packageId: string,
    _version: string
  ): Promise<AccessDecision> {
    // In free community mode, all packages are completely open
    return {
      allowed: true,
      reason: 'free_tier',
    };
  }

  public async createCheckoutSession(): Promise<{ checkoutUrl: string }> {
    throw new Error('FEATURE_DISABLED: Monetarisierung ist deaktiviert. Alle Fragenpakete sind kostenlos.');
  }

  public async handleWebhook(): Promise<{ handled: boolean }> {
    return { handled: false };
  }
}
