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
  second_approver_required: 'A different finance user must approve this refund.',
  request_already_decided: 'That request has already been decided.',
  video_required: 'A video advert needs an MP4 or MOV video. Image adverts need a JPG, PNG or WebP image.',
  image_required: 'An image advert needs a JPG, PNG or WebP image.',
  media_not_yours: 'That file is not in your account. Choose the file again.',
  media_type_not_allowed: 'That file type is not allowed.',
  media_flagged: 'The automatic media check flagged this file. Look at it yourself, then clear the flag or reject the advert.',
  media_scan_not_passed: 'This country requires the media check to pass first. Wait for it, or clear it after looking at the file.',
  media_not_scanned_yet: 'The file has not been scanned yet, so it cannot be blocked.',
  scan_not_found: 'There is no media check for this advert.',
  listing_has_no_owner: 'This listing has no seller account to message.',
  cannot_message_yourself: 'This is your own listing.',
  cannot_report_own_message: 'You cannot report your own message.',
  invalid_message: 'A message must be 1 to 2,000 characters.',
  blocked: 'You cannot message this person. One of you has blocked the other.',
  rate_limited: 'You are sending messages too fast. Wait a minute and try again.',
  conversation_not_found: 'That conversation could not be found.',
  message_not_found: 'That message could not be found.',
  report_not_found: 'That report could not be found.',
  request_not_found: 'That request could not be found.',
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
