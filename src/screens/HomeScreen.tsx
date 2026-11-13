import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Card, H1, H2, Muted, Screen, SponsoredTag } from '../components/ui';
import { colors } from '../theme';
import { useApp } from '../store/AppState';
import { liveAds } from '../lib/ads';
import { VIEWER_CITY } from '../data/sample';
import type { RootStackParamList, TabParamList } from '../navigation/types';

type Nav = BottomTabNavigationProp<TabParamList> & NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const { campaigns } = useApp();
  const banner = liveAds(campaigns, ['homepage'], VIEWER_CITY)[0];

  return (
    <Screen>
      <H1>Loka</H1>
      <Muted style={{ marginBottom: 16 }}>Discover. Connect. Get it done.</Muted>

      {banner ? (
        <Card
          style={{ backgroundColor: colors.sponsoredBg, borderColor: colors.accent }}
          onPress={() =>
            banner.targetType === 'product'
              ? nav.navigate('ProductDetail', { id: banner.targetId })
              : nav.navigate('ServiceDetail', { id: banner.targetId })
          }
        >
          <SponsoredTag />
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 8 }}>{banner.headline}</Text>
          <Muted>{banner.targetTitle}</Muted>
        </Card>
      ) : null}

      <H2>What do you need?</H2>
      <Card onPress={() => nav.navigate('Market')}>
        <Text style={{ fontSize: 28 }}>🛍️</Text>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 4 }}>Loka Market</Text>
        <Muted>Buy and sell new and second-hand products near you.</Muted>
      </Card>
      <Card onPress={() => nav.navigate('Services')}>
        <Text style={{ fontSize: 28 }}>🧰</Text>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 4 }}>Loka Services</Text>
        <Muted>Find trusted professionals and request a quotation.</Muted>
      </Card>
      <Card onPress={() => nav.navigate('Promote')}>
        <Text style={{ fontSize: 28 }}>📣</Text>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 4 }}>Loka Promote</Text>
        <Muted>Advertise your product or service to customers in your area.</Muted>
      </Card>

      <View style={{ marginTop: 8 }}>
        <Muted>Prototype with sample data. Payments are arranged directly between buyer and seller or provider.</Muted>
      </View>
    </Screen>
  );
}
