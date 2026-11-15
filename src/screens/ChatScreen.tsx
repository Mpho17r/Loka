import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Button, Card, Muted } from '../components/ui';
import { colors } from '../theme';
import { useApp } from '../store/AppState';
import { friendlyError } from '../lib/errors';
import type { Conversation, Message } from '../types';
import type { RootStackParamList } from '../navigation/types';

const POLL_MS = 5000;
const MAX_LEN = 2000;

/** A conversation about a listing. Opened either with an existing conversation id, or from a listing (the conversation is created by the first message). */
export default function ChatScreen() {
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const { api, profile } = useApp();
  const [convId, setConvId] = useState<string | undefined>(params.conversationId);
  const [conv, setConv] = useState<Conversation | undefined>(undefined);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const focused = useRef(false);

  const refresh = useCallback(async () => {
    if (!convId) return;
    try {
      const [msgs, convs] = await Promise.all([api.loadMessages(convId), api.loadConversations()]);
      setMessages((prev) => (prev.length === msgs.length && prev[prev.length - 1]?.id === msgs[msgs.length - 1]?.id ? prev : msgs));
      setConv(convs.find((c) => c.id === convId));
      await api.markConversationRead(convId);
    } catch (e) { setError(friendlyError(e)); }
  }, [api, convId]);

  // Check for new messages every few seconds while this screen is open.
  useFocusEffect(useCallback(() => {
    focused.current = true;
    refresh();
    const t = setInterval(() => { if (focused.current) refresh(); }, POLL_MS);
    return () => { focused.current = false; clearInterval(t); };
  }, [refresh]));

  useEffect(() => { scroller.current?.scrollToEnd({ animated: true }); }, [messages.length]);

  if (!profile) return <View style={{ padding: 16 }}><Muted>Sign in from the Account tab to send messages.</Muted></View>;

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError(null);
    try {
      if (convId) {
        await api.sendMessage(convId, body);
      } else if (params.listingType && params.listingId) {
        const id = await api.startConversation(params.listingType, params.listingId, body);
        setConvId(id);
      }
      setText('');
      await refresh();
    } catch (e) { setError(friendlyError(e)); }
    setBusy(false);
  };

  const report = (m: Message) => {
    if (m.mine) return;
    Alert.alert('Report this message?', 'Saccharum will read this message and the few before it. The other person is not told who reported.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: () => api.reportMessage(m.id, 'Reported by user').then(
        () => Alert.alert('Reported', 'Thank you. Saccharum will look at it.'), (e) => Alert.alert('Could not report', friendlyError(e))) },
    ]);
  };

  const toggleBlock = () => {
    if (!conv) return;
    const unblock = conv.blockedByMe;
    Alert.alert(unblock ? 'Unblock this person?' : 'Block this person?',
      unblock ? 'You will both be able to message each other again.' : 'Neither of you will be able to send messages in this conversation.', [
        { text: 'Cancel', style: 'cancel' },
        { text: unblock ? 'Unblock' : 'Block', style: unblock ? 'default' : 'destructive',
          onPress: () => (unblock ? api.unblockUser(conv.otherUserId) : api.blockUser(conv.otherUserId)).then(refresh, (e) => setError(friendlyError(e))) },
      ]);
  };

  void nav;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroller} contentContainerStyle={{ padding: 16, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
        <Card style={{ backgroundColor: '#FBEFD5', borderColor: colors.warn }}>
          <Text style={{ fontWeight: '700', color: colors.warn }}>Stay safe</Text>
          <Muted>Never share your PIN, password or one-time codes. Meet in a public place. Loka does not handle payments between buyers and sellers, so do not pay in advance to someone you do not know.</Muted>
        </Card>
        {conv ? <Muted style={{ marginBottom: 8 }}>About: {conv.listingTitle}</Muted> : params.title ? <Muted style={{ marginBottom: 8 }}>About: {params.title}</Muted> : null}
        {messages.length === 0 ? <Muted>Say hello. Ask about the price, condition or when you can collect.</Muted> : null}
        {messages.map((m) => (
          <View key={m.id} style={{ alignItems: m.mine ? 'flex-end' : 'flex-start', marginVertical: 3 }}>
            <Text
              onLongPress={() => report(m)}
              style={{ maxWidth: '85%', padding: 10, borderRadius: 12, overflow: 'hidden',
                backgroundColor: m.mine ? colors.primary : colors.card, color: m.mine ? '#fff' : colors.ink }}
            >
              {m.body}
            </Text>
          </View>
        ))}
        {messages.some((m) => !m.mine) ? <Muted style={{ marginTop: 8 }}>Press and hold their message to report it.</Muted> : null}
        {conv ? <Button label={conv.blockedByMe ? 'Unblock this person' : 'Block this person'} variant="secondary" onPress={toggleBlock} style={{ marginTop: 12 }} /> : null}
        {error ? <Text style={{ color: colors.danger, marginTop: 8 }}>{error}</Text> : null}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.card }}>
        <TextInput
          value={text} onChangeText={setText} placeholder="Write a message" placeholderTextColor={colors.muted} multiline maxLength={MAX_LEN}
          accessibilityLabel="Message"
          style={{ flex: 1, maxHeight: 110, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: colors.ink }}
        />
        <Button label={busy ? '…' : 'Send'} onPress={send} disabled={busy || text.trim().length === 0 || conv?.blockedByMe} />
      </View>
    </KeyboardAvoidingView>
  );
}
