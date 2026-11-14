import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Empty, Field, H2, Muted, ProgressBar, Screen, StatusPill } from '../components/ui';
import { colors } from '../theme';
import { formatZAR } from '../lib/pricing';
import { useApp } from '../store/AppState';
import { statusTone } from './CampaignDetailScreen';
import type { RootStackParamList } from '../navigation/types';

export default function PromoteScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, campaigns, balance, profile, run } = useApp();
  const [brief, setBrief] = useState('');
  const [showManaged, setShowManaged] = useState(false);

  if (!profile) {
    return <Screen><Empty title="Reach customers near you" body="Sign in from the Account tab to start advertising on Loka." /></Screen>;
  }

  const sendManaged = async () => {
    const err = await run(() => api.requestManaged(brief, undefined, profile));
    if (err) { Alert.alert('Could not send', err); return; }
    setBrief(''); setShowManaged(false);
    Alert.alert('Request sent', 'The Saccharum team will contact you about running your campaign.');
  };

  return (
    <Screen>
      <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>Reach customers near you</Text>
        <Text style={{ color: '#D8EFE9', marginVertical: 6 }}>
          Choose a listing, a place and a number of impressions. See the full price, including tax, before you submit.
        </Text>
        <Button label="Start a campaign" variant="secondary" onPress={() => nav.navigate('CampaignBuilder', {})} style={{ backgroundColor: '#fff', borderColor: '#fff' }} />
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>Advertising credit</Text>
            <Muted>Applied automatically to your next campaign.{profile.isPremium ? ' You also get premium advertising rates.' : ''}</Muted>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary }}>{formatZAR(balance)}</Text>
        </View>
        {profile.verification === 'unverified' ? (
          <Muted style={{ marginTop: 8, color: colors.warn }}>Your account is not verified yet. Only verified accounts can advertise.</Muted>
        ) : null}
      </Card>

      <Card>
        <Text style={{ fontWeight: '700', color: colors.ink }}>Want us to do it for you?</Text>
        <Muted style={{ marginBottom: 8 }}>The Saccharum team can create and manage campaigns for your business.</Muted>
        {showManaged ? (
          <View>
            <Field label="Tell us what you want to promote" value={brief} onChangeText={setBrief} multiline placeholder="Business, goal and area (at least 10 characters)" />
            <Button label="Send request" onPress={sendManaged} disabled={brief.trim().length < 10} />
          </View>
        ) : (
          <Button label="Ask for managed advertising" variant="secondary" onPress={() => setShowManaged(true)} />
        )}
      </Card>

      <H2>My campaigns</H2>
      {campaigns.length === 0 ? (
        <Empty title="No campaigns yet" body="Open one of your listings and tap Promote, or start a campaign above." />
      ) : (
        campaigns.map((c) => (
          <Card key={c.id} onPress={() => nav.navigate('CampaignDetail', { id: c.id })}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>{c.headline}</Text>
            <Muted>{c.targetTitle} · {c.city}</Muted>
            <View style={{ marginVertical: 6 }}><StatusPill label={c.status} tone={statusTone(c.status)} /></View>
            <Muted>{c.delivered.toLocaleString('en-ZA')} of {c.impressions.toLocaleString('en-ZA')} impressions</Muted>
            <ProgressBar value={c.impressions ? c.delivered / c.impressions : 0} />
          </Card>
        ))
      )}
    </Screen>
  );
}
