/**
 * Minimal transactional email via Resend's REST API (no extra deps — just fetch).
 *
 * Configure with:
 *   RESEND_API_KEY   — your Resend API key
 *   EMAIL_FROM       — verified sender, e.g. "Agentic SDLC <advisor@yourdomain.com>"
 *
 * If RESEND_API_KEY is unset, the link is logged to the server console and
 * `delivered: false` is returned. Callers may surface the link directly in
 * non-production so the flow is testable without an email provider.
 */

interface MagicLinkEmail {
  to: string;
  name: string;
  productName: string;
  link: string;
}

export async function sendMagicLink(opts: MagicLinkEmail): Promise<{ delivered: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.EMAIL_FROM ?? "Agentic SDLC <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY unset — magic link for ${opts.to}: ${opts.link}`);
    return { delivered: false };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: `Your secure link to view ${opts.productName}`,
      html: renderHtml(opts),
      text:
        `Hi ${opts.name},\n\n` +
        `Use this one-time link to open your private walkthrough of ${opts.productName}:\n\n` +
        `${opts.link}\n\n` +
        `The link expires in 30 minutes and can be used once. ` +
        `If you didn't request this, you can ignore this email.`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[email] Resend send failed (${res.status}): ${detail}`);
    throw new Error("Failed to send verification email");
  }

  return { delivered: true };
}

function renderHtml({ name, productName, link }: MagicLinkEmail): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#0b0d12;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#14171f;border-radius:16px;padding:36px;">
          <tr><td style="color:#8b93a7;font-size:13px;letter-spacing:.08em;text-transform:uppercase;">Agentic SDLC</td></tr>
          <tr><td style="color:#f4f5f8;font-size:22px;font-weight:600;padding-top:8px;">Your walkthrough of ${escapeHtml(productName)}</td></tr>
          <tr><td style="color:#c2c8d6;font-size:15px;line-height:1.6;padding-top:16px;">
            Hi ${escapeHtml(name)}, click below to open your private session. This link is unique to you,
            expires in 30 minutes, and can be used once.
          </td></tr>
          <tr><td style="padding-top:28px;">
            <a href="${link}" style="display:inline-block;background:#5b8cff;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 26px;border-radius:10px;">Open my session →</a>
          </td></tr>
          <tr><td style="color:#6b7384;font-size:12px;line-height:1.6;padding-top:28px;">
            If you didn't request this, you can safely ignore this email. Your data is never sold,
            and is only used to improve this service if you opted in.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
