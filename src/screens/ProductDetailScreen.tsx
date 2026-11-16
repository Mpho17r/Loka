import React from 'react';
import { Alert, Text } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Empty, H1, Muted, RoundIconButton, Screen, VerifiedBadge } from '../components/ui';
import { DetailHero, DetailPage } from '../components/detail';
import { useProduct } from '../lib/useListing';
import { colors } from '../theme';
import { useApp } from '../store/AppState';
import { formatZAR } from '../lib/pricing';
import type { RootStackParamList } from '../navigation/types';

export default function ProductDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ProductDetail'>>();
  const { profile, mode, favourites, toggleFavourite } = useApp();
  const { item: p, loading } = useProduct(params.id);
  const canPromote = mode === 'demo' || (!!profile && p?.ownerId === profile.id);

  if (!p && loading) return <Screen><Muted>Loading…</Muted></Screen>;
  if (!p) return <Screen><Empty title="Listing not found" body="It may have been removed." /></Screen>;

  const mine = !!profile && p.ownerId === profile.id;
  const message = () => (profile
    ? nav.navigate('Chat', { listingType: 'product', listingId: p.id, title: p.seller })
    : Alert.alert('Sign in needed', 'Please sign in from the Account tab to message the seller.'));

  return (
    <DetailPage
      bottom={(
        <>
          <RoundIconButton name={favourites.includes(p.id) ? 'heart' : 'heart-outline'} label={favourites.includes(p.id) ? 'Remove from saved' : 'Save'}
            active={favourites.includes(p.id)} onPress={() => toggleFavourite(p.id)} size={56} />
          {mine ? (
            <Button label="Promote this product" onPress={() => nav.navigate('CampaignBuilder', { targetType: 'product', targetId: p.id })} style={{ flex: 1 }} />
          ) : (
            <Button label="Message seller" onPress={message} style={{ flex: 1 }} />
          )}
        </>
      )}
    >
      <H1>{p.title}</H1>
      <Muted>{p.condition} · {p.category} · {p.city}</Muted>
      <DetailHero emoji={p.emoji} caption="Price" value={formatZAR(p.price)} />

      <Text style={{ fontWeight: '800', fontSize: 17, color: colors.ink, marginBottom: 6 }}>Description</Text>
      <Text style={{ fontSize: 15, color: colors.muted, lineHeight: 22, marginBottom: 16 }}>{p.description}</Text>

      <Card>
        <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 6 }}>{p.seller}</Text>
        <VerifiedBadge level={p.verification} />
        <Muted style={{ marginTop: 10 }}>
          Payment is arranged directly between you and the seller. Loka does not process or verify this payment.
        </Muted>
      </Card>
      {canPromote && !mine ? (
        <Button label="Promote this product" variant="secondary" onPress={() => nav.navigate('CampaignBuilder', { targetType: 'product', targetId: p.id })} />
      ) : null}
    </DetailPage>
  );
}
