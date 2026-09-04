// Turns a stored phone number (any of "+91 95912 22822", "9591222822",
// "091-9591222822"...) into a wa.me deep link so an admin verifying a
// partner application can click straight into a WhatsApp chat/call instead
// of retyping the number. wa.me requires digits only, no "+", full country
// code included.

/** Defaults a bare 10-digit number to India (91) - every partner
 * application on this platform is India-first (PRD 6: PAN is mandatory for
 * India-based earning partners) with an optional country field for others. */
export function toWhatsAppDigits(rawPhone: string, countryHint?: string | null): string | null {
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) {
    const cc = countryHint === 'IN' || !countryHint ? '91' : '';
    return cc + digits;
  }
  // A leading trunk-prefix 0 some people type by habit ("091-95912...") -
  // drop it once, then treat the rest as already carrying a country code.
  if (digits.length > 10 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function whatsAppLink(rawPhone: string, countryHint?: string | null): string | null {
  const digits = toWhatsAppDigits(rawPhone, countryHint);
  return digits ? `https://wa.me/${digits}` : null;
}
