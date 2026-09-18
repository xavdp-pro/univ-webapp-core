/**
 * Outgoing mail. Two implementations behind one `send()`:
 *  - Mailjet (API keys from env), the production path;
 *  - console, used when the keys are absent outside production: the magic link
 *    is printed on the API's stdout so a developer can copy it from the logs.
 * In production a missing key is a hard error, never a silent console fallback.
 */

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function createMailjetMailer(mailCfg, { appName = 'app', fetchImpl = fetch } = {}) {
  const auth = `Basic ${Buffer.from(`${mailCfg.mailjetApiKey}:${mailCfg.mailjetApiSecret}`).toString('base64')}`
  return {
    kind: 'mailjet',
    async send({ toEmail, toName, subject, text, html }) {
      const payload = {
        Messages: [
          {
            From: { Email: mailCfg.fromEmail, Name: mailCfg.fromName || appName },
            To: [{ Email: toEmail, Name: toName || toEmail }],
            Subject: subject,
            TextPart: text,
            HTMLPart: html || `<pre>${escapeHtml(text)}</pre>`,
          },
        ],
      }
      const res = await fetchImpl('https://api.mailjet.com/v3.1/send', {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error(`[${appName}] Mailjet error`, res.status, errText.slice(0, 400))
        return { sent: false, reason: 'mailjet_error', status: res.status }
      }
      const body = await res.json().catch(() => ({}))
      const to = body?.Messages?.[0]?.To?.[0]
      // MessageID exceeds the safe integer range once parsed; MessageUUID is exact.
      return { sent: true, messageId: to?.MessageUUID || String(to?.MessageID || '') }
    },
  }
}

export function createConsoleMailer({ appName = 'app', log = console.log } = {}) {
  return {
    kind: 'console',
    async send({ toEmail, subject, text }) {
      log(`[${appName}] DEV MAIL (no Mailjet keys) to <${toEmail}> — ${subject}\n${text}\n`)
      return { sent: true, messageId: 'console' }
    },
  }
}

/** Picks the mailer for a config. Throws in production without Mailjet keys. */
export function createMailer(cfg) {
  const m = cfg.mail
  const configured = m.mailjetApiKey && m.mailjetApiSecret && m.fromEmail
  if (configured) return createMailjetMailer(m, { appName: cfg.appName })
  if (cfg.isProduction) {
    throw new Error(`[${cfg.appName}] Production needs MAILJET_API_KEY, MAILJET_API_SECRET and MAIL_FROM_EMAIL`)
  }
  return createConsoleMailer({ appName: cfg.appName })
}

/** Builds the magic-link message. Copy is French because the audience is; adapt in a fork. */
export function magicLinkMessage({ appName, toName, magicUrl, ttlMinutes }) {
  const name = toName || ''
  return {
    subject: `Votre lien de connexion — ${appName}`,
    text: [
      `Bonjour ${name},`,
      '',
      `Voici votre lien personnel pour entrer sur ${appName} :`,
      magicUrl,
      '',
      `Il est valable ${ttlMinutes} minutes et ne fonctionne qu'une seule fois.`,
      "Si vous n'avez pas demandé ce lien, ignorez ce message : personne d'autre ne peut s'en servir.",
    ].join('\n'),
    html: `
      <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;max-width:520px">
        <p style="font-size:15px">Bonjour ${escapeHtml(name)},</p>
        <p style="font-size:15px">Voici votre lien personnel pour entrer sur <strong>${escapeHtml(appName)}</strong>.</p>
        <p style="margin:28px 0">
          <a href="${escapeHtml(magicUrl)}"
             style="background:#4f46e5;color:#ffffff;padding:13px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">
            Se connecter
          </a>
        </p>
        <p style="color:#64748b;font-size:13px;line-height:1.6">
          Valable ${ttlMinutes} minutes, pour une seule connexion.<br/>
          Si vous n’avez pas demandé ce lien, ignorez ce message : personne d’autre ne peut s’en servir.
        </p>
      </div>
    `,
  }
}
