import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, ChipRow, Empty, H2, Field, Muted, Screen } from '../components/ui';
import { useService } from '../lib/useListing';
import { CITIES } from '../data/sample';
import { useApp } from '../store/AppState';
import type { RootStackParamList } from '../navigation/types';

export default function RequestQuoteScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'RequestQuote'>>();
  const { api, profile, run } = useApp();
  const { item: service, loading: serviceLoading } = useService(params.serviceId);
  const [busy, setBusy] = useState(false);

  const [details, setDetails] = useState('');
  const [city, setCity] = useState('Thohoyandou');
  const [date, setDate] = useState('');
  const [budget, setBudget] = useState('');

  if (!service && serviceLoading) return <Screen><Muted>Loading…</Muted></Screen>;
  if (!service) return <Screen><Empty title="Service not found" body="It may have been removed." /></Screen>;

  const dateOk = date === '' || /^\d{4}-\d{2}-\d{2}$/.test(date);
  const budgetNum = budget.trim() === '' ? undefined : Number(budget.replace(',', '.'));
  const budgetOk = budgetNum === undefined || (Number.isFinite(budgetNum) && budgetNum >= 0);
  const valid = details.trim().length >= 10 && dateOk && budgetOk;

  const submit = async () => {
    if (!profile) { Alert.alert('Sign in needed', 'Please sign in from the Account tab to request a quotation.'); return; }
    setBusy(true);
    const err = await run(() => api.submitRequest({
      serviceId: service.id, serviceTitle: service.title, details: details.trim(), city, budget: budgetNum,
      preferredDate: date || 'Flexible',
    }, profile));
    setBusy(false);
    if (err) { Alert.alert('Could not send request', err); return; }
    Alert.alert('Request submitted', 'You will receive quotations here. You are not charged for requesting a quote.', [
      { text: 'OK', onPress: () => nav.popToTop() },
    ]);
  };

  return (
    <Screen>
      <H2>{service.title}</H2>
      <Muted style={{ marginBottom: 16 }}>{service.provider}. Describe the job so providers can quote accurately.</Muted>

      <Field
        label="What do you need done?"
        value={details}
        onChangeText={setDetails}
        placeholder="Describe the work, size and anything that matters"
        multiline
        hint={details.trim().length < 10 ? 'At least 10 characters.' : undefined}
      />
      <Muted style={{ marginBottom: 6, fontWeight: '700' }}>Location</Muted>
      <ChipRow options={CITIES} value={city} onChange={setCity} />
      <Field
        label="Preferred date (optional)"
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        hint={dateOk ? undefined : 'Use the format YYYY-MM-DD.'}
      />
      <Field
        label="Budget in rand (optional)"
        value={budget}
        onChangeText={setBudget}
        placeholder="e.g. 1500"
        keyboardType="decimal-pad"
        hint={budgetOk ? undefined : 'Enter a valid amount.'}
      />
      <Button label={busy ? 'Sending...' : 'Submit request'} onPress={submit} disabled={!valid || busy} />
    </Screen>
  );
}
