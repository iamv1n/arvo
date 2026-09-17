import type { MailMessage } from './mailer';

/*
 * Transactional email templates. Inline styles only, no external images or fonts, so they
 * render the same in every client and never phone home.
 */

const COLORS = { canvas: '#f6f5f1', surface: '#fefdfb', ink: '#161a2e', muted: '#4b4f63', faint: '#6f7285', border: '#e1ded6', brand: '#a4552a' };
const SERIF = "'Iowan Old Style', Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'button'; label: string; url: string }
  | { kind: 'code'; code: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'note'; text: string };

interface Layout {
  to: string;
  subject: string;
  preheader: string;
  heading: string;
  blocks: Block[];
  footer?: string;
  headers?: Record<string, string>;
}

function render({ to, subject, preheader, heading, blocks, footer, headers }: Layout): MailMessage {
  const body = blocks
    .map((b) => {
      switch (b.kind) {
        case 'p':
          return `<p style="margin:0 0 16px;font:16px/1.6 ${SANS};color:${COLORS.muted}">${escapeHtml(b.text)}</p>`;
        case 'note':
          return `<p style="margin:0 0 16px;font:13px/1.6 ${SANS};color:${COLORS.faint}">${escapeHtml(b.text)}</p>`;
        case 'list':
          return `<ul style="margin:0 0 16px;padding-left:20px;font:15px/1.7 ${SANS};color:${COLORS.muted}">${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
        case 'code':
          return `<p style="margin:8px 0 24px;text-align:center"><span style="display:inline-block;padding:14px 22px;border:1px solid ${COLORS.border};border-radius:10px;background:${COLORS.canvas};font:600 30px/1 ${MONO};letter-spacing:8px;color:${COLORS.ink}">${escapeHtml(b.code)}</span></p>`;
        case 'button':
          return `<p style="margin:8px 0 24px"><a href="${escapeHtml(b.url)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${COLORS.brand};color:#ffffff;font:600 15px/1 ${SANS};text-decoration:none">${escapeHtml(b.label)}</a></p>
<p style="margin:0 0 16px;font:12px/1.6 ${SANS};color:${COLORS.faint};word-break:break-all">Or paste this link into your browser:<br><a href="${escapeHtml(b.url)}" style="color:${COLORS.brand}">${escapeHtml(b.url)}</a></p>`;
      }
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.canvas}">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.canvas}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 16px;font:500 26px/1 ${SERIF};letter-spacing:-0.02em;color:${COLORS.ink}">Arvo</td></tr>
<tr><td style="padding:32px;background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:14px">
<h1 style="margin:0 0 16px;font:500 24px/1.3 ${SERIF};color:${COLORS.ink}">${escapeHtml(heading)}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 4px;font:11px/1.6 ${MONO};letter-spacing:0.04em;text-transform:uppercase;color:${COLORS.faint}">${escapeHtml(footer ?? 'Arvo · your private finance workspace')}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    'ARVO',
    '',
    heading,
    '',
    ...blocks.flatMap((b) => {
      switch (b.kind) {
        case 'p':
        case 'note':
          return [b.text, ''];
        case 'list':
          return [...b.items.map((i) => `  - ${i}`), ''];
        case 'code':
          return [`    ${b.code}`, ''];
        case 'button':
          return [`${b.label}: ${b.url}`, ''];
      }
    }),
    '--',
    footer ?? 'Arvo · your private finance workspace',
  ].join('\n');

  return { to, subject, html, text, headers };
}

const IGNORE = "If you didn't request this, you can ignore this email.";

export const templates = {
  verifyEmail: (to: string, name: string, url: string) =>
    render({
      to,
      subject: 'Confirm your email for Arvo',
      preheader: 'Confirm your email address to finish setting up Arvo.',
      heading: 'Confirm your email',
      blocks: [
        { kind: 'p', text: `Hi ${name}, confirm that this is your email address so Arvo can send you password resets and security notices.` },
        { kind: 'button', label: 'Confirm email', url },
        { kind: 'note', text: `This link expires in 24 hours. ${IGNORE}` },
      ],
    }),

  passwordReset: (to: string, name: string, url: string) =>
    render({
      to,
      subject: 'Reset your Arvo password',
      preheader: 'Use this link within an hour to choose a new password.',
      heading: 'Reset your password',
      blocks: [
        { kind: 'p', text: `Hi ${name}, we received a request to reset the password for your Arvo account.` },
        { kind: 'button', label: 'Choose a new password', url },
        { kind: 'note', text: `This link expires in 1 hour and can be used once. ${IGNORE} Your password won't change.` },
      ],
    }),

  passwordChanged: (to: string, name: string, settingsUrl: string) =>
    render({
      to,
      subject: 'Your Arvo password was changed',
      preheader: 'Your password was changed and other sessions were signed out.',
      heading: 'Your password was changed',
      blocks: [
        { kind: 'p', text: `Hi ${name}, the password for your Arvo account was just changed. Other signed-in sessions were signed out.` },
        { kind: 'p', text: "If this wasn't you, reset your password right away and turn on two-factor authentication." },
        { kind: 'button', label: 'Review security settings', url: settingsUrl },
      ],
    }),

  loginAlert: (to: string, name: string, when: Date, detail: string) =>
    render({
      to,
      subject: 'New sign-in to Arvo',
      preheader: 'A new sign-in to your Arvo account.',
      heading: 'New sign-in',
      blocks: [
        { kind: 'p', text: `Hi ${name}, your Arvo account was signed in to on ${when.toUTCString()}.` },
        { kind: 'list', items: [detail] },
        { kind: 'note', text: "If this wasn't you, reset your password and review your security settings." },
      ],
    }),

  twoFactorEnabled: (to: string, name: string) =>
    render({
      to,
      subject: 'Two-factor authentication is on',
      preheader: 'Your Arvo account now asks for a second step at sign-in.',
      heading: 'Two-factor authentication is on',
      blocks: [
        { kind: 'p', text: `Hi ${name}, signing in to Arvo now needs a code from your authenticator app, an emailed code, or a recovery code.` },
        { kind: 'note', text: 'Keep your recovery codes somewhere safe. If you did not make this change, reset your password immediately.' },
      ],
    }),

  twoFactorDisabled: (to: string, name: string) =>
    render({
      to,
      subject: 'Two-factor authentication was turned off',
      preheader: 'Your Arvo account no longer asks for a second step at sign-in.',
      heading: 'Two-factor authentication is off',
      blocks: [
        { kind: 'p', text: `Hi ${name}, two-factor authentication was turned off for your Arvo account. Your recovery codes no longer work.` },
        { kind: 'note', text: 'If you did not make this change, reset your password immediately and turn it back on.' },
      ],
    }),

  emailOtp: (to: string, name: string, code: string) =>
    render({
      to,
      subject: `${code} is your Arvo sign-in code`,
      preheader: 'Your sign-in code expires in 10 minutes.',
      heading: 'Your sign-in code',
      blocks: [
        { kind: 'p', text: `Hi ${name}, enter this code to finish signing in.` },
        { kind: 'code', code },
        { kind: 'note', text: `The code expires in 10 minutes. Never share it. ${IGNORE}` },
      ],
    }),

  uploadReminder: (
    to: string,
    input: { name: string; daysSinceImport: number | null; staleAccounts: string[]; importsUrl: string; unsubscribeUrl: string; settingsUrl: string },
  ) =>
    render({
      to,
      subject: 'Time to upload your latest statements',
      preheader: 'A quick import keeps your Arvo dashboards current.',
      heading: 'Your ledger is waiting',
      blocks: [
        {
          kind: 'p',
          text:
            input.daysSinceImport === null
              ? `Hi ${input.name}, you haven't imported a statement yet. A first import brings your dashboards to life.`
              : `Hi ${input.name}, it's been ${input.daysSinceImport} day${input.daysSinceImport === 1 ? '' : 's'} since your last statement import. A quick upload keeps budgets, goals and insights accurate.`,
        },
        ...(input.staleAccounts.length
          ? [{ kind: 'p', text: 'No new transactions since then in:' } as Block, { kind: 'list', items: input.staleAccounts } as Block]
          : []),
        { kind: 'button', label: 'Upload statements', url: input.importsUrl },
        { kind: 'note', text: `Change how often you hear from us in Settings → Preferences (${input.settingsUrl}), or unsubscribe from reminders: ${input.unsubscribeUrl}` },
      ],
      headers: {
        'List-Unsubscribe': `<${input.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  weeklyBriefing: (
    to: string,
    input: {
      name: string;
      weekStart: string;
      narrative: string | null;
      narrativeBy: string | null;
      decision: string;
      budgets: string[];
      goals: string[];
      savings: string[];
      upcoming: string[];
      advisorUrl: string;
      settingsUrl: string;
      unsubscribeUrl: string;
    },
  ) => {
    const section = (title: string, items: string[]): Block[] => (items.length ? [{ kind: 'p', text: title }, { kind: 'list', items }] : []);
    return render({
      to,
      subject: 'Your weekly money briefing',
      preheader: input.decision,
      heading: `Week of ${input.weekStart}`,
      blocks: [
        { kind: 'p', text: `Hi ${input.name}, here is where your money stands this week.` },
        ...(input.narrative ? [{ kind: 'p', text: input.narrative } as Block, { kind: 'note', text: `Summary written by ${input.narrativeBy ?? 'your AI provider'} from the figures below.` } as Block] : []),
        { kind: 'p', text: `Decision for this week: ${input.decision}` },
        ...section('Budgets that need attention:', input.budgets),
        ...section('Goals:', input.goals),
        ...section('Ways to spend less:', input.savings),
        ...section('Coming up in the next 7 days:', input.upcoming),
        { kind: 'button', label: 'Open the advisor', url: input.advisorUrl },
        { kind: 'note', text: `Figures are computed from your imported statements. Educational, not investment advice. Change this in Settings → Preferences (${input.settingsUrl}) or unsubscribe: ${input.unsubscribeUrl}` },
      ],
      headers: {
        'List-Unsubscribe': `<${input.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
  },
};
