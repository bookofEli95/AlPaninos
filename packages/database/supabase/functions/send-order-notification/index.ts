// Deno Edge Function -- invoked by the on_order_status_change trigger
// (see migrations/20260917200000_push_notifications.sql) whenever an
// order's status changes. Looks up that customer's push tokens and sends
// them a status update via Expo's push service, which is free and needs no
// account/API key of its own (unlike email/SMS providers).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STATUS_MESSAGES: Record<string, (orderType: string) => string> = {
  preparing: () => 'Your order is being prepared!',
  ready: () => 'Your order is ready for pickup!',
  out_for_delivery: () => 'Your order is out for delivery!',
  completed: (orderType) =>
    orderType === 'delivery' ? 'Your order has been delivered. Enjoy!' : 'Order picked up. Enjoy!',
  cancelled: () => 'Your order was cancelled.',
};

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const order = payload.record;

    if (!order?.id || !order?.status) {
      return new Response('Missing order data', { status: 400 });
    }

    const buildMessage = STATUS_MESSAGES[order.status];
    if (!buildMessage) {
      return new Response('No notification for this status', { status: 200 });
    }

    if (!order.user_id) {
      return new Response('No user on order', { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: tokens, error } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', order.user_id);

    if (error) throw error;
    if (!tokens || tokens.length === 0) {
      return new Response('No push tokens for user', { status: 200 });
    }

    const body = buildMessage(order.order_type);
    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      sound: 'default',
      title: 'AlPaninos',
      body,
      data: { orderId: order.id },
    }));

    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    const pushResult = await pushRes.json();
    return new Response(JSON.stringify(pushResult), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(String(e), { status: 500 });
  }
});
