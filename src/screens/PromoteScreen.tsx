import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Empty, H2, Muted, ProgressBar, Screen, StatusPill } from '../components/ui';
import { colors } from '../theme';
import { formatZAR } from '../lib/pricing';
import { useApp } from '../store/AppState';
import { statusTone } from './CampaignDetailScreen';
import type { RootStackParamList } from '../navigation/types';

export default function PromoteScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { campaigns, creditBalance, isPremium, setPremium } = useApp();

  return (
    <Screen>
      <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>Reach customers near you</Text>
        <Text style={{ color: '#D8EFE9', marginVertical: 6 }}>
          Choose a listing, a place and a number of impressions. See the full price, including VAT, before you submit.
        </Text>
        <Button
          label="Start a campaign"
          variant="secondary"
          onPress={() => nav.navigate('CampaignBuilder', {})}
          style={{ backgroundColor: '#fff', borderColor: '#fff' }}
        />
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>Advertising credit</Text>
            <Muted>Credit is applied automatically to your next campaign.</Muted>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary }}>{formatZAR(creditBalance)}</Text>
        </View>
        <Pressable onPress={() => setPremium(!isPremium)} accessibilityRole="switch" accessibilityState={{ checked: isPremium }} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.ink }}>
            {isPremium ? '☑' : '☐'} Premium member (10% off advertising){'  '}
            <Text style={{ color: colors.muted, fontSize: 12 }}>demo switch</Text>
          </Text>
        </Pressable>
      </Card>

      <H2>My campaigns</H2>
      {campaigns.length === 0 ? (
        <Empty title="No campaigns yet" body="Open any product or service and tap Promote, or start a campaign above." />
      ) : (
        campaigns.map((c) => (
          <Card key={c.id} onPress={() => nav.navigate('CampaignDetail', { id: c.id })}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>{c.headline}</Text>
            <Muted>{c.targetTitle} · {c.city}</Muted>
            <View style={{ marginVertical: 6 }}>
              <StatusPill label={c.status} tone={statusTone(c.status)} />
            </View>
            <Muted>{c.delivered.toLocaleString('en-ZA')} of {c.impressions.toLocaleString('en-ZA')} impressions</Muted>
            <ProgressBar value={c.impressions ? c.delivered / c.impressions : 0} />
          </Card>
        ))
      )}
    </Screen>
  );
}
