export interface AccessDecision {
  allowed: boolean;
  reason?: 'free_tier' | 'purchased' | 'subscription_active' | 'requires_payment';
  priceCents?: number;
}

export interface IMonetisationService {
  readonly isEnabled: boolean;

  /**
   * Evaluates whether a user can download or preview a given package release.
   */
  canAccessPackage(userId: string | null, packageId: string, version: string): Promise<AccessDecision>;

  /**
   * Creates a checkout session URL (throws when disabled).
   */
  createCheckoutSession(userId: string, packageId: string): Promise<{ checkoutUrl: string }>;

  /**
   * Handles payment provider webhooks (e.g. Stripe).
   */
  handleWebhook(payload: Buffer, signatureHeader: string): Promise<{ handled: boolean }>;
}
