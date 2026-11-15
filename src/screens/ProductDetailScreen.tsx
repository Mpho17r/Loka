import React from 'react';
import { Alert, Text } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Empty, H1, Muted, Screen, VerifiedBadge } from '../components/ui';
import { useProduct } from '../lib/useListing';
import { colors } from '../theme';
import { useApp } from '../store/AppState';
import { formatZAR } from '../lib/pricing';
import type { RootStackParamList } from '../navigation/types';

export default function ProductDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ProductDetail'>>();
  const { profile, mode } = useApp();
  const { item: p, loading } = useProduct(params.id);
  const canPromote = mode === 'demo' || (!!profile && p?.ownerId === profile.id);

  if (!p && loading) return <Screen><Muted>Loading…</Muted></Screen>;
  if (!p) return <Screen><Empty title="Listing not found" body="It may have been removed." /></Screen>;

  return (
    <Screen>
      <Text style={{ fontSize: 80, textAlign: 'center', marginVertical: 8 }}>{p.emoji}</Text>
      <H1>{p.title}</H1>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.primary, marginBottom: 8 }}>{formatZAR(p.price)}</Text>
      <Muted style={{ marginBottom: 12 }}>{p.condition} · {p.category} · {p.city}</Muted>

      <Card>
        <Text style={{ fontSize: 15, color: colors.ink, lineHeight: 22 }}>{p.description}</Text>
      </Card>

      <Card>
        <Text style={{ fontWeight: '700', color: colors.ink, marginBottom: 6 }}>{p.seller}</Text>
        <VerifiedBadge level={p.verification} />
        <Muted style={{ marginTop: 10 }}>
          Payment is arranged directly between you and the seller. Loka does not process or verify this payment.
        </Muted>
      </Card>

      {!profile || p.ownerId !== profile.id ? (
        <Button
          label="Message seller"
          onPress={() => (profile ? nav.navigate('Chat', { listingType: 'product', listingId: p.id, title: p.seller }) : Alert.alert('Sign in needed', 'Please sign in from the Account tab to message the seller.'))}
          style={{ marginBottom: 10 }}
        />
      ) : null}
      {canPromote ? (
        <Button
          label="Promote this product"
          variant="secondary"
          onPress={() => nav.navigate('CampaignBuilder', { targetType: 'product', targetId: p.id })}
        />
      ) : null}
    </Screen>
  );
}
