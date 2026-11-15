import React from 'react';
import { Alert, Text } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Empty, H1, Muted, Row, Screen, VerifiedBadge } from '../components/ui';
import { useService } from '../lib/useListing';
import { colors } from '../theme';
import { useApp } from '../store/AppState';
import { priceLabel } from './ServicesScreen';
import type { RootStackParamList } from '../navigation/types';

export default function ServiceDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ServiceDetail'>>();
  const { profile, mode } = useApp();
  const { item: s, loading } = useService(params.id);
  const canPromote = mode === 'demo' || (!!profile && s?.ownerId === profile.id);

  if (!s && loading) return <Screen><Muted>Loading…</Muted></Screen>;
  if (!s) return <Screen><Empty title="Service not found" body="It may have been removed." /></Screen>;

  const isLokaDirect = s.providedByLoka;

  return (
    <Screen>
      <Text style={{ fontSize: 64, textAlign: 'center', marginVertical: 8 }}>{s.emoji}</Text>
      <H1>{s.title}</H1>
      <Muted style={{ marginBottom: 12 }}>{s.category}</Muted>

      <Card>
        <Text style={{ fontSize: 15, color: colors.ink, lineHeight: 22 }}>{s.description}</Text>
      </Card>

      <Card>
        <Row label="Provider" value={s.provider} />
        <Row label="Location" value={s.city} />
        <Row label="Delivery" value={s.delivery} />
        <Row label="Pricing" value={priceLabel(s)} />
        <Row label="Rating" value={`★ ${s.rating.toFixed(1)} · ${s.jobs} jobs`} />
        <VerifiedBadge level={s.verification} />
      </Card>

      {/* Each transaction must say whether Loka is the provider, an agent or a coordinator (plan, section 3.3). */}
      <Card>
        <Text style={{ fontWeight: '700', color: colors.ink, marginBottom: 4 }}>Who provides this service?</Text>
        <Muted>
          {isLokaDirect
            ? 'Loka is the service provider. Loka sells and delivers this service under its own brand.'
            : `${s.provider} is an independent provider. Loka lists the service and helps you request quotations. Payment is arranged directly with the provider.`}
        </Muted>
      </Card>

      {!s.providedByLoka && (!profile || s.ownerId !== profile.id) ? (
        <Button
          label="Message provider"
          variant="secondary"
          onPress={() => (profile ? nav.navigate('Chat', { listingType: 'service', listingId: s.id, title: s.provider }) : Alert.alert('Sign in needed', 'Please sign in from the Account tab to message the provider.'))}
          style={{ marginBottom: 10 }}
        />
      ) : null}
      <Button label="Request a quotation" onPress={() => nav.navigate('RequestQuote', { serviceId: s.id })} style={{ marginBottom: 10 }} />
      {canPromote ? (
        <Button
          label="Promote this service"
          variant="secondary"
          onPress={() => nav.navigate('CampaignBuilder', { targetType: 'service', targetId: s.id })}
        />
      ) : null}
    </Screen>
  );
}
