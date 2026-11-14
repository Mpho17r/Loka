// The database raises short machine codes (see supabase/migrations). Show people a clear sentence instead.
const MESSAGES: Record<string, string> = {
  not_signed_in: 'Please sign in first.',
  terms_not_accepted: 'You need to accept the advertising terms.',
  account_not_verified: 'Only verified accounts can advertise. Ask Saccharum to verify your account.',
  promote_not_available: 'Loka Promote is not available in your country yet.',
  promote_not_configured: 'Advertising prices are not set up for your country yet.',
  placement_not_available: 'That placement is not available right now.',
  invalid_headline: 'The headline must be 5 to 60 characters.',
  invalid_dates: 'Check the dates. A campaign must start today or later and be within the maximum length.',
  unknown_city: 'That city is not available for targeting.',
  not_your_listing: 'You can only promote your own listings.',
  listing_not_found: 'That listing could not be found.',
  listing_not_active: 'That listing is not active.',
  impressions_out_of_range: 'The number of impressions is outside the allowed range.',
  no_price_for_placement: 'There is no price set for that placement yet.',
  not_allowed: 'You are not allowed to do that.',
  not_pending_review: 'This campaign is no longer waiting for review.',
  reason_required: 'A reason is required.',
  action_not_allowed_in_status: 'That action is not available for this campaign right now.',
  invoice_not_payable: 'This invoice cannot be paid or verified right now.',
  invoice_not_awaiting_payment: 'This invoice is not waiting for payment.',
  refund_exceeds_invoice: 'The refund is more than the invoice total.',
  revoke_exceeds_balance: 'That is more than the credit balance.',
  invoice_not_refundable: 'This invoice cannot be refunded.',
};

export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  for (const code of Object.keys(MESSAGES)) {
    if (raw.includes(code)) return MESSAGES[code];
  }
  if (/Invalid login credentials/i.test(raw)) return 'Wrong email or password.';
  if (/already registered/i.test(raw)) return 'That email already has an account. Try signing in.';
  if (/Network request failed|Failed to fetch/i.test(raw)) return 'No connection. Check your internet and try again.';
  return raw || 'Something went wrong. Please try again.';
}
