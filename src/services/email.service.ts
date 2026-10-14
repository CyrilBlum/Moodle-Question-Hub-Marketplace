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

  public static async sendAccessRequest(data: AccessRequestEmailData): Promise<void> {
    const config = getConfig();
    if (!config.SMTP_HOST || !config.SMTP_FROM) {
      throw new Error('SMTP_NOT_CONFIGURED');
    }

    const transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      ...(config.SMTP_USER && config.SMTP_PASSWORD
        ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
        : {}),
    });

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
