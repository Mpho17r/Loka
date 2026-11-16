import React, { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChipRow, Empty, ListFooter, ListingCard, Screen, SearchBar } from '../components/ui';
import { CITIES, PRODUCT_CATEGORIES, VIEWER_CITY } from '../data/sample';
import { SponsoredSlot } from '../components/SponsoredSlot';
import { ALL_CITIES, formatZAR } from '../lib/pricing';
import { useApp } from '../store/AppState';
import { usePagedSearch } from '../lib/usePagedSearch';
import type { Product } from '../types';
import type { RootStackParamList } from '../navigation/types';

const PAGE_SIZE = 20;
const GAP = 12;

export default function MarketScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, cacheListings, favourites, toggleFavourite } = useApp();
  const { width } = useWindowDimensions();
  const cardW = (width - 32 - GAP) / 2;
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
      <SearchBar value={q} onChangeText={setQ} placeholder="Search products" />
      <ChipRow options={PRODUCT_CATEGORIES} value={category} onChange={setCategory} />
      <ChipRow options={[ALL_CITIES, ...CITIES]} value={city} onChange={setCity} />

      <SponsoredSlot placement={category === 'All' ? 'search' : 'category'} city={viewerCity} targetType="product" />

      {!loading && !error && results.length === 0 ? (
        <Empty title="Nothing found" body="Try a different search, category or city." />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {results.map((p) => (
            <ListingCard
              key={p.id} width={cardW} emoji={p.emoji} title={p.title} subtitle={`${p.condition} · ${p.city}`} price={formatZAR(p.price)}
              saved={favourites.includes(p.id)} onToggleSaved={() => toggleFavourite(p.id)}
              onPress={() => nav.navigate('ProductDetail', { id: p.id })}
            />
          ))}
        </View>
      )}
      <ListFooter loading={loading} loadingMore={loadingMore} hasMore={hasMore} error={error} onMore={loadMore} onRetry={retry} />
    </Screen>
  );
}
