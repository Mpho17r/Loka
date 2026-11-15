import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Empty, Muted, Screen } from '../components/ui';
import { colors } from '../theme';
import { useApp } from '../store/AppState';
import { friendlyError } from '../lib/errors';
import type { Conversation } from '../types';
import type { RootStackParamList } from '../navigation/types';

export default function InboxScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, profile } = useApp();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.loadConversations().then(setItems).catch((e) => setError(friendlyError(e)));
  }, [api]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!profile) return <Screen><Empty title="Sign in to see your messages" body="Open the Account tab and sign in." /></Screen>;

  return (
    <Screen>
      {error ? (
        <View><Text style={{ color: colors.danger, marginBottom: 8 }}>{error}</Text><Button label="Try again" variant="secondary" onPress={load} /></View>
      ) : null}
      {items === null && !error ? <Muted>Loading…</Muted> : null}
      {items !== null && items.length === 0 ? (
        <Empty title="No messages yet" body="Open a listing and tap Message seller to start a conversation." />
      ) : null}
      {(items ?? []).map((c) => (
        <Card key={c.id} onPress={() => nav.navigate('Chat', { conversationId: c.id, title: c.otherName })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: c.unread ? '800' : '600', color: colors.ink, flex: 1 }} numberOfLines={1}>{c.otherName}</Text>
            {c.unread ? <Text style={{ color: colors.primary, fontWeight: '800' }}>● New</Text> : null}
          </View>
          <Muted>About: {c.listingTitle}</Muted>
          <Text style={{ color: colors.ink, marginTop: 4 }} numberOfLines={1}>{c.lastPreview || 'No messages yet'}</Text>
          {c.blockedByMe ? <Muted style={{ marginTop: 4 }}>You blocked this person.</Muted> : null}
        </Card>
      ))}
    </Screen>
  );
}
