import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, ChipRow, Empty, Field, H2, Muted, Row, Screen } from '../components/ui';
import { colors } from '../theme';
import { CITIES } from '../data/sample';
import {
  ALL_CITIES, IMPRESSION_STEP, MIN_IMPRESSIONS, PLACEMENTS, estimateDailyReach, formatZAR,
} from '../lib/pricing';
import { friendlyError } from '../lib/errors';
import { useApp } from '../store/AppState';
import type { Placement, Quote } from '../types';
import type { RootStackParamList } from '../navigation/types';

const MAX_IMPRESSIONS = 200000;
const HEADLINE_MAX = 60;
const DURATIONS = ['7 days', '14 days', '30 days'];

export default function CampaignBuilderScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'CampaignBuilder'>>();
  const { api, mode, profile, myProducts, myServices, balance, refresh } = useApp();

  // Advertisers can promote only their own listings. Demo mode allows all sample listings.
  const listings = useMemo(() => {
    return [
      ...myProducts.map((p) => ({ key: `product:${p.id}`, type: 'product' as const, id: p.id, title: p.title })),
      ...myServices.map((s) => ({ key: `service:${s.id}`, type: 'service' as const, id: s.id, title: s.title })),
    ];
  }, [myProducts, myServices]);

  const initialKey = params?.targetType && params?.targetId ? `${params.targetType}:${params.targetId}` : listings[0]?.key ?? '';
  const [targetKey, setTargetKey] = useState(initialKey);
  const target = listings.find((l) => l.key === targetKey) ?? listings[0];

  const [headline, setHeadline] = useState(target ? target.title.slice(0, HEADLINE_MAX) : '');
  const [placement, setPlacement] = useState<Placement>('search');
  const [city, setCity] = useState('Thohoyandou');
  const [impressions, setImpressions] = useState(10000);
  const [duration, setDuration] = useState('14 days');
  const [useCredit, setUseCredit] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = parseInt(duration, 10);

  // The price always comes from api.quote: on a real backend that is the same server function that prices the invoice.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setQuoteError(null);
    api.quote({ placement, city, impressions, useCredit }, profile, balance)
      .then((q) => { if (!cancelled) setQuote(q); })
      .catch((e) => { if (!cancelled) { setQuote(null); setQuoteError(friendlyError(e)); } });
    return () => { cancelled = true; };
  }, [api, profile, placement, city, impressions, useCredit, balance]);

  if (!profile) {
    return <Screen><Empty title="Sign in to advertise" body="Open the Account tab, sign in, then come back to start a campaign." /></Screen>;
  }
  if (!target) {
    return (
      <Screen>
        <Empty title="Nothing to promote yet" body="Add a product or service from the Account tab first. You can only promote your own listings." />
      </Screen>
    );
  }

  const reach = estimateDailyReach(placement, city) * days;
  const underDelivery = impressions > reach;

  const changeTarget = (title: string) => {
    const next = listings.find((l) => l.title === title);
    if (!next) return;
    setTargetKey(next.key);
    setHeadline(next.title.slice(0, HEADLINE_MAX));
  };
  const step = (dir: 1 | -1) =>
    setImpressions((v) => Math.min(MAX_IMPRESSIONS, Math.max(MIN_IMPRESSIONS, v + dir * IMPRESSION_STEP * (v >= 20000 ? 5 : 1))));

  const valid = headline.trim().length >= 5 && headline.length <= HEADLINE_MAX && accepted && !!quote && !busy;

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const id = await api.createCampaign({
        targetType: target.type, targetId: target.id, targetTitle: target.title, headline: headline.trim(),
        placement, city, impressions, days, useCredit,
      }, profile, balance);
      await refresh();
      nav.replace('CampaignDetail', { id });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H2>1. What are you promoting?</H2>
      <ChipRow options={listings.map((l) => l.title)} value={target.title} onChange={changeTarget} />
      <Muted style={{ marginBottom: 16 }}>Your advert uses this listing's details, so there is nothing to upload again.</Muted>

      <Field
        label="Headline"
        value={headline}
        onChangeText={setHeadline}
        maxLength={HEADLINE_MAX}
        hint={`${headline.length}/${HEADLINE_MAX} characters. Show real prices and conditions; do not promise results you cannot deliver.`}
      />

      <H2>2. Where should it appear?</H2>
      {PLACEMENTS.map((p) => (
        <Pressable key={p.id} onPress={() => setPlacement(p.id)} accessibilityRole="radio" accessibilityState={{ selected: placement === p.id }}>
          <Card style={{ borderColor: placement === p.id ? colors.primary : colors.line, borderWidth: placement === p.id ? 2 : 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{p.label}</Text>
              {mode === 'demo' ? <Text style={{ color: colors.muted }}>{formatZAR(p.cpm)} per 1,000</Text> : null}
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
          : quote ? `Local advert for ${city}: ${Math.round((1 - quote.geoMultiplier) * 100)}% cheaper than national.` : `Local advert for ${city}.`}
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
            About {reach.toLocaleString('en-ZA')} impressions are available for this audience over {days} days (estimate).
            Delivery by the end date is not guaranteed; unused impressions are credited back.
          </Muted>
        </Card>
      ) : null}

      <H2>5. Price</H2>
      {quoteError ? (
        <Card style={{ borderColor: colors.danger }}><Text style={{ color: colors.danger }}>{quoteError}</Text></Card>
      ) : quote ? (
        <Card>
          <Row label={`${impressions.toLocaleString('en-ZA')} impressions at ${formatZAR(quote.cpm)} per 1,000`} value={formatZAR(quote.gross)} />
          {quote.geoMultiplier < 1 ? <Row label="Local targeting applied" value={`×${quote.geoMultiplier}`} /> : null}
          {quote.premiumDiscount > 0 ? <Row label="Premium member discount" value={`−${formatZAR(quote.premiumDiscount)}`} negative /> : null}
          {balance > 0 ? (
            <Pressable onPress={() => setUseCredit((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: useCredit }}>
              <Row
                label={`${useCredit ? '☑' : '☐'} Use advertising credit (${formatZAR(balance)} available)`}
                value={useCredit ? `−${formatZAR(quote.creditApplied)}` : 'Not used'}
                negative={useCredit}
              />
            </Pressable>
          ) : null}
          <Row label="Amount before tax" value={formatZAR(quote.net)} />
          <Row label={`${quote.taxName} (${Math.round(quote.taxRate * 100)}%)`} value={formatZAR(quote.vat)} />
          <Row label="Total payable" value={formatZAR(quote.total)} bold />
        </Card>
      ) : <Muted>Calculating price...</Muted>}
      <Muted style={{ marginBottom: 16 }}>
        After approval you receive an invoice. Saccharum HQ verifies your payment before the campaign goes live.
        {mode === 'demo' ? ' Demo mode uses test rates.' : ''}
      </Muted>

      <Pressable onPress={() => setAccepted((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 15, color: colors.ink }}>
          {accepted ? '☑' : '☐'} I accept the advertising terms: Loka may reject, pause or remove any advert, impressions are not guaranteed by a date, and I am responsible for the claims and images in my advert.
        </Text>
      </Pressable>

      {error ? <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text> : null}
      <Button label={busy ? 'Submitting...' : 'Submit for review'} onPress={submit} disabled={!valid} />
    </Screen>
  );
}
