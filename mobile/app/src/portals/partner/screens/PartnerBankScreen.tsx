import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { partnerPortal } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const PARTNER_ACCENT = '#ea580c';

const VER_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  verified: { bg: '#dcfce7', color: '#166534' },
  rejected: { bg: '#fee2e2', color: '#991b1b' },
};

interface BankRow {
  id: number | string;
  account_holder_name?: string;
  bank_name?: string;
  account_number_last4?: string;
  ifsc?: string;
  is_primary?: boolean;
  verification_status?: string;
}

interface BankForm {
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  ifsc: string;
  is_primary: boolean;
}

const EMPTY_FORM: BankForm = {
  account_holder_name: '',
  bank_name: '',
  account_number: '',
  ifsc: '',
  is_primary: false,
};

export default function PartnerBankScreen() {
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<BankForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError('');
    setLoading(true);
    partnerPortal
      .getBankList()
      .then((rows) => setBanks(Array.isArray(rows) ? rows : []))
      .catch((e: Error) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!form.account_holder_name.trim() || !form.account_number.trim() || !form.ifsc.trim()) {
      setError('Account holder name, account number, and IFSC are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await partnerPortal.postBank(form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  function renderItem({ item: b }: { item: BankRow }) {
    const vc = VER_COLORS[b.verification_status || 'pending'] || VER_COLORS.pending;
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.flex1}>
            <Text style={styles.holder}>{b.account_holder_name}</Text>
            <Text style={styles.meta}>
              {b.bank_name ? `${b.bank_name} · ` : ''}
              ****{b.account_number_last4} · {b.ifsc}
              {b.is_primary ? ' · Primary' : ''}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: vc.bg }]}>
            <Text style={[styles.badgeText, { color: vc.color }]}>{b.verification_status}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bank accounts</Text>
        <Pressable
          onPress={() => setShowForm((v) => !v)}
          style={styles.addBtn}
        >
          <Text style={styles.addBtnText}>{showForm ? 'Cancel' : '+ Add account'}</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {showForm && (
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {([
            ['Account holder name', 'account_holder_name'],
            ['Bank name', 'bank_name'],
            ['Account number', 'account_number'],
            ['IFSC code', 'ifsc'],
          ] as const).map(([label, key]) => (
            <View key={key}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                value={form[key]}
                onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
                autoCapitalize={key === 'ifsc' ? 'characters' : 'words'}
                style={styles.input}
                placeholderTextColor={theme.muted}
              />
            </View>
          ))}
          <View style={styles.switchRow}>
            <Text style={styles.label}>Set as primary account</Text>
            <Switch
              value={form.is_primary}
              onValueChange={(v) => setForm((f) => ({ ...f, is_primary: v }))}
              trackColor={{ false: theme.border, true: '#fdba74' }}
              thumbColor={form.is_primary ? PARTNER_ACCENT : theme.white}
            />
          </View>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, saving && styles.btnDisabled]}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </ScrollView>
      )}

      {loading && banks.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={PARTNER_ACCENT} />
        </View>
      ) : (
        <FlatList
          data={banks}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !loading ? <Text style={styles.empty}>No bank accounts added yet.</Text> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: PARTNER_ACCENT,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  form: {
    padding: 16,
    gap: 10,
    backgroundColor: theme.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  label: { fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 4 },
  input: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    fontSize: 14,
    backgroundColor: theme.white,
    color: theme.text,
    marginBottom: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtn: {
    paddingVertical: 12,
    backgroundColor: PARTNER_ACCENT,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.7 },
  list: { padding: 16, paddingBottom: 24 },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 10,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flex1: { flex: 1, paddingRight: 8 },
  holder: { fontSize: 14, fontWeight: '700', color: theme.text },
  meta: { fontSize: 12, color: theme.muted, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: theme.danger, paddingHorizontal: 16, paddingTop: 8 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 24 },
});
