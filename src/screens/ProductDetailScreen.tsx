import React from 'react';
import { Alert, Text } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Empty, H1, Muted, Screen, VerifiedBadge } from '../components/ui';
import { colors } from '../theme';
import { PRODUCTS } from '../data/sample';
import { formatZAR } from '../lib/pricing';
import type { RootStackParamList } from '../navigation/types';

export default function ProductDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ProductDetail'>>();
  const p = PRODUCTS.find((x) => x.id === params.id);

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

      <Button
        label="Send enquiry to seller"
        onPress={() => Alert.alert('Enquiry sent', `${p.seller} will reply in your messages. (Prototype: messaging is not connected yet.)`)}
        style={{ marginBottom: 10 }}
      />
      <Button
        label="Promote this product"
        variant="secondary"
        onPress={() => nav.navigate('CampaignBuilder', { targetType: 'product', targetId: p.id })}
      />
    </Screen>
  );
}
