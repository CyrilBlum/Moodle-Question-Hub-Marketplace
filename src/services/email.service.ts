import nodemailer from 'nodemailer';
import { getConfig } from '../config';

export interface AccessRequestEmailData {
  packageId: string;
  packageTitle: string;
  requesterName: string;
  requesterEmail: string;
  requesterInstitution: string;
  adminEmails: string[];
  /** Optional note of the requester. */
  message?: string | null;
  /** Without consent, e-mail and school stay hidden and replies do not reach the requester. */
  shareContact: boolean;
}

export interface AccessDecisionEmailData {
  packageId: string;
  packageTitle: string;
  requesterEmail: string;
  ownerName: string;
  status: 'approved' | 'denied';
  message?: string | null;
}

export class EmailService {
  public static isConfigured(): boolean {
    const config = getConfig();
    return !!(config.SMTP_HOST && config.SMTP_FROM);
  }

  private static transporter() {
    const config = getConfig();
    if (!config.SMTP_HOST || !config.SMTP_FROM) {
      throw new Error('SMTP_NOT_CONFIGURED');
    }
    return nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      ...(config.SMTP_USER && config.SMTP_PASSWORD
        ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
        : {}),
    });
  }

  /** Message from an administrator to a user. */
  public static async sendMessage(data: { to: string; replyTo?: string; subject: string; text: string; senderName?: string }): Promise<void> {
    const transporter = this.transporter();
    await transporter.sendMail({
      from: getConfig().SMTP_FROM,
      to: data.to,
      replyTo: data.replyTo,
      subject: data.subject,
      text: [
        data.text,
        '',
        '--',
        `Nachricht${data.senderName ? ` von ${data.senderName}` : ''} über die Administration des Moodle Question Hub.`,
      ].join('\n'),
    });
  }

  /** Tells the administrators that someone registered; replies go to the new account. */
  public static async sendNewAccountNotice(data: {
    to: string[]; email: string; full_name: string; institution: string; canton: string;
  }): Promise<void> {
    const transporter = this.transporter();
    const base = getConfig().PUBLIC_BASE_URL.replace(/\/$/, '');
    await transporter.sendMail({
      from: getConfig().SMTP_FROM,
      to: data.to,
      replyTo: data.email,
      subject: `Neues Konto im Question Hub: ${data.full_name}`,
      text: [
        'Guten Tag',
        '',
        'Im Moodle Question Hub wurde ein neues Konto registriert:',
        '',
        `Name: ${data.full_name}`,
        `E-Mail: ${data.email}`,
        `Schule: ${data.institution}`,
        `Kanton: ${data.canton}`,
        '',
        `Alle Konten verwalten: ${base}/admin`,
        '',
        'Diese Nachricht wurde automatisch vom Moodle Question Hub versendet.',
      ].join('\n'),
    });
  }

  /** Tells someone that a package admin gave them a role on a package. */
  public static async sendMembershipNotice(data: {
    to: string; packageId: string; packageTitle: string; actorName: string; role: string;
  }): Promise<void> {
    const transporter = this.transporter();
    await transporter.sendMail({
      from: getConfig().SMTP_FROM,
      to: data.to,
      subject: `Sie wirken an «${data.packageTitle}» mit`,
      text: [
        'Guten Tag',
        '',
        `${data.actorName} hat Sie im Moodle Question Hub zum Fragenpaket «${data.packageTitle}» hinzugefügt (Rolle: ${data.role}).`,
        '',
        `Zum Paket: ${this.packageUrl(data.packageId, 'mitwirkende')}`,
        '',
        'Diese Nachricht wurde automatisch vom Moodle Question Hub versendet.',
      ].join('\n'),
    });
  }

  public static baseUrl(): string {
    return getConfig().PUBLIC_BASE_URL.replace(/\/$/, '');
  }

  private static packageUrl(packageId: string, tab?: string): string {
    return `${this.baseUrl()}/packages/${encodeURIComponent(packageId)}${tab ? `?tab=${tab}` : ''}`;
  }

  /** Merge request events (new request, comment, merged, closed) for the participants. */
  public static async sendMergeRequestNotice(data: { to: string[]; subject: string; lines: string[]; url: string }): Promise<void> {
    const transporter = this.transporter();
    await transporter.sendMail({
      from: getConfig().SMTP_FROM,
      // Participants do not see each other's addresses.
      to: getConfig().SMTP_FROM,
      bcc: data.to,
      subject: data.subject,
      text: [
        'Guten Tag',
        '',
        ...data.lines,
        '',
        `Zum Änderungsvorschlag: ${data.url}`,
        '',
        'Diese Nachricht wurde automatisch vom Moodle Question Hub versendet.',
      ].join('\n'),
    });
  }

  public static async sendAccessRequest(data: AccessRequestEmailData): Promise<void> {
    const transporter = this.transporter();
    const who = data.shareContact
      ? `${data.requesterName} (${data.requesterEmail}${data.requesterInstitution ? `, ${data.requesterInstitution}` : ''})`
      : `${data.requesterName} (Kontaktdaten nicht freigegeben)`;
    await transporter.sendMail({
      from: getConfig().SMTP_FROM,
      to: data.adminEmails,
      replyTo: data.shareContact ? data.requesterEmail : undefined,
      subject: `Zugriffsanfrage für «${data.packageTitle}»`,
      text: [
        `Guten Tag`,
        '',
        `${who} möchte Zugriff auf Ihr privates Fragenpaket «${data.packageTitle}» beantragen.`,
        ...(data.message ? ['', 'Nachricht:', data.message] : []),
        '',
        `Anfrage im Hub annehmen oder ablehnen: ${this.packageUrl(data.packageId, 'anfragen')}`,
        '',
        'Diese Nachricht wurde automatisch vom Moodle Question Hub versendet.',
      ].join('\n'),
    });
  }

  /** Tells the requester about the owner's decision, with the owner's optional reply. */
  public static async sendAccessDecision(data: AccessDecisionEmailData): Promise<void> {
    const transporter = this.transporter();
    const approved = data.status === 'approved';
    await transporter.sendMail({
      from: getConfig().SMTP_FROM,
      to: data.requesterEmail,
      subject: `Zugriffsanfrage für «${data.packageTitle}» ${approved ? 'freigegeben' : 'abgelehnt'}`,
      text: [
        `Guten Tag`,
        '',
        approved
          ? `${data.ownerName} hat Ihnen Zugriff auf das Fragenpaket «${data.packageTitle}» gegeben.`
          : `${data.ownerName} hat Ihre Anfrage für das Fragenpaket «${data.packageTitle}» abgelehnt.`,
        ...(data.message ? ['', `Nachricht von ${data.ownerName}:`, data.message] : []),
        ...(approved ? ['', `Zum Paket: ${this.packageUrl(data.packageId)}`] : []),
        '',
        'Diese Nachricht wurde automatisch vom Moodle Question Hub versendet.',
      ].join('\n'),
    });
  }
}
