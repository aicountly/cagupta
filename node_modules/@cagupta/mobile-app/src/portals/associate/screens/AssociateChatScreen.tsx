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
import type { TeamChatConversation, TeamChatMessage } from '@cagupta/shared-services';
import { teamChat } from '../../../adapters/apiClient';
import { useAuth } from '../../../auth/AuthContext';
import { theme } from '../../../theme/portalTheme';

const ASSOCIATE_ACCENT = '#7c3aed';
const POLL_MS = 15000;

function formatTime(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function convTitle(c: TeamChatConversation): string {
  return c.display_title || c.title || (c.type === 'channel' ? 'Channel' : 'Direct message');
}

export default function AssociateChatScreen() {
  const { user, hasPermission } = useAuth();
  const userId = user?.id;

  const [conversations, setConversations] = useState<TeamChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState('');
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<TeamChatMessage>>(null);
  const lastMsgIdRef = useRef(0);

  const canUseChat = hasPermission('chat.use');

  const loadConversations = useCallback(() => {
    if (!canUseChat) return Promise.resolve();
    setError('');
    return teamChat
      .fetchConversations()
      .then((rows) => setConversations(Array.isArray(rows) ? rows : []))
      .catch((e: Error) => setError(e.message || 'Failed to load conversations'))
      .finally(() => setLoadingList(false));
  }, [canUseChat]);

  const mergeMessages = useCallback((rows: TeamChatMessage[], initial = false) => {
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
    if (selectedId && maxId > 0) {
      teamChat.markConversationRead(selectedId, maxId).catch(() => {});
    }
  }, [selectedId]);

  const loadMessages = useCallback(
    (convId: number | string, initial = false) => {
      const afterId = initial ? 0 : lastMsgIdRef.current;
      setLoadingThread(initial);
      return teamChat
        .fetchMessages(convId, { afterId, limit: 50 })
        .then(({ rows }) => mergeMessages(rows, initial))
        .catch((e: Error) => setError(e.message || 'Failed to load messages'))
        .finally(() => setLoadingThread(false));
    },
    [mergeMessages],
  );

  const openConversation = useCallback(
    (conv: TeamChatConversation) => {
      setSelectedId(conv.id);
      setSelectedTitle(convTitle(conv));
      setMessages([]);
      lastMsgIdRef.current = 0;
      setError('');
      loadMessages(conv.id, true);
    },
    [loadMessages],
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId || !canUseChat) return undefined;
    const poll = setInterval(() => {
      loadMessages(selectedId, false);
      loadConversations();
    }, POLL_MS);
    return () => clearInterval(poll);
  }, [selectedId, canUseChat, loadMessages, loadConversations]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  async function handleSend() {
    const text = draft.trim();
    if (!selectedId || !text || sending) return;
    setSending(true);
    setError('');
    try {
      const msg = await teamChat.sendMessage(selectedId, text);
      setDraft('');
      if (msg) mergeMessages([msg]);
      loadConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  function renderConversation({ item: c }: { item: TeamChatConversation }) {
    const unread = Number(c.unread_count || 0);
    return (
      <Pressable style={styles.convRow} onPress={() => openConversation(c)}>
        <View style={styles.flex1}>
          <Text style={styles.convTitle}>{convTitle(c)}</Text>
          {c.last_message_preview ? (
            <Text style={styles.convPreview} numberOfLines={1}>{c.last_message_preview}</Text>
          ) : null}
        </View>
        {unread > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  function renderMessage({ item: m }: { item: TeamChatMessage }) {
    const mine = Number(m.sender_user_id) === Number(userId);
    return (
      <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowOther]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          {!mine && (
            <Text style={styles.senderName}>{m.sender_name || 'Team member'}</Text>
          )}
          <Text style={[styles.bodyText, mine && styles.bodyTextMine]}>{m.body_text}</Text>
          <Text style={[styles.time, mine && styles.timeMine]}>{formatTime(m.created_at)}</Text>
        </View>
      </View>
    );
  }

  if (!canUseChat) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Team chat is not available for your account.</Text>
      </View>
    );
  }

  if (!selectedId) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.flex1}>
            <Text style={styles.headerTitle}>Team chat</Text>
            <Text style={styles.headerSub}>Message your team — conversations are recorded for audit.</Text>
          </View>
          <Pressable onPress={loadConversations} style={styles.refreshBtn}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loadingList ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={ASSOCIATE_ACCENT} />
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderConversation}
            contentContainerStyle={styles.convList}
            ListEmptyComponent={
              !loadingList ? <Text style={styles.empty}>No conversations yet.</Text> : null
            }
          />
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.threadHeader}>
        <Pressable onPress={() => { setSelectedId(null); setSelectedTitle(''); }} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.threadTitle} numberOfLines={1}>{selectedTitle}</Text>
        <Pressable onPress={() => loadMessages(selectedId, false)} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>↻</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loadingThread && messages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ASSOCIATE_ACCENT} />
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
          placeholder="Write a message…"
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  flex1: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    backgroundColor: theme.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  headerSub: { fontSize: 12, color: theme.muted, marginTop: 4, lineHeight: 18 },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.white,
  },
  refreshText: { fontSize: 13, fontWeight: '600', color: theme.text },
  convList: { paddingBottom: 24 },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.white,
  },
  convTitle: { fontSize: 15, fontWeight: '600', color: theme.text },
  convPreview: { fontSize: 12, color: theme.muted, marginTop: 2 },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ASSOCIATE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backBtn: { paddingVertical: 6, paddingRight: 8 },
  backText: { color: ASSOCIATE_ACCENT, fontWeight: '600', fontSize: 14 },
  threadTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: theme.text },
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
  bubbleMine: { backgroundColor: ASSOCIATE_ACCENT, borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4 },
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
    color: theme.text,
  },
  sendBtn: {
    backgroundColor: ASSOCIATE_ACCENT,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 64,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: theme.danger, paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },
});
