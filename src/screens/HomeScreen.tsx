import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Card, H1, H2, Muted, Screen } from '../components/ui';
import { SponsoredSlot } from '../components/SponsoredSlot';
import { colors } from '../theme';
import { useApp } from '../store/AppState';
import { VIEWER_CITY } from '../data/sample';
import type { TabParamList } from '../navigation/types';

export default function HomeScreen() {
  const nav = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const { mode } = useApp();

  return (
    <Screen>
      <H1>Loka</H1>
      <Muted style={{ marginBottom: 16 }}>Discover. Connect. Get it done.</Muted>

      <SponsoredSlot placement="homepage" city={VIEWER_CITY} />

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
        <Muted>
          {mode === 'demo' ? 'Demo mode: sample data, nothing is saved. ' : ''}
          Payments are arranged directly between buyer and seller or provider.
        </Muted>
      </View>
    </Screen>
  );
}
