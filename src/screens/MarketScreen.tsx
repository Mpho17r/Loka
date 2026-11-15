import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card, ChipRow, Empty, ListFooter, Muted, Screen, VerifiedBadge } from '../components/ui';
import { colors } from '../theme';
import { CITIES, PRODUCT_CATEGORIES, VIEWER_CITY } from '../data/sample';
import { SponsoredSlot } from '../components/SponsoredSlot';
import { ALL_CITIES, formatZAR } from '../lib/pricing';
import { useApp } from '../store/AppState';
import { usePagedSearch } from '../lib/usePagedSearch';
import type { Product } from '../types';
import type { RootStackParamList } from '../navigation/types';

const PAGE_SIZE = 20;

export default function MarketScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, cacheListings } = useApp();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');
  const [city, setCity] = useState(ALL_CITIES);

  const { items: results, loading, loadingMore, hasMore, error, loadMore, retry } = usePagedSearch<Product>(
    (offset) => api.searchProducts({ q, category, city, offset, limit: PAGE_SIZE }),
    `${q.trim()}|${category}|${city}`,
  );
  // remember what we have seen so detail screens and adverts open instantly
  useEffect(() => { cacheListings(results); }, [results, cacheListings]);

  // Sponsored cards sit in their own marked slot and never change the organic order.
  const viewerCity = city === ALL_CITIES ? VIEWER_CITY : city;

  return (
    <Screen>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search products"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Search products"
        style={{
          backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 10,
          paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, marginBottom: 12, color: colors.ink,
        }}
      />
      <ChipRow options={PRODUCT_CATEGORIES} value={category} onChange={setCategory} />
      <ChipRow options={[ALL_CITIES, ...CITIES]} value={city} onChange={setCity} />

      <SponsoredSlot placement={category === 'All' ? 'search' : 'category'} city={viewerCity} targetType="product" />

      {!loading && !error && results.length === 0 ? (
        <Empty title="Nothing found" body="Try a different search, category or city." />
      ) : (
        results.map((p) => (
          <Card key={p.id} onPress={() => nav.navigate('ProductDetail', { id: p.id })}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Text style={{ fontSize: 40 }}>{p.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{p.title}</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.primary, marginVertical: 2 }}>{formatZAR(p.price)}</Text>
                <Muted>{p.condition} · {p.city} · {p.seller}</Muted>
                <View style={{ marginTop: 6 }}>
                  <VerifiedBadge level={p.verification} />
                </View>
              </View>
            </View>
          </Card>
        ))
      )}
      <ListFooter loading={loading} loadingMore={loadingMore} hasMore={hasMore} error={error} onMore={loadMore} onRetry={retry} />
    </Screen>
  );
}
