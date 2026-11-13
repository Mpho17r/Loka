import React, { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card, ChipRow, Empty, H2, Muted, Screen, SponsoredTag, StatusPill, VerifiedBadge } from '../components/ui';
import { colors } from '../theme';
import { CITIES, SERVICES, SERVICE_CATEGORIES } from '../data/sample';
import { ALL_CITIES, formatZAR } from '../lib/pricing';
import { useApp } from '../store/AppState';
import { liveAds } from '../lib/ads';
import type { Service } from '../types';
import type { RootStackParamList } from '../navigation/types';

export function priceLabel(s: Service): string {
  if (s.pricingModel === 'Quotation') return 'Quotation';
  if (s.pricingModel === 'Free consultation') return 'Free consultation';
  const suffix = s.pricingModel === 'Hourly' ? '/hour' : '';
  return `From ${formatZAR(s.fromPrice ?? 0)}${suffix}`;
}

export default function ServicesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { campaigns, requests } = useApp();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');
  const [city, setCity] = useState(ALL_CITIES);

  const results = useMemo(
    () =>
      SERVICES.filter(
        (s) =>
          (category === 'All' || s.category === category) &&
          (city === ALL_CITIES || s.city === city || s.delivery !== 'On-site') &&
          (q.trim() === '' || (s.title + s.provider + s.description).toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [q, category, city],
  );

  const viewerCity = city === ALL_CITIES ? 'Thohoyandou' : city;
  const sponsored = liveAds(campaigns, category === 'All' ? ['search'] : ['search', 'category'], viewerCity).filter(
    (c) => c.targetType === 'service',
  )[0];
  const sponsoredService = sponsored ? SERVICES.find((s) => s.id === sponsored.targetId) : undefined;

  const activeRequests = requests.filter((r) => r.status !== 'Cancelled');

  return (
    <Screen>
      {activeRequests.length > 0 ? (
        <View style={{ marginBottom: 8 }}>
          <H2>My requests</H2>
          {activeRequests.map((r) => (
            <Card key={r.id}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{r.serviceTitle}</Text>
              <Muted>{r.city} · preferred {r.preferredDate}</Muted>
              <View style={{ marginTop: 6 }}>
                <StatusPill label={r.status} tone="warn" />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search services"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Search services"
        style={{
          backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 10,
          paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, marginBottom: 12, color: colors.ink,
        }}
      />
      <ChipRow options={SERVICE_CATEGORIES} value={category} onChange={setCategory} />
      <ChipRow options={[ALL_CITIES, ...CITIES]} value={city} onChange={setCity} />

      {sponsored && sponsoredService ? (
        <Card
          style={{ backgroundColor: colors.sponsoredBg, borderColor: colors.accent }}
          onPress={() => nav.navigate('ServiceDetail', { id: sponsoredService.id })}
        >
          <SponsoredTag />
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: 6 }}>{sponsored.headline}</Text>
          <Muted>{sponsoredService.title} · {sponsoredService.provider}</Muted>
        </Card>
      ) : null}

      {results.length === 0 ? (
        <Empty title="No providers found" body="Try another category or city." />
      ) : (
        results.map((s) => (
          <Card key={s.id} onPress={() => nav.navigate('ServiceDetail', { id: s.id })}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Text style={{ fontSize: 36 }}>{s.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{s.title}</Text>
                <Muted>{s.provider} · {s.city} · {s.delivery}</Muted>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary, marginVertical: 3 }}>
                  {priceLabel(s)} · ★ {s.rating.toFixed(1)} ({s.jobs})
                </Text>
                <VerifiedBadge level={s.verification} />
              </View>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
