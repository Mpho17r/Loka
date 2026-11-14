import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Chip, Field, H1, H2, Muted, Screen, StatusPill, VerifiedBadge } from '../components/ui';
import { colors } from '../theme';
import { useApp } from '../store/AppState';
import { friendlyError } from '../lib/errors';
import { formatZAR } from '../lib/pricing';
import type { RootStackParamList } from '../navigation/types';

export default function AccountScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, mode, profile, products, services, requests, balance, run, isStaff } = useApp();
  const [signUp, setSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (signUp) {
        const r = await api.signUp(email, password, name);
        if (r.needsConfirmation) Alert.alert('Check your email', 'We sent you a link to confirm your address. Then sign in.');
      } else {
        await api.signIn(email, password);
      }
    } catch (e) { setError(friendlyError(e)); }
    setBusy(false);
  };

  if (!profile) {
    const valid = /\S+@\S+\.\S+/.test(email) && password.length >= 8 && (!signUp || name.trim().length >= 2);
    return (
      <Screen>
        <H1>{signUp ? 'Create your account' : 'Sign in'}</H1>
        <Muted style={{ marginBottom: 16 }}>
          {mode === 'demo' ? 'Demo mode: any details work and nothing is saved. ' : ''}Sign in to request quotations, list products and services, and advertise.
        </Muted>
        {signUp ? <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" /> : null}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" hint={signUp ? 'At least 8 characters.' : undefined} />
        {error ? <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text> : null}
        <Button label={busy ? 'Please wait...' : signUp ? 'Create account' : 'Sign in'} onPress={submit} disabled={!valid || busy} style={{ marginBottom: 10 }} />
        <Button label={signUp ? 'I already have an account' : 'Create an account'} variant="secondary" onPress={() => { setSignUp(!signUp); setError(null); }} />
      </Screen>
    );
  }

  const myProducts = products.filter((p) => mode === 'demo' ? p.ownerId === profile.id : p.ownerId === profile.id);
  const myServices = services.filter((s) => s.ownerId === profile.id);
  const activeRequests = requests.filter((r) => r.status !== 'Cancelled');

  return (
    <Screen>
      <H1>{profile.fullName || 'Your account'}</H1>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <VerifiedBadge level={profile.verification} />
        {profile.isPremium ? <StatusPill label="Premium member" tone="good" /> : null}
        {isStaff ? <StatusPill label={`HQ: ${profile.roles.join(', ')}`} tone="neutral" /> : null}
      </View>
      {profile.verification === 'unverified' ? (
        <Card style={{ backgroundColor: '#FBEFD5', borderColor: colors.warn }}>
          <Text style={{ fontWeight: '700', color: colors.warn }}>Account not verified</Text>
          <Muted>Verification builds trust and is required to advertise. Contact Saccharum support to get verified.</Muted>
        </Card>
      ) : null}

      <Card>
        <Text style={{ color: colors.muted }}>Advertising credit</Text>
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary }}>{formatZAR(balance)}</Text>
      </Card>

      <H2>My listings</H2>
      {myProducts.map((p) => <Card key={p.id}><Text style={{ fontWeight: '700', color: colors.ink }}>{p.emoji} {p.title}</Text><Muted>R{p.price} · {p.city}</Muted></Card>)}
      {myServices.map((s) => <Card key={s.id}><Text style={{ fontWeight: '700', color: colors.ink }}>{s.emoji} {s.title}</Text><Muted>{s.category} · {s.city}</Muted></Card>)}
      {myProducts.length + myServices.length === 0 ? <Muted style={{ marginBottom: 8 }}>You have not listed anything yet.</Muted> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <Chip label="+ Add product" onPress={() => nav.navigate('CreateListing', { type: 'product' })} />
        <Chip label="+ Add service" onPress={() => nav.navigate('CreateListing', { type: 'service' })} />
      </View>

      {activeRequests.length > 0 ? (
        <View>
          <H2>My quotation requests</H2>
          {activeRequests.map((r) => (
            <Card key={r.id}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{r.serviceTitle}</Text>
              <Muted>{r.city} · preferred {r.preferredDate}</Muted>
              <View style={{ marginTop: 6, flexDirection: 'row', gap: 8 }}>
                <StatusPill label={r.status} tone="warn" />
                {r.status === 'Submitted' ? <Chip label="Cancel" onPress={() => run(() => api.cancelRequest(r.id))} /> : null}
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {mode === 'demo' ? (
        <Card style={{ borderStyle: 'dashed' }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>Demo controls</Text>
          <Muted style={{ marginBottom: 8 }}>Premium members get 10% off advertising. The HQ tab lets you approve campaigns and verify payments.</Muted>
          <Chip
            label={profile.isPremium ? 'Premium on (tap to turn off)' : 'Turn premium on'}
            selected={profile.isPremium}
            onPress={() => run(() => api.hqSetFlags(profile.id, { premium: !profile.isPremium }, 'demo'))}
          />
        </Card>
      ) : null}

      <Button label="Sign out" variant="secondary" onPress={() => run(() => api.signOut())} />
    </Screen>
  );
}
