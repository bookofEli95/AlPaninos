// Deno Edge Function: charges a card order (see the online_payments
// migration). Called by the website and app right after place_order put
// the order in, with the one-time card token from the card boxes:
//
//   POST { order_id, token }   Authorization: Bearer <the customer's sign-in>
//
// The amount always comes from the order in the database (total + tip),
// never from the request. begin_order_payment claims the order first, so
// a double tap can't charge it twice; finish_order_payment records how it
// went -- paid, or (declined) the order is removed and its rewards given
// back so they can try another card or pay at the store.
//
// The card company is chosen by the PAYMENTS_PROVIDER secret:
//   (unset)  -- card payments aren't set up: nothing is charged
//   'test'   -- pretend payments for testing, with test tokens only:
//               test_ok, test_decline, test_cvv, test_expired, test_unknown
//   'clover' -- added when Clover is linked
//
// Answers 200 with { status } for every result a customer should read:
//   'paid' | 'declined' (+ message) | 'unknown' (+ message) |
//   'busy' (+ message) | 'unavailable' (+ message) | 'error' (+ message)

type ChargeInput = {
  amountCents: number;
  currency: 'CAD';
  token: string;
  orderId: string;
  locationId: string;
  email: string | null;
};
type ChargeResult =
  | { outcome: 'approved'; ref: string; card: string | null }
  | { outcome: 'declined'; reason: string }
  | { outcome: 'unknown' };
type Provider = { charge: (input: ChargeInput) => Promise<ChargeResult> };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// What the customer is told when a card doesn't go through.
const DECLINE_MESSAGES: Record<string, string> = {
  incorrect_cvc: "The security code (CVV) doesn't match this card. Please check it and try again.",
  expired_card: 'That card has expired. Please use another card.',
  incorrect_zip: "The postal code doesn't match this card. Please check it and try again.",
  incorrect_number: "That card number isn't right. Please check it and try again.",
};
const DECLINED = 'Your card was declined. Please try another card, or choose to pay at the store.';
const UNKNOWN = "We couldn't confirm your payment. Please don't pay again. Call the store and we'll check it for you.";

// Pretend card company for testing. Never charges anything.
function testCharge(token: string): ChargeResult {
  if (token === 'test_ok') {
    return { outcome: 'approved', ref: `test_${crypto.randomUUID().slice(0, 12)}`, card: 'Test card •••• 4242' };
  }
  if (token === 'test_cvv') return { outcome: 'declined', reason: 'incorrect_cvc' };
  if (token === 'test_expired') return { outcome: 'declined', reason: 'expired_card' };
  if (token === 'test_unknown') return { outcome: 'unknown' };
  return { outcome: 'declined', reason: 'card_declined' };
}
const testProvider: Provider = { charge: ({ token }) => Promise.resolve(testCharge(token)) };

function pickProvider(): Provider | null {
  const name = Deno.env.get('PAYMENTS_PROVIDER') ?? '';
  if (name === 'test') return testProvider;
  // 'clover': added when Clover is linked.
  return null;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

async function rpc(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Who's asking -- from their own sign-in (guests included), not the body.
async function callerId(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return typeof user?.id === 'string' ? user.id : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { status: 'error', message: 'Not allowed.' });

  const provider = pickProvider();
  if (!provider) {
    return reply(200, {
      status: 'unavailable',
      message: "Card payments aren't set up yet. Please choose to pay at the store.",
    });
  }

  const userId = await callerId(req);
  if (!userId) return reply(401, { status: 'error', message: 'Please sign in again and retry.' });

  const { order_id, token } = await req.json().catch(() => ({}));
  if (typeof order_id !== 'string' || typeof token !== 'string' || !token) {
    return reply(400, { status: 'error', message: 'Something was missing from the payment. Please try again.' });
  }

  let begin: { state: string; amount?: number; location_id?: string; email?: string | null };
  try {
    begin = await rpc('begin_order_payment', { p_order_id: order_id, p_user_id: userId });
  } catch (e) {
    console.error(e);
    return reply(200, { status: 'error', message: 'Something went wrong starting your payment. Please try again.' });
  }
  if (begin.state === 'paid') return reply(200, { status: 'paid', order_id });
  if (begin.state === 'busy') {
    return reply(200, { status: 'busy', message: 'Your payment is already going through. Please wait a moment.' });
  }
  if (begin.state !== 'charge') {
    return reply(200, { status: 'error', message: "That order couldn't be found. Please place it again." });
  }

  const amount = Number(begin.amount);
  const amountCents = Math.round(amount * 100);
  let result: ChargeResult;
  try {
    result = await provider.charge({
      amountCents,
      currency: 'CAD',
      token,
      orderId: order_id,
      locationId: String(begin.location_id),
      email: begin.email ?? null,
    });
  } catch (e) {
    // No clear answer from the card company: it may or may not have gone
    // through, so the order is kept for the store to check.
    console.error('Charge failed:', e);
    result = { outcome: 'unknown' };
  }

  try {
    if (result.outcome === 'approved') {
      await rpc('finish_order_payment', {
        p_order_id: order_id,
        p_outcome: 'approved',
        p_amount: amount,
        p_ref: result.ref,
        p_card: result.card,
      });
      return reply(200, { status: 'paid', order_id });
    }
    if (result.outcome === 'declined') {
      await rpc('finish_order_payment', { p_order_id: order_id, p_outcome: 'declined' });
      return reply(200, { status: 'declined', message: DECLINE_MESSAGES[result.reason] ?? DECLINED });
    }
  } catch (e) {
    console.error(e);
  }
  return reply(200, { status: 'unknown', message: UNKNOWN });
});
