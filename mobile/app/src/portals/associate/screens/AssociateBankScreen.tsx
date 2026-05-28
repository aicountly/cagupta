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
import { associatePortal } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const ASSOCIATE_ACCENT = '#7c3aed';

interface BankRow {
  id: number | string;
  account_holder_name?: string;
  bank_name?: string;
  account_number_last4?: string;
  ifsc?: string;
  is_primary?: boolean;
  verification_status?: string;
}

export default function AssociateBankScreen() {
  const [rows, setRows] = useState<BankRow[]>([]);
  const [holder, setHolder] = useState('');
  const [bank, setBank] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [num, setNum] = useState('');
  const [primary, setPrimary] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    associatePortal
      .getBankList()
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!holder.trim() || !ifsc.trim() || !num.trim()) {
      setError('Account holder name, IFSC, and account number are required.');
      return;
    }
    setSaving(true);
    setError('');
    setOk('');
    try {
      await associatePortal.postBank({
        account_holder_name: holder.trim(),
        bank_name: bank.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        account_number: num.trim(),
        is_primary: primary,
      });
      setOk('Saved.');
      setHolder('');
      setBank('');
      setIfsc('');
      setNum('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  function renderItem({ item: r }: { item: BankRow }) {
    return (
      <View style={styles.card}>
        <Text style={styles.holder}>{r.account_holder_name}</Text>
        <Text style={styles.meta}>
          ****{r.account_number_last4} · {r.ifsc}
          {r.bank_name ? ` · ${r.bank_name}` : ''}
        </Text>
        <Text style={styles.meta}>
          {r.verification_status}{r.is_primary ? ' · primary' : ''}
        </Text>
      </View>
    );
  }

  const formSection = (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>Add bank account</Text>
      <TextInput
        value={holder}
        onChangeText={setHolder}
        placeholder="Account holder name"
        placeholderTextColor={theme.muted}
        style={styles.input}
      />
      <TextInput
        value={bank}
        onChangeText={setBank}
        placeholder="Bank name"
        placeholderTextColor={theme.muted}
        style={styles.input}
      />
      <TextInput
        value={ifsc}
        onChangeText={(v) => setIfsc(v.toUpperCase())}
        placeholder="IFSC"
        placeholderTextColor={theme.muted}
        autoCapitalize="characters"
        style={styles.input}
      />
      <TextInput
        value={num}
        onChangeText={setNum}
        placeholder="Account number"
        placeholderTextColor={theme.muted}
        keyboardType="number-pad"
        style={styles.input}
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Set as primary</Text>
        <Switch
          value={primary}
          onValueChange={setPrimary}
          trackColor={{ false: theme.border, true: '#c4b5fd' }}
          thumbColor={primary ? ASSOCIATE_ACCENT : theme.white}
        />
      </View>
      <Pressable
        onPress={handleSave}
        disabled={saving}
        style={[styles.saveBtn, saving && styles.btnDisabled]}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
      </Pressable>
      {ok ? <Text style={styles.msgOk}>{ok}</Text> : null}
      {error ? <Text style={styles.msgErr}>{error}</Text> : null}
    </View>
  );

  return (
    <View style={styles.container}>
      {loading && rows.length === 0 ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {formSection}
          <ActivityIndicator size="large" color={ASSOCIATE_ACCENT} style={{ marginTop: 24 }} />
        </ScrollView>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ListHeaderComponent={
            <>
              {formSection}
              <Text style={styles.sectionTitle}>Saved accounts</Text>
            </>
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No bank details yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 16 },
  list: { padding: 16, paddingBottom: 32 },
  formCard: {
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  formTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 12 },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    fontSize: 14,
    backgroundColor: theme.white,
    color: theme.text,
    marginBottom: 10,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  switchLabel: { fontSize: 13, color: theme.text },
  saveBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: ASSOCIATE_ACCENT,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.7 },
  msgOk: { color: '#16a34a', marginTop: 10, fontSize: 13 },
  msgErr: { color: theme.danger, marginTop: 10, fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 8 },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 10,
  },
  holder: { fontSize: 14, fontWeight: '700', color: theme.text },
  meta: { fontSize: 12, color: theme.muted, marginTop: 4 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 8 },
});
