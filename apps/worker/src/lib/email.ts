import { prisma, Severity } from '@autotaxflow/db';
import { env } from './env';

/**
 * Wrapper de email. Usa Resend si RESEND_API_KEY está seteada,
 * si no, loguea a stdout (dev/test mode).
 * Todo email se persiste en `EmailLog` para auditoría.
 */

interface NexusTriggeredFlag {
  state: string;
  severity: Severity;
  reason: string;
}

export async function sendNexusTriggeredEmail(
  organizationId: string,
  flags: NexusTriggeredFlag[]
): Promise<void> {
  // Buscar OWNER y ADMIN de la org para enviarles el alert
  const memberships = await prisma.membership.findMany({
    where: {
      organizationId,
      role: { in: ['OWNER', 'ADMIN'] },
    },
    include: { user: { select: { email: true, name: true } }, organization: { select: { name: true } } },
  });

  if (memberships.length === 0) {
    console.warn(`[email] no recipients for org ${organizationId}`);
    return;
  }

  const orgName = memberships[0].organization.name;
  const to = memberships.map((m) => m.user.email).join(', ');
  const subject = `[AutoTaxFlow] ${flags.length} new nexus flag${flags.length > 1 ? 's' : ''} for ${orgName}`;

  const bodyText = [
    `Hello,`,
    ``,
    `The AutoTaxFlow nexus engine detected ${flags.length} new tax nexus flag${flags.length > 1 ? 's' : ''} for ${orgName}:`,
    ``,
    ...flags.map((f) => `• ${f.state} — ${f.severity}: ${f.reason}`),
    ``,
    `View the dashboard: ${env.APP_BASE_URL}/nexus`,
    ``,
    `— AutoTaxFlow Alerts`,
  ].join('\n');

  const bodyHtml = `
    <p>Hello,</p>
    <p>The AutoTaxFlow nexus engine detected <strong>${flags.length}</strong> new tax nexus flag${flags.length > 1 ? 's' : ''} for <strong>${orgName}</strong>:</p>
    <ul>
      ${flags
        .map((f) => `<li><strong>${f.state}</strong> — <em>${f.severity}</em>: ${escapeHtml(f.reason)}</li>`)
        .join('')}
    </ul>
    <p><a href="${env.APP_BASE_URL}/nexus">View the dashboard →</a></p>
    <p>— AutoTaxFlow Alerts</p>
  `;

  await sendEmail({
    organizationId,
    to,
    subject,
    template: 'NEXUS_TRIGGERED',
    payload: { flags } as any,
    bodyText,
    bodyHtml,
  });
}

async function sendEmail(opts: {
  organizationId: string;
  to: string;
  subject: string;
  template: string;
  payload: any;
  bodyText: string;
  bodyHtml: string;
}): Promise<void> {
  try {
    if (env.RESEND_API_KEY) {
      // Lazy import para no romper el arranque del worker en dev sin Resend.
      const { Resend } = await import('resend');
      const resend = new Resend(env.RESEND_API_KEY);
      const result = await resend.emails.send({
        from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
        to: opts.to,
        subject: opts.subject,
        text: opts.bodyText,
        html: opts.bodyHtml,
      });
      await prisma.emailLog.create({
        data: {
          organizationId: opts.organizationId,
          to: opts.to,
          subject: opts.subject,
          template: opts.template,
          payload: opts.payload,
          status: 'SENT',
          error: result.error?.message,
        },
      });
    } else {
      // Dev mode: log to stdout, persist as SENT with empty body
      console.log(`\n[dev-email] to: ${opts.to}\nsubject: ${opts.subject}\n${opts.bodyText}\n`);
      await prisma.emailLog.create({
        data: {
          organizationId: opts.organizationId,
          to: opts.to,
          subject: opts.subject,
          template: opts.template,
          payload: opts.payload,
          status: 'SENT',
        },
      });
    }
  } catch (err) {
    console.error(`[email] send failed:`, (err as Error).message);
    await prisma.emailLog
      .create({
        data: {
          organizationId: opts.organizationId,
          to: opts.to,
          subject: opts.subject,
          template: opts.template,
          payload: opts.payload,
          status: 'FAILED',
          error: (err as Error).message,
        },
      })
      .catch(() => {});
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c];
  });
}
