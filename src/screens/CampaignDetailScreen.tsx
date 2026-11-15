import { AdMedia, ImagePickerField, ScanBadge } from '../components/media';
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Button, Card, Empty, Field, H2, Muted, ProgressBar, Row, Screen, StatusPill } from '../components/ui';
import { colors } from '../theme';
import { PLACEMENTS, formatZAR } from '../lib/pricing';
import { useApp } from '../store/AppState';
import type { CampaignStatus, PickedImage } from '../types';
import type { RootStackParamList } from '../navigation/types';

export function statusTone(s: CampaignStatus): 'neutral' | 'good' | 'warn' | 'bad' {
  if (s === 'Live' || s === 'Completed' || s === 'Scheduled') return 'good';
  if (s === 'Rejected' || s === 'Cancelled' || s === 'Terminated') return 'bad';
  if (s === 'Pending review' || s === 'Approved, awaiting payment' || s === 'Paused' || s === 'Changes requested') return 'warn';
  return 'neutral';
}

const STATUS_HELP: Partial<Record<CampaignStatus, string>> = {
  'Pending review': 'Saccharum is checking your advert against the advertising policy.',
  'Changes requested': 'Saccharum asked for a change. Check the reason with Saccharum support, then create a new campaign with the fix.',
  'Approved, awaiting payment': 'Your advert is approved. Pay the invoice below; it goes live once Saccharum verifies the payment.',
  Scheduled: 'Approved and paid. It starts on its start date.',
  Rejected: 'This advert breaks the advertising policy. Any credit you used has been returned.',
  Terminated: 'This campaign was stopped by Saccharum.',
};

export default function CampaignDetailScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'CampaignDetail'>>();
  const { api, campaigns, run } = useApp();
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<PickedImage | undefined>(undefined);
  const c = campaigns.find((x) => x.id === params.id);

  if (!c) return <Screen><Empty title="Campaign not found" body="It may have been removed." /></Screen>;

  const placement = PLACEMENTS.find((p) => p.id === c.placement)?.label ?? c.placement;
  const ctr = c.delivered > 0 ? (c.clicks / c.delivered) * 100 : 0;
  const remaining = Math.max(0, c.impressions - c.delivered);
  const spend = Math.round((c.quote.gross - c.quote.premiumDiscount) * (c.delivered / c.impressions) * 100) / 100;
  const cancellable = ['Pending review', 'Changes requested', 'Approved, awaiting payment', 'Scheduled', 'Live', 'Paused'].includes(c.status);

  const act = async (fn: () => Promise<unknown>) => {
    const err = await run(fn);
    if (err) Alert.alert('Could not do that', err);
  };

  return (
    <Screen>
      <H2>{c.headline}</H2>
      <Muted style={{ marginBottom: 8 }}>{c.targetTitle} · {placement} · {c.city} · {c.startDate} to {c.endDate}</Muted>
      <View style={{ marginBottom: 8 }}><StatusPill label={c.status} tone={statusTone(c.status)} /></View>
      {STATUS_HELP[c.status] ? <Muted style={{ marginBottom: 12 }}>{STATUS_HELP[c.status]}</Muted> : null}

      <AdMedia path={c.mediaPath} format={c.format} height={180} />
      {c.scan && c.scan.status !== 'passed' ? <ScanBadge scan={c.scan} /> : null}
      {c.scan?.status === 'flagged' ? <Muted>Our automatic check flagged your file. Saccharum will look at it before deciding. You may be asked for a different one.</Muted> : null}
      <H2>Performance</H2>
      <Card>
        <Row label="Impressions" value={`${c.delivered.toLocaleString('en-ZA')} of ${c.impressions.toLocaleString('en-ZA')}`} />
        <ProgressBar value={c.impressions ? c.delivered / c.impressions : 0} />
        <Row label="Remaining delivery" value={remaining.toLocaleString('en-ZA')} />
        <Row label="Clicks" value={c.clicks.toLocaleString('en-ZA')} />
        <Row label="Click-through rate" value={`${ctr.toFixed(2)}%`} />
        <Row label="Spend so far (before tax)" value={formatZAR(spend)} />
      </Card>
      <Muted style={{ marginBottom: 12 }}>Only valid impressions are counted and billed. Figures can lag by a few minutes.</Muted>

      <H2>Invoice {c.invoice.number}</H2>
      <Card>
        <Row label="Impressions at list price" value={formatZAR(c.quote.gross)} />
        {c.quote.premiumDiscount > 0 ? <Row label="Premium discount" value={`−${formatZAR(c.quote.premiumDiscount)}`} negative /> : null}
        {c.quote.creditApplied > 0 ? <Row label="Advertising credit" value={`−${formatZAR(c.quote.creditApplied)}`} negative /> : null}
        {c.quote.managementFee > 0 ? <Row label="Management fee" value={formatZAR(c.quote.managementFee)} /> : null}
        <Row label="Before tax" value={formatZAR(c.quote.net)} />
        <Row label={`${c.quote.taxName} (${Math.round(c.quote.taxRate * 100)}%)`} value={formatZAR(c.quote.vat)} />
        <Row label="Total" value={formatZAR(c.quote.total)} bold />
        <View style={{ marginTop: 6 }}>
          <StatusPill
            label={c.invoice.status === 'verified' ? 'Payment verified' : c.invoice.status === 'paid_declared' ? 'Payment declared, awaiting verification' : c.invoice.status === 'issued' ? 'Awaiting payment' : c.invoice.status}
            tone={c.invoice.status === 'verified' ? 'good' : 'warn'}
          />
        </View>
      </Card>

      {c.invoice.status === 'issued' && cancellable ? (
        <Card>
          <Text style={{ fontWeight: '700', color: colors.ink, marginBottom: 4 }}>Pay this invoice</Text>
          <Muted style={{ marginBottom: 8 }}>
            Pay {formatZAR(c.invoice.total)} using reference {c.invoice.number}. Saccharum will give you the banking details. Then tell us you paid; the campaign only goes live after Saccharum verifies the payment.
          </Muted>
          <Field label="Your payment reference" value={reference} onChangeText={setReference} placeholder="e.g. EFT reference" />
          <ImagePickerField label="Proof of payment (optional)" value={proof} onChange={setProof} hint="A photo or screenshot of your bank confirmation helps Saccharum verify faster." />
          <Button label="I have paid" onPress={() => act(() => api.declarePayment(c.invoice.id, reference, proof))} disabled={reference.trim().length < 3} />
        </Card>
      ) : null}

      {c.status === 'Live' ? <Button label="Pause campaign" variant="secondary" onPress={() => act(() => api.campaignAction(c.id, 'pause'))} style={{ marginBottom: 10 }} /> : null}
      {c.status === 'Paused' && !c.pausedByHq ? <Button label="Resume campaign" variant="secondary" onPress={() => act(() => api.campaignAction(c.id, 'resume'))} style={{ marginBottom: 10 }} /> : null}
      {c.status === 'Paused' && c.pausedByHq ? <Muted style={{ marginBottom: 10 }}>Paused by Saccharum. Contact support to resume.</Muted> : null}
      {cancellable ? (
        <Button
          label="Cancel campaign"
          variant="danger"
          onPress={() => Alert.alert('Cancel this campaign?', 'Unused impressions are returned to you as advertising credit.', [
            { text: 'Keep it', style: 'cancel' },
            { text: 'Cancel campaign', style: 'destructive', onPress: () => act(() => api.campaignAction(c.id, 'cancel')) },
          ])}
        />
      ) : null}
    </Screen>
  );
}
