import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Empty, H2, Muted, ProgressBar, Row, Screen, StatusPill } from '../components/ui';
import { colors } from '../theme';
import { PLACEMENTS, VAT_RATE, formatZAR } from '../lib/pricing';
import { useApp } from '../store/AppState';
import type { CampaignStatus } from '../types';
import type { RootStackParamList } from '../navigation/types';

export function statusTone(s: CampaignStatus): 'neutral' | 'good' | 'warn' | 'bad' {
  if (s === 'Live' || s === 'Completed' || s === 'Scheduled') return 'good';
  if (s === 'Rejected' || s === 'Cancelled' || s === 'Terminated') return 'bad';
  if (s === 'Pending review' || s === 'Approved, awaiting payment' || s === 'Paused') return 'warn';
  return 'neutral';
}

export default function CampaignDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'CampaignDetail'>>();
  const { campaigns, setCampaignStatus } = useApp();
  const c = campaigns.find((x) => x.id === params.id);

  if (!c) return <Screen><Empty title="Campaign not found" body="It may have been removed." /></Screen>;

  const placement = PLACEMENTS.find((p) => p.id === c.placement)?.label ?? c.placement;
  const ctr = c.delivered > 0 ? (c.clicks / c.delivered) * 100 : 0;
  const remaining = Math.max(0, c.impressions - c.delivered);
  const spend = Math.round((c.delivered / 1000) * c.quote.cpm * c.quote.geoMultiplier * 100) / 100;
  const canAdvertiserCancel = c.status === 'Pending review' || c.status === 'Approved, awaiting payment' || c.status === 'Scheduled';

  return (
    <Screen>
      <H2>{c.headline}</H2>
      <Muted style={{ marginBottom: 8 }}>{c.targetTitle} · {placement} · {c.city} · {c.days} days</Muted>
      <View style={{ marginBottom: 16 }}>
        <StatusPill label={c.status} tone={statusTone(c.status)} />
      </View>

      <H2>Performance</H2>
      <Card>
        <Row label="Impressions" value={`${c.delivered.toLocaleString('en-ZA')} of ${c.impressions.toLocaleString('en-ZA')}`} />
        <ProgressBar value={c.impressions ? c.delivered / c.impressions : 0} />
        <Row label="Remaining delivery" value={remaining.toLocaleString('en-ZA')} />
        <Row label="Clicks" value={c.clicks.toLocaleString('en-ZA')} />
        <Row label="Click-through rate" value={`${ctr.toFixed(2)}%`} />
        <Row label="Spend so far (before VAT)" value={formatZAR(spend)} />
      </Card>
      {c.status === 'Live' || c.status === 'Completed' ? null : (
        <Muted style={{ marginBottom: 12 }}>Figures appear once the campaign is live. Impressions are counted only when valid.</Muted>
      )}

      <H2>Invoice</H2>
      <Card>
        <Row label="Impressions at list price" value={formatZAR(c.quote.gross)} />
        {c.quote.premiumDiscount > 0 ? <Row label="Premium discount" value={`−${formatZAR(c.quote.premiumDiscount)}`} negative /> : null}
        {c.quote.creditApplied > 0 ? <Row label="Advertising credit" value={`−${formatZAR(c.quote.creditApplied)}`} negative /> : null}
        <Row label="Before VAT" value={formatZAR(c.quote.net)} />
        <Row label={`VAT (${Math.round(VAT_RATE * 100)}%)`} value={formatZAR(c.quote.vat)} />
        <Row label="Total" value={formatZAR(c.quote.total)} bold />
      </Card>

      {canAdvertiserCancel ? (
        <Button label="Cancel campaign" variant="danger" onPress={() => { setCampaignStatus(c.id, 'Cancelled'); nav.goBack(); }} style={{ marginBottom: 10 }} />
      ) : null}
      {c.status === 'Live' ? (
        <Button label="Pause campaign" variant="secondary" onPress={() => setCampaignStatus(c.id, 'Paused')} style={{ marginBottom: 10 }} />
      ) : null}
      {c.status === 'Paused' ? (
        <Button label="Resume campaign" variant="secondary" onPress={() => setCampaignStatus(c.id, 'Live')} style={{ marginBottom: 10 }} />
      ) : null}

      {/* DEMO ONLY: in the real product these actions happen in the Saccharum HQ control centre, not in the advertiser app. */}
      <Card style={{ borderStyle: 'dashed', marginTop: 8 }}>
        <Text style={{ fontWeight: '700', color: colors.ink, marginBottom: 4 }}>Demo: Saccharum HQ actions</Text>
        <Muted style={{ marginBottom: 10 }}>
          Normally done by HQ staff: approve content, verify payment, then publish. Use these to see sponsored adverts appear in Home, Market and Services.
        </Muted>
        {c.status === 'Pending review' ? (
          <View style={{ gap: 8 }}>
            <Button label="HQ: approve content" onPress={() => setCampaignStatus(c.id, 'Approved, awaiting payment')} />
            <Button label="HQ: reject" variant="danger" onPress={() => setCampaignStatus(c.id, 'Rejected')} />
          </View>
        ) : null}
        {c.status === 'Approved, awaiting payment' ? (
          <Button label="HQ: mark payment verified" onPress={() => setCampaignStatus(c.id, 'Scheduled')} />
        ) : null}
        {c.status === 'Scheduled' ? <Button label="Start delivery now" onPress={() => setCampaignStatus(c.id, 'Live')} /> : null}
        {c.status === 'Live' ? (
          <Button label="HQ: terminate for policy breach" variant="danger" onPress={() => setCampaignStatus(c.id, 'Terminated')} />
        ) : null}
      </Card>
    </Screen>
  );
}
