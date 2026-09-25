// Deno Edge Function -- the order screen's Email Invoice button. Sends the
// invoice to the email saved on the order (its invoice email, or the
// customer's email), through the same Gmail account that sends the sign-up
// codes, so nothing opens on the phone.
//
// The phone sends the order id and the invoice PDF it already builds
// (lib/invoice.ts). The function only sends:
//   * for an order that belongs to whoever is signed in (or to staff);
//   * to the address already saved on that order -- never one passed in;
//   * up to MAX_SENDS_PER_ORDER times per order (logged in invoice_emails);
// so it can't be used to send mail anywhere else. The email's own text
// (the order summary) is built here from the database.
//
// Needs two secrets, set once from the terminal:
//   pnpm dlx supabase secrets set SMTP_USER=you@gmail.com SMTP_PASS="your app password"
// Optional: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465),
// SMTP_FROM_NAME (default "Al Paninos"). Port 465 because hosted Edge
// Functions can't send out on port 587.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const MAX_SENDS_PER_ORDER = 5;
// A few pages of invoice is well under this; anything bigger isn't one.
const MAX_PDF_BYTES = 3 * 1024 * 1024;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const escape = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (value: unknown) => `$${Number(value ?? 0).toFixed(2)}`;
const invoiceNumber = (order: any) => `AP-${String(order.id).slice(0, 8).toUpperCase()}`;

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function emailHtml(order: any): string {
  const location = order.locations || {};
  const rows = (order.order_items || [])
    .map(
      (item: any) => `
        <tr>
          <td style="padding:6px 4px;border-bottom:1px solid #E7E5E4;vertical-align:top;">${escape(item.quantity)}&times;</td>
          <td style="padding:6px 4px;border-bottom:1px solid #E7E5E4;">${escape(item.menu_items?.name ?? 'Item')}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #E7E5E4;text-align:right;white-space:nowrap;">${money(item.total_price)}</td>
        </tr>`
    )
    .join('');
  const subtotal = order.subtotal_amount ?? order.total_amount;
  const line = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:3px 4px;${bold ? 'font-weight:700;font-size:15px;' : ''}">${label}</td><td style="padding:3px 4px;text-align:right;${bold ? 'font-weight:700;font-size:15px;' : ''}">${value}</td></tr>`;

  return `<html><body style="font-family:sans-serif;background:#FAF6F0;padding:24px;color:#1C1917;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;">
    <h2 style="margin:0 0 4px;color:#A61C14;">Al Paninos</h2>
    <p style="margin:0 0 16px;color:#78716C;font-size:13px;">${escape(location.name)}${location.address ? ` &middot; ${escape(location.address)}` : ''}</p>
    <p style="margin:0 0 4px;">Here's your invoice <strong>${invoiceNumber(order)}</strong>${order.po_number ? ` (PO ${escape(order.po_number)})` : ''}. The PDF is attached.</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">${rows}</table>
    <table style="width:60%;margin-left:auto;margin-top:10px;font-size:13px;">
      ${line('Subtotal', money(subtotal))}
      ${Number(order.discount_amount) > 0 ? line(`Discount${order.promo_code ? ` (${escape(order.promo_code)})` : ''}`, `-${money(order.discount_amount)}`) : ''}
      ${order.tax_amount != null ? line('HST', money(order.tax_amount)) : ''}
      ${line('Total (CAD)', money(order.total_amount), true)}
    </table>
    ${location.hst_number ? `<p style="margin-top:16px;color:#A8A29E;font-size:12px;">HST # ${escape(location.hst_number)}</p>` : ''}
    <p style="margin-top:16px;color:#78716C;font-size:12px;">Thank you for ordering from Al Paninos!</p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const smtpUser = Deno.env.get('SMTP_USER');
    const smtpPass = Deno.env.get('SMTP_PASS');
    if (!smtpUser || !smtpPass) {
      return reply(500, { error: "Invoice email isn't set up yet (the store's email login is missing)." });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Who's asking -- from their own sign-in, not anything in the body.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: userData } = token ? await admin.auth.getUser(token) : { data: null };
    const caller = userData?.user;
    if (!caller) return reply(401, { error: 'Please sign in again and retry.' });

    const { order_id, pdf_base64 } = await req.json().catch(() => ({}));
    if (typeof order_id !== 'string' || typeof pdf_base64 !== 'string') {
      return reply(400, { error: 'Something was missing from the request.' });
    }

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('*, locations ( * ), order_items ( quantity, total_price, menu_items ( name ) )')
      .eq('id', order_id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return reply(404, { error: "That order couldn't be found." });

    if (order.user_id !== caller.id) {
      // Same check as is_staff() in the database.
      const { data: account } = await admin.from('users').select('role').eq('id', caller.id).maybeSingle();
      if (!['staff', 'admin'].includes(account?.role)) return reply(403, { error: "That order couldn't be found." });
    }
    if (order.status === 'cancelled') return reply(400, { error: 'This order was cancelled.' });

    const to = String(order.invoice_email || order.customer_email || '').trim();
    if (!to) return reply(400, { error: 'There is no email saved on this order.' });

    const { count } = await admin
      .from('invoice_emails')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', order.id);
    if ((count ?? 0) >= MAX_SENDS_PER_ORDER) {
      return reply(429, { error: `This invoice has already been emailed ${MAX_SENDS_PER_ORDER} times. Use Save as PDF instead.` });
    }

    let pdf: Uint8Array;
    try {
      pdf = decodeBase64(pdf_base64);
    } catch {
      return reply(400, { error: "The invoice PDF couldn't be read." });
    }
    const isPdf = pdf.length > 4 && pdf[0] === 0x25 && pdf[1] === 0x50 && pdf[2] === 0x44 && pdf[3] === 0x46; // %PDF
    if (!isPdf || pdf.length > MAX_PDF_BYTES) return reply(400, { error: "The invoice PDF couldn't be read." });

    const port = Number(Deno.env.get('SMTP_PORT') ?? 465);
    const transporter = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const number = invoiceNumber(order);
    await transporter.sendMail({
      from: `"${Deno.env.get('SMTP_FROM_NAME') ?? 'Al Paninos'}" <${smtpUser}>`,
      to,
      subject: `Al Paninos Invoice ${number}${order.po_number ? ` (PO ${order.po_number})` : ''}`,
      html: emailHtml(order),
      attachments: [
        { filename: `AlPaninos-Invoice-${number}.pdf`, content: pdf_base64, encoding: 'base64', contentType: 'application/pdf' },
      ],
    });

    await admin.from('invoice_emails').insert({ order_id: order.id, sent_to: to, sent_by: caller.id });

    return reply(200, { sent_to: to });
  } catch (e) {
    console.error(e);
    return reply(500, { error: "The invoice couldn't be emailed right now. Please try again in a minute." });
  }
});
