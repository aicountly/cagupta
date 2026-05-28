import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { associatePortal } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const ASSOCIATE_ACCENT = '#7c3aed';

export default function AssociateInviteScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !email.trim() || !password) {
      setError('Name, email, and password are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    setError('');
    setOk('');
    try {
      await associatePortal.postSubAssociate({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      setOk('Registration submitted. An administrator will approve the account.');
      setName('');
      setEmail('');
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text style={styles.hint}>
          Create a pending associate account linked to you. They sign in with the email and password
          you set; staff must approve before they can use the portal.
        </Text>
        <Text style={styles.label}>Full name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Full name"
          placeholderTextColor={theme.muted}
          autoComplete="name"
          style={styles.input}
        />
        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={theme.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          style={styles.input}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password (min 8 chars)"
          placeholderTextColor={theme.muted}
          secureTextEntry
          autoComplete="password-new"
          style={styles.input}
        />
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={[styles.submitBtn, submitting && styles.btnDisabled]}
        >
          <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Submit'}</Text>
        </Pressable>
        {ok ? <Text style={styles.msgOk}>{ok}</Text> : null}
        {error ? <Text style={styles.msgErr}>{error}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  hint: { fontSize: 13, color: theme.muted, lineHeight: 20, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: theme.text, marginBottom: 6, marginTop: 8 },
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
  submitBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: ASSOCIATE_ACCENT,
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.7 },
  msgOk: { color: '#16a34a', marginTop: 12, fontSize: 13 },
  msgErr: { color: theme.danger, marginTop: 12, fontSize: 13 },
});
