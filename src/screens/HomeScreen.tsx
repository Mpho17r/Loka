import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Backdrop, IconTile, ListingCard, Muted, RoundIconButton, SearchBar, SectionHeader, TAB_SPACE } from '../components/ui';
import { SponsoredSlot } from '../components/SponsoredSlot';
import { colors, radius, shadow } from '../theme';
import { useApp } from '../store/AppState';
import { VIEWER_CITY } from '../data/sample';
import { formatZAR } from '../lib/pricing';
import { priceLabel } from './ServicesScreen';
import type { RootStackParamList } from '../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const SLIDES: { title: string; sub: string; cta: string; emoji: string; tab: 'Market' | 'Services' | 'Promote' }[] = [
  { title: 'Buy better.\nSell faster.', sub: 'New and second-hand products near you', cta: 'Shop now', emoji: '🛍️', tab: 'Market' },
  { title: 'Get it done.\nBy people you trust.', sub: 'Find a professional and ask for a quotation', cta: 'Find a pro', emoji: '🧰', tab: 'Services' },
  { title: 'Be seen.\nGrow your business.', sub: 'Advertise to customers in your area', cta: 'Promote', emoji: '📣', tab: 'Promote' },
];

const CATEGORY_ICONS: Record<string, IconName> = {
  Electronics: 'phone-portrait-outline', Home: 'home-outline', Fashion: 'shirt-outline', 'Food & Farm': 'leaf-outline', Tools: 'hammer-outline',
};

