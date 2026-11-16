import React from 'react';
import { Alert, Text } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Empty, H1, Muted, Row, RoundIconButton, Screen, VerifiedBadge } from '../components/ui';
import { DetailHero, DetailPage } from '../components/detail';
import { useService } from '../lib/useListing';
import { colors } from '../theme';
import { useApp } from '../store/AppState';
import { priceLabel } from './ServicesScreen';
import type { RootStackParamList } from '../navigation/types';

export default function ServiceDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ServiceDetail'>>();
  const { profile, mode, favourites, toggleFavourite } = useApp();
  const { item: s, loading } = useService(params.id);
  const canPromote = mode === 'demo' || (!!profile && s?.ownerId === profile.id);

  if (!s && loading) return <Screen><Muted>Loading…</Muted></Screen>;
  if (!s) return <Screen><Empty title="Service not found" body="It may have been removed." /></Screen>;

  const isLokaDirect = s.providedByLoka;

  const mine = !!profile && s.ownerId === profile.id;
  const message = () => (profile
    ? nav.navigate('Chat', { listingType: 'service', listingId: s.id, title: s.provider })
    : Alert.alert('Sign in needed', 'Please sign in from the Account tab to message the provider.'));

  return (
    <DetailPage
      bottom={(
        <>
          <RoundIconButton name={favourites.includes(s.id) ? 'heart' : 'heart-outline'} label={favourites.includes(s.id) ? 'Remove from saved' : 'Save'}
            active={favourites.includes(s.id)} onPress={() => toggleFavourite(s.id)} size={56} />
          {mine ? (
            <Button label="Promote this service" onPress={() => nav.navigate('CampaignBuilder', { targetType: 'service', targetId: s.id })} style={{ flex: 1 }} />
          ) : (
            <Button label="Request a quotation" onPress={() => nav.navigate('RequestQuote', { serviceId: s.id })} style={{ flex: 1 }} />
          )}
        </>
      )}
    >
      <H1>{s.title}</H1>
      <Muted>{s.category} · ★ {s.rating.toFixed(1)} · {s.jobs} jobs</Muted>
      <DetailHero emoji={s.emoji} caption="Pricing" value={priceLabel(s)} />

      <Text style={{ fontWeight: '800', fontSize: 17, color: colors.ink, marginBottom: 6 }}>Description</Text>
      <Text style={{ fontSize: 15, color: colors.muted, lineHeight: 22, marginBottom: 16 }}>{s.description}</Text>

      <Card>
        <Row label="Provider" value={s.provider} />
        <Row label="Location" value={s.city} />
        <Row label="Delivery" value={s.delivery} />
        <VerifiedBadge level={s.verification} />
      </Card>

      {/* Each transaction must say whether Loka is the provider, an agent or a coordinator (plan, section 3.3). */}
      <Card>
        <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 4 }}>Who provides this service?</Text>
        <Muted>
          {isLokaDirect
            ? 'Loka is the service provider. Loka sells and delivers this service under its own brand.'
            : `${s.provider} is an independent provider. Loka lists the service and helps you request quotations. Payment is arranged directly with the provider.`}
        </Muted>
      </Card>

      {!s.providedByLoka && !mine ? <Button label="Message provider" variant="secondary" onPress={message} /> : null}
      {canPromote && !mine ? (
        <Button label="Promote this service" variant="secondary" onPress={() => nav.navigate('CampaignBuilder', { targetType: 'service', targetId: s.id })} style={{ marginTop: 10 }} />
      ) : null}
    </DetailPage>
  );
}
