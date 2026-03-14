/**
 * Parse Indian UPI / bank SMS into transaction-like objects.
 * Handles common formats: debited, credited, amount (Rs/INR), date, sender/merchant.
 */

export interface ParsedSmsTransaction {
  merchant: string;
  amount: number;
  date: string;
  isDebit: boolean;
  description: string;
  upiId?: string;
  category?: string;
}

// Amount patterns: Rs. 500 / Rs 500 / INR 500 / ₹500 / 500 debited
const AMOUNT_REGEX = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{2})?)|([\d,]+(?:\.\d{2})?)\s*(?:Rs\.?|INR|₹)/gi;
const DEBIT_KEYWORDS = /debited|deducted|withdrawn|spent|paid to|sent to|purchase/i;
const CREDIT_KEYWORDS = /credited|received|deposited|refund/i;

// Extract merchant/sender: "to UPI- MERCHANT", "to VPA xxx@bank", "from XXX", "at MERCHANT"
function extractMerchant(body: string, isDebit: boolean): string {
  const upper = body;
  let match =
    upper.match(/to\s+UPI[- ]([^.]+?)(?:\.|$|\s+on)/i) ||
    upper.match(/to\s+VPA\s+([^\s.]+)/i) ||
    upper.match(/paid to\s+([^.]+?)(?:\.|$|\s+on)/i) ||
    upper.match(/sent to\s+([^.]+?)(?:\.|$|\s+on)/i) ||
    upper.match(/at\s+([^.]+?)(?:\.|$|\s+on)/i) ||
    upper.match(/from\s+([^.]+?)(?:\.|$|\s+on)/i) ||
    upper.match(/UPI\s*-\s*([^.]+?)(?:\.|$|\s+on)/i);
  if (match) {
    return match[1].trim().replace(/\s+/g, ' ').slice(0, 80);
  }
  if (isDebit) return 'UPI Payment';
  return 'Received';
}

function extractAmount(body: string): number | null {
  const normalized = body.replace(/,/g, '');
  const patterns = [
    /(?:Rs\.?|INR|₹)\s*([\d.]+)/i,
    /([\d.]+)\s*(?:Rs\.?|INR|₹)/i,
    /debited\s*(?:with)?\s*[Rr]s\.?\s*([\d.]+)/i,
    /(?:amount|amt)\s*(?:of)?\s*[Rr]s\.?\s*([\d.]+)/i,
    /([\d.]+)\s*(?:debited|credited|deducted)/i,
  ];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (m) {
      const n = parseFloat(m[1]);
      if (!isNaN(n) && n > 0 && n < 1e8) return Math.round(n * 100) / 100;
    }
  }
  return null;
}

function extractDate(body: string): Date {
  const now = new Date();
  // "on 14-Mar-25" / "on 14/03/2025" / "dated 14-Mar"
  const d = body.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (d) {
    const day = parseInt(d[1], 10);
    const month = parseInt(d[2], 10) - 1;
    const year = parseInt(d[3], 10) < 100 ? 2000 + parseInt(d[3], 10) : parseInt(d[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }
  const dm = body.match(/(\d{1,2})[-/](\d{1,2})/);
  if (dm) {
    const date = new Date(now.getFullYear(), parseInt(dm[2], 10) - 1, parseInt(dm[1], 10));
    if (!isNaN(date.getTime())) return date;
  }
  return now;
}

export function parseSmsToTransactions(
  smsList: { body: string; date?: string | number; address?: string }[]
): ParsedSmsTransaction[] {
  const out: ParsedSmsTransaction[] = [];
  const seen = new Set<string>();

  for (const sms of smsList) {
    const body = (sms.body || '').trim();
    if (body.length < 10) continue;

    const isDebit = DEBIT_KEYWORDS.test(body) && !CREDIT_KEYWORDS.test(body);
    const isCredit = CREDIT_KEYWORDS.test(body);
    if (!isDebit && !isCredit) continue;

    const amount = extractAmount(body);
    if (amount == null || amount <= 0) continue;

    const date = sms.date
      ? new Date(typeof sms.date === 'number' ? sms.date : sms.date)
      : extractDate(body);
    const merchant = extractMerchant(body, isDebit);
    const key = `${date.getTime()}-${merchant}-${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      merchant,
      amount,
      date: date.toISOString(),
      isDebit,
      description: body.slice(0, 200),
      upiId: sms.address || undefined,
      category: 'others',
    });
  }

  out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return out;
}