export default function HomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, mode, profile, products, services, favourites, toggleFavourite, cacheListings } = useApp();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [slide, setSlide] = useState(0);
  const [category, setCategory] = useState('Popular');
  const slideW = width - 32;

  // Saved items that are not in the cache yet (older listings) are fetched one by one.
  useEffect(() => {
    const missing = favourites.filter((id) => !products.some((p) => p.id === id) && !services.some((s) => s.id === id)).slice(0, 12);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map(async (id) => (await api.getProduct(id).catch(() => null)) ?? (await api.getService(id).catch(() => null)))).then((found) => {
      if (cancelled) return;
      const ps = found.filter((x): x is NonNullable<typeof x> => !!x && 'price' in x) as typeof products;
      const ss = found.filter((x): x is NonNullable<typeof x> => !!x && !('price' in x)) as typeof services;
      if (ps.length || ss.length) cacheListings(ps, ss);
    });
    return () => { cancelled = true; };
  }, [api, favourites, products, services, cacheListings]);

  const categories = useMemo(() => ['Popular', ...Array.from(new Set(products.map((p) => p.category))).slice(0, 6)], [products]);
  const picks = useMemo(() => (category === 'Popular' ? products : products.filter((p) => p.category === category)).slice(0, 12), [products, category]);
  const saved = useMemo(() => [
    ...products.filter((p) => favourites.includes(p.id)).map((p) => ({ kind: 'product' as const, p })),
    ...services.filter((s) => favourites.includes(s.id)).map((s) => ({ kind: 'service' as const, s })),
  ], [products, services, favourites]);

  const first = profile?.fullName?.split(' ')[0];
  const goTab = (t: 'Market' | 'Services' | 'Promote') => nav.navigate('Tabs', { screen: t } as never);

  return (
    <Backdrop>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: TAB_SPACE }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>{first ? `Hello, ${first}` : 'Loka'}</Text>
            <Muted>Discover. Connect. Get it done.</Muted>
          </View>
          <RoundIconButton name="chatbubble-ellipses-outline" label="Messages" onPress={() => nav.navigate('Inbox')} />
        </View>

        <SearchBar placeholder="Search products and services" onPress={() => goTab('Market')} />

        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} snapToInterval={slideW + 12} decelerationRate="fast"
          onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / (slideW + 12)))} contentContainerStyle={{ gap: 12 }}>
          {SLIDES.map((sl) => (
            <LinearGradient key={sl.title} colors={['#0B4A38', '#2E9A72']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[{ width: slideW, height: 176, borderRadius: radius.lg + 2, padding: 20, overflow: 'hidden' }, shadow]}>
              <View style={{ position: 'absolute', right: -30, top: -30, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.10)' }} />
              <View style={{ position: 'absolute', right: 20, bottom: 6 }}><Text style={{ fontSize: 84 }}>{sl.emoji}</Text></View>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', lineHeight: 29 }}>{sl.title}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.88)', marginTop: 6, maxWidth: '58%' }}>{sl.sub}</Text>
              <Pressable onPress={() => goTab(sl.tab)} accessibilityRole="button" accessibilityLabel={sl.cta}
                style={{ position: 'absolute', left: 20, bottom: 18, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 }}>
                <Text style={{ fontWeight: '800', color: colors.ink }}>{sl.cta}</Text>
              </Pressable>
            </LinearGradient>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: -26, marginBottom: 22 }}>
          {SLIDES.map((_, i) => <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === slide ? '#fff' : 'rgba(255,255,255,0.5)' }} />)}
        </View>

        <SponsoredSlot placement="homepage" city={VIEWER_CITY} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 4 }}>
          {categories.map((c) => (
            <IconTile key={c} label={c === 'Food & Farm' ? 'Food' : c} icon={c === 'Popular' ? 'flash' : CATEGORY_ICONS[c] ?? 'pricetag-outline'}
              selected={c === category} onPress={() => setCategory(c)} />
          ))}
        </ScrollView>

        <SectionHeader title="Top picks" action="View all" onAction={() => goTab('Market')} />
        {picks.length === 0 ? <Muted>Nothing here yet.</Muted> : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 12, paddingRight: 16 }} style={{ marginHorizontal: -16, paddingLeft: 16 }}>
            {picks.map((p) => (
              <ListingCard key={p.id} width={176} emoji={p.emoji} title={p.title} subtitle={`${p.category} · ${p.city}`} price={formatZAR(p.price)}
                saved={favourites.includes(p.id)} onToggleSaved={() => toggleFavourite(p.id)} onPress={() => nav.navigate('ProductDetail', { id: p.id })} />
            ))}
          </ScrollView>
        )}

        <SectionHeader title="Trusted services" action="View all" onAction={() => goTab('Services')} />
        {services.length === 0 ? <Muted>Nothing here yet.</Muted> : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 12, paddingRight: 16 }} style={{ marginHorizontal: -16, paddingLeft: 16 }}>
            {services.slice(0, 12).map((s) => (
              <ListingCard key={s.id} width={176} emoji={s.emoji} title={s.title} subtitle={`${s.provider} · ${s.city}`} price={priceLabel(s)}
                saved={favourites.includes(s.id)} onToggleSaved={() => toggleFavourite(s.id)} onPress={() => nav.navigate('ServiceDetail', { id: s.id })} />
            ))}
          </ScrollView>
        )}

        {saved.length > 0 ? (
          <>
            <SectionHeader title="Saved" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 12, paddingRight: 16 }} style={{ marginHorizontal: -16, paddingLeft: 16 }}>
              {saved.map((x) => x.kind === 'product' ? (
                <ListingCard key={x.p.id} width={176} emoji={x.p.emoji} title={x.p.title} subtitle={`${x.p.category} · ${x.p.city}`} price={formatZAR(x.p.price)}
                  saved onToggleSaved={() => toggleFavourite(x.p.id)} onPress={() => nav.navigate('ProductDetail', { id: x.p.id })} />
              ) : (
                <ListingCard key={x.s.id} width={176} emoji={x.s.emoji} title={x.s.title} subtitle={`${x.s.provider} · ${x.s.city}`} price={priceLabel(x.s)}
                  saved onToggleSaved={() => toggleFavourite(x.s.id)} onPress={() => nav.navigate('ServiceDetail', { id: x.s.id })} />
              ))}
            </ScrollView>
          </>
        ) : null}

        <Muted style={{ marginTop: 8 }}>
          {mode === 'demo' ? 'Demo mode: sample data, nothing is saved. ' : ''}
          Payments are arranged directly between buyer and seller or provider.
        </Muted>
      </ScrollView>
    </Backdrop>
  );
}
