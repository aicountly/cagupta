import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ROLE_LABELS } from '@cagupta/shared-constants';
import { authService } from '../../../adapters/apiClient';
import { useAuth } from '../../../auth/AuthContext';
import { theme } from '../../../theme/portalTheme';

const CORE_ACCENT = '#2563eb';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function CoreProfileScreen() {
  const { user, session, updateUser } = useAuth();
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passSaving, setPassSaving] = useState(false);
  const [passMsg, setPassMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name || '');
    setAvatarUrl(user.avatar_url || '');
  }, [user]);

  useEffect(() => {
    if (!session?.token) return;
    setRefreshing(true);
    authService
      .fetchCurrentUser(session.token)
      .then((u) => { if (u) updateUser(u); })
      .finally(() => setRefreshing(false));
  }, [session?.token, updateUser]);

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>You need to be signed in to view your profile.</Text>
      </View>
    );
  }

  const roleLabel = ROLE_LABELS[user.role] || user.role || 'User';
  const canChangePassword = user.can_change_password === true;
  const previewInitials = getInitials(name || user.name || '?');

  async function handleSaveProfile() {
    setProfileMsg(null);
    setProfileSaving(true);
    try {
      const updated = await authService.updateProfile({
        name: name.trim(),
        avatar_url: avatarUrl.trim() || null,
      });
      updateUser(updated);
      setProfileMsg({ type: 'ok', text: 'Profile saved.' });
    } catch (e) {
      setProfileMsg({ type: 'err', text: e instanceof Error ? e.message : 'Could not save profile.' });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword() {
    setPassMsg(null);
    if (newPass !== confirmPass) {
      setPassMsg({ type: 'err', text: 'New password and confirmation do not match.' });
      return;
    }
    setPassSaving(true);
    try {
      await authService.changePassword({ currentPassword: curPass, newPassword: newPass });
      setCurPass('');
      setNewPass('');
      setConfirmPass('');
      setPassMsg({ type: 'ok', text: 'Password updated.' });
    } catch (e) {
      setPassMsg({ type: 'err', text: e instanceof Error ? e.message : 'Could not change password.' });
    } finally {
      setPassSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {refreshing ? (
        <ActivityIndicator size="small" color={CORE_ACCENT} style={{ marginBottom: 8 }} />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Account details</Text>
        <View style={styles.previewRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{previewInitials}</Text>
          </View>
          <View>
            <Text style={styles.previewLabel}>Preview</Text>
            <Text style={styles.previewName}>{name.trim() || user.name}</Text>
            <Text style={styles.previewRole}>{roleLabel}</Text>
          </View>
        </View>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={[styles.input, styles.inputReadOnly]}
          value={user.email || ''}
          editable={false}
        />
        <Text style={styles.hint}>Email is managed by an administrator.</Text>

        <Text style={styles.label}>Display name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={120}
          autoComplete="name"
        />

        <Text style={styles.label}>Avatar image URL (optional)</Text>
        <TextInput
          style={styles.input}
          value={avatarUrl}
          onChangeText={setAvatarUrl}
          placeholder="https://…"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>Use a direct https link, or leave blank for initials.</Text>

        {profileMsg ? (
          <Text style={[styles.msg, profileMsg.type === 'ok' ? styles.msgOk : styles.msgErr]}>
            {profileMsg.text}
          </Text>
        ) : null}

        <Pressable
          onPress={handleSaveProfile}
          disabled={profileSaving}
          style={[styles.primaryBtn, profileSaving && styles.btnDisabled]}
        >
          <Text style={styles.primaryBtnText}>{profileSaving ? 'Saving…' : 'Save profile'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <Text style={styles.hint}>Portal theme customization is available on the web app.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Change password</Text>
        {!canChangePassword ? (
          <Text style={styles.hint}>
            Your account uses single sign-on (Google or Microsoft). Password changes are not available here.
          </Text>
        ) : (
          <>
            <Text style={styles.label}>Current password</Text>
            <TextInput
              style={styles.input}
              value={curPass}
              onChangeText={setCurPass}
              secureTextEntry
              autoComplete="password"
            />
            <Text style={styles.label}>New password</Text>
            <TextInput
              style={styles.input}
              value={newPass}
              onChangeText={setNewPass}
              secureTextEntry
              autoComplete="password-new"
            />
            <Text style={styles.label}>Confirm new password</Text>
            <TextInput
              style={styles.input}
              value={confirmPass}
              onChangeText={setConfirmPass}
              secureTextEntry
              autoComplete="password-new"
            />
            {passMsg ? (
              <Text style={[styles.msg, passMsg.type === 'ok' ? styles.msgOk : styles.msgErr]}>
                {passMsg.text}
              </Text>
            ) : null}
            <Pressable
              onPress={handleChangePassword}
              disabled={passSaving}
              style={[styles.primaryBtn, passSaving && styles.btnDisabled]}
            >
              <Text style={styles.primaryBtnText}>{passSaving ? 'Updating…' : 'Update password'}</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: theme.muted, textAlign: 'center' },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 12 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: CORE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  previewLabel: { fontSize: 13, color: theme.muted },
  previewName: { fontSize: 15, fontWeight: '600', color: theme.text },
  previewRole: { fontSize: 12, color: '#94a3b8' },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 8 },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    fontSize: 14,
    backgroundColor: theme.white,
    color: theme.text,
  },
  inputReadOnly: { backgroundColor: '#f8fafc', color: theme.muted },
  hint: { fontSize: 11, color: '#94a3b8', marginTop: 4, lineHeight: 16 },
  msg: { fontSize: 13, marginTop: 12 },
  msgOk: { color: '#166534' },
  msgErr: { color: theme.danger },
  primaryBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: CORE_ACCENT,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.7 },
});
