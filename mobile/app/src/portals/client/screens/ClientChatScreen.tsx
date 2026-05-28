import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ClientChatMessage } from '@cagupta/shared-services';
import { clientChat } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const POLL_MS = 15000;

function formatTime(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function senderLabel(m: ClientChatMessage): string {
  const kind = m.sender_kind || (m.sender_user_id ? 'staff' : 'bot');
  if (kind === 'bot') return m.sender_name || 'CA Assistant';
  if (kind === 'staff') return m.sender_name || 'CA Team';
  return m.sender_name || 'You';
}

export default function ClientChatScreen() {
  const [messages, setMessages] = useState<ClientChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<ClientChatMessage>>(null);
  const lastMsgIdRef = useRef(0);

  const mergeMessages = useCallback((rows: ClientChatMessage[], initial = false) => {
    if (!rows?.length) return;
    setMessages((prev) => {
      if (initial) return [...rows].sort((a, b) => Number(a.id) - Number(b.id));
      const ids = new Set(prev.map((m) => m.id));
      const merged = [...prev];
      rows.forEach((m) => {
        if (!ids.has(m.id)) merged.push(m);
      });
      return merged.sort((a, b) => Number(a.id) - Number(b.id));
    });
    const maxId = Math.max(...rows.map((m) => Number(m.id)));
    lastMsgIdRef.current = Math.max(lastMsgIdRef.current, maxId);
    clientChat.markRead(maxId).catch(() => {});
  }, []);

  const loadThread = useCallback(
    (initial = false) => {
      const afterId = initial ? 0 : lastMsgIdRef.current;
      return clientChat
        .fetchThread({ afterId })
        .then(({ messages: rows }) => mergeMessages(rows, initial))
        .catch((e: Error) => setError(e.message || 'Failed to load chat'))
        .finally(() => setLoading(false));
    },
    [mergeMessages],
  );

  useEffect(() => {
    loadThread(true);
  }, [loadThread]);

  useEffect(() => {
    const poll = setInterval(() => loadThread(false), POLL_MS);
    return () => clearInterval(poll);
  }, [loadThread]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const data = await clientChat.sendMessage(text);
      setDraft('');
      const newMsgs = [data.client_message, data.bot_message].filter(Boolean) as ClientChatMessage[];
      mergeMessages(newMsgs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  function renderMessage({ item: m }: { item: ClientChatMessage }) {
    const kind = m.sender_kind || (m.sender_user_id ? 'staff' : 'bot');
    const mine = kind === 'client';
    const isStaff = kind === 'staff';

    return (
      <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowOther]}>
        <View
          style={[
            styles.bubble,
            mine && styles.bubbleMine,
            isStaff && styles.bubbleStaff,
            !mine && !isStaff && styles.bubbleBot,
          ]}
        >
          {!mine && <Text style={styles.senderName}>{senderLabel(m)}</Text>}
          <Text style={[styles.bodyText, mine && styles.bodyTextMine]}>{m.body_text}</Text>
          <Text style={[styles.time, mine && styles.timeMine]}>{formatTime(m.created_at)}</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>CA Assistant</Text>
          <Text style={styles.headerSub}>
            Ask general tax and service questions. Our team can reply when needed.
          </Text>
        </View>
        <Pressable onPress={() => loadThread(false)} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && messages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#15803d" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask your CA assistant…"
          multiline
          editable={!sending}
        />
        <Pressable
          onPress={handleSend}
          disabled={!draft.trim() || sending}
          style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </Pressable>
      </View>
      <Text style={styles.disclaimer}>
        General information only — not formal tax or legal advice.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: theme.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  headerSub: { fontSize: 12, color: theme.muted, marginTop: 4, maxWidth: 260 },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.white,
  },
  refreshText: { fontSize: 13, fontWeight: '600', color: theme.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thread: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  msgRow: { marginBottom: 10, flexDirection: 'row' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  bubbleMine: { backgroundColor: '#16a34a', borderBottomRightRadius: 4 },
  bubbleStaff: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderBottomLeftRadius: 4 },
  bubbleBot: { borderBottomLeftRadius: 4 },
  senderName: { fontSize: 11, fontWeight: '700', color: theme.text, marginBottom: 4 },
  bodyText: { fontSize: 14, color: theme.text, lineHeight: 20 },
  bodyTextMine: { color: '#fff' },
  time: { fontSize: 10, color: theme.muted, marginTop: 6, textAlign: 'right' },
  timeMine: { color: 'rgba(255,255,255,0.75)' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.white,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: theme.white,
  },
  sendBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 64,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  error: { color: theme.danger, paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
  disclaimer: {
    fontSize: 11,
    color: theme.muted,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.white,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
});
