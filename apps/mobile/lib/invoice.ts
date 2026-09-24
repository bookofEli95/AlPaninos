import * as Print from 'expo-print';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import { groupRepeats } from './modifiers';

// Itemized invoice PDF for an order (the order screen's Email Invoice /
// Save PDF buttons): the store and its HST number, who it's billed to
// (company, PO number), every item, and the tax breakdown. Built on the
// phone -- there's no email server -- and handed to the mail app or the
// share sheet.

const BUSINESS_NAME = 'Al Paninos';

const escape = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (value: unknown) => `$${Number(value ?? 0).toFixed(2)}`;

export const invoiceNumber = (order: any) => `AP-${String(order.id).slice(0, 8).toUpperCase()}`;

function invoiceHtml(order: any): string {
  const location = order.locations || {};
  const placed = new Date(order.created_at);
  const forTime = order.requested_ready_at ? new Date(order.requested_ready_at) : null;
  const taxRate = location.tax_rate != null ? Math.round(Number(location.tax_rate) * 1000) / 10 : null;
  const subtotal = order.subtotal_amount ?? order.total_amount;

  const rows = (order.order_items || [])
    .map((item: any) => {
      const mods = groupRepeats(item.order_item_modifiers || [], (m: any) => m.modifier_options?.name ?? '')
        .map(({ item: m, count }) => `${count > 1 ? `${count}&times; ` : ''}${escape(m.modifier_options?.name)}`)
        .join(', ');
      return `
        <tr>
          <td class="qty">${escape(item.quantity)}</td>
          <td>
            <div class="name">${escape(item.menu_items?.name ?? 'Item')}</div>
            ${mods ? `<div class="mods">${mods}</div>` : ''}
            ${item.special_instructions ? `<div class="mods">Note: ${escape(item.special_instructions)}</div>` : ''}
          </td>
          <td class="amt">${money(item.total_price)}</td>
        </tr>`;
    })
    .join('');

  const billTo = [
    order.catering_company && `<strong>${escape(order.catering_company)}</strong>`,
    escape(order.customer_name),
    escape(order.customer_email),
    escape(order.customer_phone),
  ]
    .filter(Boolean)
    .join('<br/>');

  const details = [
    ['Invoice #', invoiceNumber(order)],
    ['Date', placed.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })],
    order.po_number && ['PO / Cost Centre', order.po_number],
    [
      order.order_type === 'delivery' ? 'Delivery' : 'Pickup',
      forTime
        ? `${forTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${forTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        : 'ASAP',
    ],
  ]
    .filter(Boolean)
    .map((pair: any) => `<tr><td class="label">${escape(pair[0])}</td><td>${escape(pair[1])}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1C1917; margin: 32px; font-size: 12px; }
  h1 { font-size: 26px; margin: 0; color: #A61C14; letter-spacing: 1px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .biz { font-size: 16px; font-weight: 700; }
  .muted { color: #78716C; }
  .cols { display: flex; justify-content: space-between; margin-bottom: 20px; }
  .cols > div { width: 48%; }
  .cap { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #78716C; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  .details td { padding: 2px 0; }
  .details .label { color: #78716C; width: 45%; }
  .items th { text-align: left; font-size: 10px; text-transform: uppercase; color: #78716C; border-bottom: 2px solid #1C1917; padding: 6px 4px; }
  .items td { border-bottom: 1px solid #E7E5E4; padding: 8px 4px; vertical-align: top; }
  .qty { width: 36px; }
  .amt { text-align: right; width: 80px; white-space: nowrap; }
  .name { font-weight: 700; }
  .mods { color: #57534E; margin-top: 2px; }
  .totals { width: 45%; margin-left: auto; margin-top: 12px; }
  .totals td { padding: 3px 4px; }
  .totals .grand td { font-size: 15px; font-weight: 700; border-top: 2px solid #1C1917; padding-top: 6px; }
  .foot { margin-top: 32px; color: #78716C; font-size: 11px; }
</style></head>
<body>
  <div class="top">
    <div>
      <div class="biz">${escape(BUSINESS_NAME)}</div>
      <div class="muted">${escape(location.name)}${location.address ? `<br/>${escape(location.address)}` : ''}</div>
      ${location.hst_number ? `<div class="muted">HST # ${escape(location.hst_number)}</div>` : ''}
    </div>
    <h1>INVOICE</h1>
  </div>

  <div class="cols">
    <div>
      <div class="cap">Bill To</div>
      <div>${billTo}</div>
      ${order.order_type === 'delivery' && order.delivery_address ? `<div class="cap" style="margin-top:10px">Deliver To</div><div>${escape(order.delivery_address)}</div>` : ''}
    </div>
    <div><table class="details">${details}</table></div>
  </div>

  <table class="items">
    <thead><tr><th>Qty</th><th>Item</th><th class="amt">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="amt">${money(subtotal)}</td></tr>
    ${Number(order.discount_amount) > 0 ? `<tr><td>Discount${order.promo_code ? ` (${escape(order.promo_code)})` : ''}</td><td class="amt">-${money(order.discount_amount)}</td></tr>` : ''}
    ${order.tax_amount != null ? `<tr><td>HST${taxRate != null ? ` (${taxRate}%)` : ''}</td><td class="amt">${money(order.tax_amount)}</td></tr>` : ''}
    <tr class="grand"><td>Total (CAD)</td><td class="amt">${money(order.total_amount)}</td></tr>
  </table>

  <div class="foot">Thank you for ordering from ${escape(BUSINESS_NAME)}!</div>
</body></html>`;
}

async function createInvoicePdf(order: any): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html: invoiceHtml(order) });
  return uri;
}

// Opens the mail app with the PDF attached, addressed to the order's
// invoice email when there is one. Falls back to the share sheet on a
// phone with no mail account set up.
export async function emailInvoice(order: any): Promise<void> {
  const uri = await createInvoicePdf(order);
  if (await MailComposer.isAvailableAsync()) {
    await MailComposer.composeAsync({
      recipients: order.invoice_email ? [order.invoice_email] : [],
      subject: `${BUSINESS_NAME} Invoice ${invoiceNumber(order)}`,
      body: `Please find attached invoice ${invoiceNumber(order)} for ${money(order.total_amount)}${order.po_number ? ` (PO ${order.po_number})` : ''}.`,
      attachments: [uri],
    });
    return;
  }
  await shareInvoiceFile(uri, order);
}

export async function shareInvoice(order: any): Promise<void> {
  await shareInvoiceFile(await createInvoicePdf(order), order);
}

async function shareInvoiceFile(uri: string, order: any): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Invoice ${invoiceNumber(order)}`,
  });
}
