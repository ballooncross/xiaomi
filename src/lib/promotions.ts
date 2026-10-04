export const PROMOTION_SOURCE = 'the-ride-side';
export const PROMOTION_URL = 'https://therideside.com/';
export type Promotion = {
  id: string; evidence: string; discount: number; scope: string;
  first_seen: string; last_seen: string; active: number;
};
export type PromotionData = {
  available: boolean;
  enabled: boolean;
  minDiscount: number;
  check: { checked_at: string | null; success_at: string | null; error: string | null } | null;
  promotions: Promotion[];
};
