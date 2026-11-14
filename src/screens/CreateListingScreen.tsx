import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, ChipRow, Empty, Field, Muted, Screen } from '../components/ui';
import { colors } from '../theme';
import { CITIES, PRODUCT_CATEGORIES, SERVICE_CATEGORIES } from '../data/sample';
import { useApp } from '../store/AppState';
import type { PricingModel } from '../types';
import type { RootStackParamList } from '../navigation/types';

const MODELS: PricingModel[] = ['Fixed price', 'Hourly', 'Quotation', 'Free consultation'];

export default function CreateListingScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'CreateListing'>>();
  const { api, profile, run } = useApp();
  const isProduct = params.type === 'product';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<'New' | 'Second-hand'>('New');
  const [category, setCategory] = useState(isProduct ? PRODUCT_CATEGORIES[1] : SERVICE_CATEGORIES[1]);
  const [city, setCity] = useState(profile && CITIES.includes('Thohoyandou') ? 'Thohoyandou' : CITIES[0]);
  const [model, setModel] = useState<PricingModel>('Quotation');
  const [delivery, setDelivery] = useState<'On-site' | 'Remote' | 'Both'>('On-site');
  const [busy, setBusy] = useState(false);

  if (!profile) return <Screen><Empty title="Sign in first" body="Open the Account tab and sign in to add a listing." /></Screen>;

  const priceNum = price.trim() === '' ? undefined : Number(price.replace(',', '.'));
  const priceOk = priceNum === undefined ? !isProduct && (model === 'Quotation' || model === 'Free consultation') : Number.isFinite(priceNum) && priceNum >= 0;
  const needsPrice = isProduct || model === 'Fixed price' || model === 'Hourly';
  const valid = title.trim().length >= 3 && (needsPrice ? priceNum !== undefined && priceOk : true);

  const submit = async () => {
    setBusy(true);
    const err = await run(() => isProduct
      ? api.createProduct({ title, description, price: priceNum ?? 0, condition, category, city }, profile)
      : api.createService({ title, description, category, city, pricingModel: model, fromPrice: needsPrice ? priceNum : undefined, delivery }, profile));
    setBusy(false);
    if (err) { Alert.alert('Could not save', err); return; }
    nav.goBack();
  };

  return (
    <Screen>
      <Field label={isProduct ? 'Product title' : 'Service title'} value={title} onChangeText={setTitle} maxLength={120} />
      <Field label="Description" value={description} onChangeText={setDescription} multiline hint="Be honest about condition, price and what is included." />
      <Text style={{ fontWeight: '700', color: colors.ink, marginBottom: 6 }}>Category</Text>
      <ChipRow options={(isProduct ? PRODUCT_CATEGORIES : SERVICE_CATEGORIES).slice(1)} value={category} onChange={setCategory} />
      <Text style={{ fontWeight: '700', color: colors.ink, marginBottom: 6 }}>City</Text>
      <ChipRow options={CITIES} value={city} onChange={setCity} />
      {isProduct ? (
        <>
          <Text style={{ fontWeight: '700', color: colors.ink, marginBottom: 6 }}>Condition</Text>
          <ChipRow options={['New', 'Second-hand']} value={condition} onChange={(v) => setCondition(v as 'New' | 'Second-hand')} />
        </>
      ) : (
        <>
          <Text style={{ fontWeight: '700', color: colors.ink, marginBottom: 6 }}>How do you price it?</Text>
          <ChipRow options={MODELS} value={model} onChange={(v) => setModel(v as PricingModel)} />
          <Text style={{ fontWeight: '700', color: colors.ink, marginBottom: 6 }}>Delivery</Text>
          <ChipRow options={['On-site', 'Remote', 'Both']} value={delivery} onChange={(v) => setDelivery(v as 'On-site' | 'Remote' | 'Both')} />
        </>
      )}
      {needsPrice ? (
        <Field label={isProduct ? 'Price in rand' : model === 'Hourly' ? 'Price per hour in rand' : 'Price from, in rand'} value={price} onChangeText={setPrice} keyboardType="decimal-pad"
          hint={price !== '' && !priceOk ? 'Enter a valid amount.' : undefined} />
      ) : null}
      <Muted style={{ marginBottom: 12 }}>Your verification level is shown on the listing automatically. It cannot be edited.</Muted>
      <Button label={busy ? 'Saving...' : 'Publish listing'} onPress={submit} disabled={!valid || busy} />
    </Screen>
  );
}
