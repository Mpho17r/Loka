import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, ChipRow, Field, H2, Muted, Row, Screen } from '../components/ui';
import { colors } from '../theme';
import { CITIES, PRODUCTS, SERVICES } from '../data/sample';
import {
  ALL_CITIES, IMPRESSION_STEP, MIN_IMPRESSIONS, PLACEMENTS, VAT_RATE, calculateQuote, estimateDailyReach, formatZAR,
} from '../lib/pricing';
import { useApp } from '../store/AppState';
import type { Placement } from '../types';
import type { RootStackParamList } from '../navigation/types';

const MAX_IMPRESSIONS = 200000;
const HEADLINE_MAX = 60;
const DURATIONS = ['7 days', '14 days', '30 days'];

export default function CampaignBuilderScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'CampaignBuilder'>>();
  const { isPremium, creditBalance, submitCampaign } = useApp();

  const listings = useMemo(
    () => [
      ...PRODUCTS.map((p) => ({ key: `product:${p.id}`, type: 'product' as const, id: p.id, title: p.title })),
      ...SERVICES.map((s) => ({ key: `service:${s.id}`, type: 'service' as const, id: s.id, title: s.title })),
    ],
    [],
  );

  const initialKey = params?.targetType && params?.targetId ? `${params.targetType}:${params.targetId}` : listings[0].key;
  const [targetKey, setTargetKey] = useState(initialKey);
  const target = listings.find((l) => l.key === targetKey) ?? listings[0];

  const [headline, setHeadline] = useState(target.title.slice(0, HEADLINE_MAX));
  const [placement, setPlacement] = useState<Placement>('search');
  const [city, setCity] = useState('Thohoyandou');
  const [impressions, setImpressions] = useState(10000);
  const [duration, setDuration] = useState('14 days');
  const [useCredit, setUseCredit] = useState(true);
  const [accepted, setAccepted] = useState(false);

  const days = parseInt(duration, 10);
  const quote = calculateQuote({
    placement, city, impressions, isPremium, creditBalance: useCredit ? creditBalance : 0,
  });
  const reachPerCampaign = estimateDailyReach(placement, city) * days;
  const underDelivery = impressions > reachPerCampaign;

  const changeTarget = (title: string) => {
    const next = listings.find((l) => l.title === title);
    if (!next) return;
    setTargetKey(next.key);
    setHeadline(next.title.slice(0, HEADLINE_MAX));
  };

  const step = (dir: 1 | -1) =>
    setImpressions((v) => Math.min(MAX_IMPRESSIONS, Math.max(MIN_IMPRESSIONS, v + dir * IMPRESSION_STEP * (v >= 20000 ? 5 : 1))));

  const headlineOk = headline.trim().length >= 5 && headline.length <= HEADLINE_MAX;
  const valid = headlineOk && accepted;

  const submit = () => {
    const c = submitCampaign({
      targetType: target.type,
      targetId: target.id,
      targetTitle: target.title,
      headline: headline.trim(),
      placement,
      city,
      impressions,
      days,
      quote,
    });
    nav.replace('CampaignDetail', { id: c.id });
  };

  return (
    <Screen>
      <H2>1. What are you promoting?</H2>
      <ChipRow options={listings.map((l) => l.title)} value={target.title} onChange={changeTarget} />
      <Muted style={{ marginBottom: 16 }}>
        Your advert uses this listing's photos and details, so there is nothing to upload again.
      </Muted>

      <Field
        label="Headline"
        value={headline}
        onChangeText={setHeadline}
        maxLength={HEADLINE_MAX}
        hint={`${headline.length}/${HEADLINE_MAX} characters. Show real prices and conditions; do not promise results you cannot deliver.`}
      />

      <H2>2. Where should it appear?</H2>
      {PLACEMENTS.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => setPlacement(p.id)}
          accessibilityRole="radio"
          accessibilityState={{ selected: placement === p.id }}
        >
          <Card style={{ borderColor: placement === p.id ? colors.primary : colors.line, borderWidth: placement === p.id ? 2 : 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{p.label}</Text>
              <Text style={{ color: colors.muted }}>{formatZAR(p.cpm)} per 1,000</Text>
            </View>
            <Muted>{p.note}</Muted>
          </Card>
        </Pressable>
      ))}

      <H2>3. Who should see it?</H2>
      <ChipRow options={[ALL_CITIES, ...CITIES]} value={city} onChange={setCity} />
      <Muted style={{ marginBottom: 16 }}>
        {city === ALL_CITIES
          ? 'National exposure: full price.'
          : `Local advert for ${city}: ${Math.round((1 - quote.geoMultiplier) * 100)}% cheaper than national.`}
      </Muted>

      <H2>4. Impressions and duration</H2>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Button label="−" variant="secondary" onPress={() => step(-1)} disabled={impressions <= MIN_IMPRESSIONS} style={{ width: 64 }} />
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink }}>{impressions.toLocaleString('en-ZA')}</Text>
        <Button label="+" variant="secondary" onPress={() => step(1)} disabled={impressions >= MAX_IMPRESSIONS} style={{ width: 64 }} />
      </View>
      <ChipRow options={DURATIONS} value={duration} onChange={setDuration} />
      {underDelivery ? (
        <Card style={{ backgroundColor: '#FBEFD5', borderColor: colors.warn }}>
          <Text style={{ color: colors.warn, fontWeight: '700' }}>Delivery may fall short</Text>
          <Muted>
            About {reachPerCampaign.toLocaleString('en-ZA')} impressions are available for this audience over {days} days.
            Delivery by the end date is not guaranteed; unused impressions are credited back.
          </Muted>
        </Card>
      ) : null}

      <H2>5. Price</H2>
      <Card>
        <Row label={`${impressions.toLocaleString('en-ZA')} impressions at ${formatZAR(quote.cpm)} per 1,000`} value={formatZAR(quote.gross)} />
        {quote.geoMultiplier < 1 ? <Row label="Local targeting applied" value={`×${quote.geoMultiplier}`} /> : null}
        {isPremium ? <Row label="Premium member discount (10%)" value={`−${formatZAR(quote.premiumDiscount)}`} negative /> : null}
        {creditBalance > 0 ? (
          <Pressable onPress={() => setUseCredit((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: useCredit }}>
            <Row
              label={`${useCredit ? '☑' : '☐'} Use advertising credit (${formatZAR(creditBalance)} available)`}
              value={useCredit ? `−${formatZAR(quote.creditApplied)}` : 'Not used'}
              negative={useCredit}
            />
          </Pressable>
        ) : null}
        <Row label="Amount before VAT" value={formatZAR(quote.net)} />
        <Row label={`VAT (${Math.round(VAT_RATE * 100)}%)`} value={formatZAR(quote.vat)} />
        <Row label="Total payable" value={formatZAR(quote.total)} bold />
      </Card>
      <Muted style={{ marginBottom: 16 }}>
        Test rates for this prototype. After approval you will receive an invoice; Saccharum HQ verifies your payment before the campaign goes live.
      </Muted>

      <Pressable onPress={() => setAccepted((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 15, color: colors.ink }}>
          {accepted ? '☑' : '☐'} I accept the advertising terms: Loka may reject, pause or remove any advert, impressions are not guaranteed by a date, and I am responsible for the claims and images in my advert.
        </Text>
      </Pressable>

      <Button label="Submit for review" onPress={submit} disabled={!valid} />
    </Screen>
  );
}
