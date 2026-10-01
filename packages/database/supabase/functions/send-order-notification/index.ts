// Deno Edge Function -- invoked by the on_order_status_change trigger
// (the order_update_notifications migration) whenever an order's status
// changes. Tells the customer:
//   * by push notification (Expo's push service -- free, no API key), when
//     they've allowed it on their phone and haven't turned it off in
//     Notifications (profiles.push_enabled);
//   * by email, when the order asked for email updates (orders.notify_email,
//     from Notifications / checkout) -- as it becomes ready for pickup,
//     goes out for delivery, or is cancelled. Sent through the same Gmail
//     account as invoices (SMTP_USER / SMTP_PASS secrets; see email-invoice).
//
// The webhook has no sign-in, so the payload is only used for the order id:
// everything else (status, customer, email address) is read fresh from the
// database, and each email is claimed in orders.emailed_statuses before it's
// sent -- a repeated or forged call can never send one twice, or to anyone
// but the order's own customer.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const PUSH_MESSAGES: Record<string, (orderType: string) => string> = {
  preparing: () => 'Your order is being prepared!',
  ready: (orderType) =>
    orderType === 'delivery' ? 'Your order is ready and waiting for the driver.' : 'Your order is ready for pickup!',
  out_for_delivery: () => 'Your order is out for delivery!',
  completed: (orderType) =>
    orderType === 'delivery' ? 'Your order has been delivered. Enjoy!' : 'Order picked up. Enjoy!',
  cancelled: () => 'Your order was cancelled.',
};

const escape = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const money = (value: unknown) => `$${Number(value ?? 0).toFixed(2)}`;
const orderNumber = (order: any) => `AP-${String(order.id).slice(0, 8).toUpperCase()}`;

// The emails, by status. null = no email for that status (and order type).
function emailFor(order: any): { subject: string; heading: string; lines: string[] } | null {
  const store = order.locations || {};
  const storeName = `Al Paninos ${store.name ?? ''}`.trim();
  const firstName = String(order.customer_name ?? '').trim().split(/\s+/)[0];
  const hi = firstName ? `Hi ${escape(firstName)},` : 'Hi there,';

  if (order.status === 'ready' && order.order_type !== 'delivery') {
    return {
      subject: `Your order is ready for pickup (${orderNumber(order)})`,
      heading: "It's ready! 🎉",
      lines: [
        hi,
        `Your order is hot and waiting at <strong>${escape(storeName)}</strong>${
          store.address ? `, ${escape(store.address)}` : ''
        }.`,
        `Just give your name at the counter${order.customer_name ? ` (<strong>${escape(order.customer_name)}</strong>)` : ''}.`,
      ],
    };
  }
  if (order.status === 'out_for_delivery') {
    return {
      subject: `Your order is on its way (${orderNumber(order)})`,
      heading: 'On its way! 🚗',
      lines: [
        hi,
        `Your order just left <strong>${escape(storeName)}</strong>${
          order.delivery_address ? ` and is heading to <strong>${escape(order.delivery_address)}</strong>` : ''
        }.`,
      ],
    };
  }
  if (order.status === 'cancelled') {
    return {
      subject: `Your order was cancelled (${orderNumber(order)})`,
      heading: 'Your order was cancelled',
      lines: [
        hi,
        `Your order from <strong>${escape(storeName)}</strong> was cancelled.`,
        store.phone
          ? `If you weren't expecting this, please call the store at <strong>${escape(store.phone)}</strong>.`
          : "If you weren't expecting this, please contact the store.",
      ],
    };
  }
  return null;
}

