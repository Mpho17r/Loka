import type { Campaign, Placement } from '../types';
import { ALL_CITIES } from './pricing';

/** Live, in-budget campaigns that match a placement and the viewer's city. Paid slots are labelled "Sponsored" in the UI. */
export function liveAds(campaigns: Campaign[], placements: Placement[], viewerCity: string): Campaign[] {
  return campaigns.filter(
    (c) =>
      c.status === 'Live' &&
      c.delivered < c.impressions &&
      placements.includes(c.placement) &&
      (c.city === ALL_CITIES || c.city === viewerCity),
  );
}
