// js/email.js
// PickMyNumbers — EuroMillions Number Optimizer

// =====================
// EMAIL — BEVESTIGING
// =====================
async function sendConfirmationEmail(name, email, tickets, nextDraw, profile) {
  const profileLabel = profile ? profile.label : 'Standaard';
  const ticketHtml = tickets.map((t, i) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#888;">Ticket ${i+1}</td>
      <td style="padding:8px 12px;">
        ${t.nums.map(n => `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#E6F1FB;color:#0C447C;font-size:12px;font-weight:500;margin:2px;">${n}</span>`).join('')}
        <span style="margin:0 6px;color:#ddd;">+</span>
        ${t.stars.map(s => `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#fff4e6;color:#8a4510;font-size:12px;font-weight:500;margin:2px;">★${s}</span>`).join('')}
      </td>
    </tr>`).join('');

  const html = `
    <!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8f8f6;padding:2rem;">
    <div style="max-width:520px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e8e8e4;">
      <div style="background:#1a1a18;padding:1.5rem;color:#fff;">
        <div style="font-size:18px;font-weight:500;">🎰 PickMyNumbers</div>
        <div style="font-size:12px;color:#aaa;margin-top:4px;">Jouw tickets zijn opgeslagen</div>
      </div>
      <div style="padding:1.5rem;">
        <p style="font-size:15px;margin-bottom:1rem;">Hallo <strong>${name}</strong>! 👋</p>
        <p style="font-size:13px;color:#555;margin-bottom:1.5rem;">
          Je <strong>${profileLabel}</strong> tickets voor de <strong>${nextDraw}</strong> trekking zijn opgeslagen. 
          Na de trekking ontvang je automatisch een persoonlijke analyse.
        </p>
        <table style="width:100%;border-collapse:collapse;background:#f8f8f6;border-radius:8px;overflow:hidden;">
          ${ticketHtml}
        </table>
        <p style="font-size:11px;color:#aaa;margin-top:1.5rem;line-height:1.6;">
          EuroMillions is een kans- en gokspel. Geen enkele methode garandeert winst. 18+.<br>
          <a href="https://pickmynumbers.eu" style="color:#aaa;">pickmynumbers.eu</a>
        </p>
      </div>
    </div>
    </body></html>`;

  await fetch(EDGE_EMAIL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({
      from: 'PickMyNumbers <noreply@pickmynumbers.eu>',
      to: [email],
      subject: `✅ Tickets opgeslagen voor ${nextDraw}`,
      html
    })
  });
}


