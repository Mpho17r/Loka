import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card, ChipRow, Empty, H2, ListFooter, Muted, Screen, SearchBar, StatusPill, VerifiedBadge } from '../components/ui';
import { usePagedSearch } from '../lib/usePagedSearch';
import { colors } from '../theme';
import { CITIES, SERVICE_CATEGORIES, VIEWER_CITY } from '../data/sample';
import { SponsoredSlot } from '../components/SponsoredSlot';
import { ALL_CITIES, formatZAR } from '../lib/pricing';
import { useApp } from '../store/AppState';
import type { Service } from '../types';
import type { RootStackParamList } from '../navigation/types';

const PAGE_SIZE = 20;

export function priceLabel(s: Service): string {
  if (s.pricingModel === 'Quotation') return 'Quotation';
  if (s.pricingModel === 'Free consultation') return 'Free consultation';
  const suffix = s.pricingModel === 'Hourly' ? '/hour' : '';
  return `From ${formatZAR(s.fromPrice ?? 0)}${suffix}`;
}

export default function ServicesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, cacheListings, requests } = useApp();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');
  const [city, setCity] = useState(ALL_CITIES);

  const { items: results, loading, loadingMore, hasMore, error, loadMore, retry } = usePagedSearch<Service>(
    (offset) => api.searchServices({ q, category, city, offset, limit: PAGE_SIZE }),
    `${q.trim()}|${category}|${city}`,
  );
  useEffect(() => { cacheListings(undefined, results); }, [results, cacheListings]);


  const viewerCity = city === ALL_CITIES ? VIEWER_CITY : city;

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

      <SearchBar value={q} onChangeText={setQ} placeholder="Search services" />
      <ChipRow options={SERVICE_CATEGORIES} value={category} onChange={setCategory} />
      <ChipRow options={[ALL_CITIES, ...CITIES]} value={city} onChange={setCity} />

      <SponsoredSlot placement={category === 'All' ? 'search' : 'category'} city={viewerCity} targetType="service" />

      {!loading && !error && results.length === 0 ? (
        <Empty title="No providers found" body="Try another category or city." />
      ) : (
        results.map((s) => (
          <Card key={s.id} onPress={() => nav.navigate('ServiceDetail', { id: s.id })}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 34 }}>{s.emoji}</Text></View>
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
      <ListFooter loading={loading} loadingMore={loadingMore} hasMore={hasMore} error={error} onMore={loadMore} onRetry={retry} />
    </Screen>
  );
}
