import nodemailer from 'nodemailer';
import { getConfig } from '../config';

export interface AccessRequestEmailData {
  packageId: string;
  packageTitle: string;
  requesterName: string;
  requesterEmail: string;
  requesterInstitution: string;
  ownerEmail: string;
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

  public static async sendAccessRequest(data: AccessRequestEmailData): Promise<void> {
    const config = getConfig();
    const transporter = this.transporter();

    const packageUrl = `${config.PUBLIC_BASE_URL.replace(/\/$/, '')}/packages/${encodeURIComponent(data.packageId)}`;
    await transporter.sendMail({
      from: config.SMTP_FROM,
      to: data.ownerEmail,
      replyTo: data.requesterEmail,
      subject: `Zugriffsanfrage für «${data.packageTitle}»`,
      text: [
        `Guten Tag`,
        '',
        `${data.requesterName} (${data.requesterEmail}${data.requesterInstitution ? `, ${data.requesterInstitution}` : ''}) möchte Zugriff auf Ihr privates Fragenpaket «${data.packageTitle}» beantragen.`,
        '',
        `Anfrage im Hub prüfen: ${packageUrl}`,
        '',
        'Diese Nachricht wurde automatisch vom Moodle Question Hub versendet.',
      ].join('\n'),
    });
  }
}