function emailHtml(order: any, heading: string, lines: string[]): string {
  const rows = (order.order_items || [])
    .map(
      (item: any) => `
        <tr>
          <td style="width:36px;padding:5px 4px;border-bottom:1px solid #E7E5E4;vertical-align:top;color:#78716C;">${escape(item.quantity)}&times;</td>
          <td style="padding:5px 4px;border-bottom:1px solid #E7E5E4;">${escape(item.menu_items?.name ?? 'Item')}</td>
        </tr>`
    )
    .join('');
  return `<html><body style="font-family:sans-serif;background:#FAF6F0;padding:24px;color:#1C1917;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;">
    <h2 style="margin:0 0 2px;color:#A61C14;">Al Paninos</h2>
    <p style="margin:0 0 18px;color:#78716C;font-size:13px;">Order ${orderNumber(order)}</p>
    <h1 style="margin:0 0 14px;font-size:24px;">${escape(heading)}</h1>
    ${lines.map((line) => `<p style="margin:0 0 10px;font-size:15px;line-height:22px;">${line}</p>`).join('')}
    ${rows ? `<table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:13px;">${rows}</table>` : ''}
    <p style="margin:12px 0 0;text-align:right;font-weight:700;">Total ${money(order.total_amount)}</p>
    <p style="margin-top:20px;color:#A8A29E;font-size:12px;">You're getting this because you asked for order updates by email. You can turn them off in the app under More &rsaquo; Notifications.</p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json().catch(() => null);
    const orderId = payload?.record?.id;
    if (typeof orderId !== 'string') {
      return new Response('Missing order id', { status: 400 });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        'id, user_id, status, order_type, customer_name, customer_email, notify_email, emailed_statuses, delivery_address, total_amount, locations ( name, address, phone ), order_items ( quantity, menu_items ( name ) )'
      )
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return new Response('No such order', { status: 200 });
    // A late call for a status the order has already moved past.
    if (payload?.record?.status && payload.record.status !== order.status) {
      return new Response('Stale status', { status: 200 });
    }

    const results: Record<string, unknown> = {};

    // ---- Push ---------------------------------------------------------------
    const pushMessage = PUSH_MESSAGES[order.status];
    if (pushMessage && order.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('push_enabled')
        .eq('id', order.user_id)
        .maybeSingle();
      if (profile?.push_enabled !== false) {
        const { data: tokens } = await supabase.from('push_tokens').select('token').eq('user_id', order.user_id);
        if (tokens && tokens.length > 0) {
          const body = pushMessage(order.order_type);
          const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(
              tokens.map((t: { token: string }) => ({
                to: t.token,
                sound: 'default',
                title: 'Al Paninos',
                body,
                data: { orderId: order.id },
              }))
            ),
          });
          results.push = await pushRes.json().catch(() => pushRes.status);
        } else {
          results.push = 'no devices';
        }
      } else {
        results.push = 'turned off';
      }
    }

    // ---- Email --------------------------------------------------------------
    const email = emailFor(order);
    const to = String(order.customer_email ?? '').trim();
    const smtpUser = Deno.env.get('SMTP_USER');
    const smtpPass = Deno.env.get('SMTP_PASS');
    if (email && order.notify_email && to && smtpUser && smtpPass) {
      // Claim this email first, so a second call for the same status sends
      // nothing.
      const { data: claimed, error: claimError } = await supabase
        .from('orders')
        .update({ emailed_statuses: [...(order.emailed_statuses ?? []), order.status] })
        .eq('id', order.id)
        .eq('status', order.status)
        .not('emailed_statuses', 'cs', `{${order.status}}`)
        .select('id');
      if (claimError) throw claimError;

      if (claimed && claimed.length > 0) {
        try {
          const port = Number(Deno.env.get('SMTP_PORT') ?? 465);
          const transporter = nodemailer.createTransport({
            host: Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com',
            port,
            secure: port === 465,
            auth: { user: smtpUser, pass: smtpPass },
          });
          await transporter.sendMail({
            from: `"${Deno.env.get('SMTP_FROM_NAME') ?? 'Al Paninos'}" <${smtpUser}>`,
            to,
            subject: email.subject,
            html: emailHtml(order, email.heading, email.lines),
          });
          results.email = 'sent';
        } catch (sendError) {
          // Un-claim it, so a later retry can still send it.
          await supabase.from('orders').update({ emailed_statuses: order.emailed_statuses ?? [] }).eq('id', order.id);
          console.error('Order email failed:', sendError);
          results.email = 'failed';
        }
      } else {
        results.email = 'already sent';
      }
    }

    return new Response(JSON.stringify(results), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(String(e), { status: 500 });
  }
});
