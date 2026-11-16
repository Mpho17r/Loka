import { AdMedia } from './media';
import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card, Muted, SponsoredTag } from './ui';
import { colors } from '../theme';
import { useApp } from '../store/AppState';
import type { Ad, Placement } from '../types';
import type { RootStackParamList } from '../navigation/types';

/**
 * A clearly labelled paid slot. It asks the server for an eligible advert (targeting, pacing and frequency cap are
 * applied there), counts one impression after it has been on screen for a second, and counts a click on tap.
 * It never reorders the organic results around it.
 */
export function SponsoredSlot({ placement, city, targetType }: { placement: Placement; city: string; targetType?: 'product' | 'service' }) {
  const { api } = useApp();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [ad, setAd] = useState<Ad | null>(null);
  const counted = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getAds(placement, city).then((ads) => {
      if (cancelled) return;
      const pick = ads.find((a) => !targetType || a.targetType === targetType) ?? null;
      setAd(pick);
    }).catch(() => { if (!cancelled) setAd(null); });
    return () => { cancelled = true; };
  }, [api, placement, city, targetType]);

  useEffect(() => {
    if (!ad || counted.current === ad.campaignId) return;
    const t = setTimeout(() => {
      counted.current = ad.campaignId;
      api.recordImpression(ad.campaignId).catch(() => undefined);
    }, 1000);
    return () => clearTimeout(t);
  }, [api, ad]);

  if (!ad) return null;
  const subtitle = ad.description || undefined;

  const open = () => {
    api.recordClick(ad.campaignId).catch(() => undefined);
    if (ad.targetType === 'product') nav.navigate('ProductDetail', { id: ad.targetId });
    else nav.navigate('ServiceDetail', { id: ad.targetId });
  };

  return (
    <Card style={{ backgroundColor: colors.sponsoredBg, borderWidth: 1.5, borderColor: colors.accent }} onPress={open}>
      <SponsoredTag />
      <AdMedia path={ad.mediaPath} format={ad.format} height={150} feed />
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: 6 }}>{ad.headline}</Text>
      {subtitle ? <Muted>{subtitle}</Muted> : null}
    </Card>
  );
}
