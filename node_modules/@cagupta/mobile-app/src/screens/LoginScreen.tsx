import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  PORTAL_META,
  VALID_PORTALS,
  portalMismatchMessage,
  type PortalKey,
} from '@cagupta/shared-constants';
import { authService } from '../adapters/apiClient';
import { useAuth } from '../auth/AuthContext';
import { useDeepLink } from '../navigation/DeepLinkContext';
import { theme } from '../theme/portalTheme';

interface LoginScreenProps {
  initialPortal?: PortalKey | null;
}

export default function LoginScreen({ initialPortal = null }: LoginScreenProps) {
  const { login } = useAuth();
  const { loginPortal: deepLinkPortal } = useDeepLink();
  const [loginPortal, setLoginPortal] = useState<PortalKey>(initialPortal || deepLinkPortal || 'staff');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const meta = PORTAL_META[loginPortal];

  useEffect(() => {
    const portal = deepLinkPortal || initialPortal;
    if (portal) setLoginPortal(portal);
  }, [deepLinkPortal, initialPortal]);

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      const result = await authService.loginWithPassword(email.trim(), password, { portal: loginPortal });
      if ('otpRequired' in result) {
        setMaskedEmail(result.maskedEmail);
        setOtpStep(true);
      } else {
        if (portalMismatchMessage(loginPortal, result.user)) {
          setError(portalMismatchMessage(loginPortal, result.user));
          await authService.logout();
        } else {
          login(result.token, result.user);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setError('');
    setLoading(true);
    try {
      const result = await authService.verifyEmailOtp(email.trim(), otp.trim(), { portal: loginPortal });
      if (portalMismatchMessage(loginPortal, result.user)) {
        setError(portalMismatchMessage(loginPortal, result.user));
        await authService.logout();
      } else {
        login(result.token, result.user);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>CA Rahul Gupta</Text>
        <Text style={styles.subtitle}>Office Portal</Text>

        <View style={styles.portalRow}>
          {VALID_PORTALS.map((key) => {
            const p = PORTAL_META[key];
            const active = loginPortal === key;
            return (
              <Pressable
                key={key}
                onPress={() => setLoginPortal(key)}
                style={[
                  styles.portalTab,
                  active && { borderColor: p.accent, backgroundColor: p.tint },
                ]}
              >
                <Text style={[styles.portalTabText, active && { color: p.accent }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.portalSub, { color: meta.accent }]}>{meta.sub}</Text>

        {otpStep ? (
          <>
            <Text style={styles.hint}>OTP sent to {maskedEmail}</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter OTP"
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
            />
            <Pressable style={[styles.button, { backgroundColor: meta.accent }]} onPress={handleVerifyOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify OTP</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Pressable style={[styles.button, { backgroundColor: meta.accent }]} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
            </Pressable>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: theme.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: theme.muted, textAlign: 'center', marginBottom: 24 },
  portalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  portalTab: {
    flexGrow: 1,
    minWidth: '45%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.white,
    alignItems: 'center',
  },
  portalTabText: { fontSize: 13, fontWeight: '700', color: theme.text },
  portalSub: { fontSize: 12, marginBottom: 20, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    backgroundColor: theme.white,
    fontSize: 16,
  },
  button: { borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: theme.danger, marginTop: 12, textAlign: 'center' },
  hint: { fontSize: 13, color: theme.muted, marginBottom: 12, textAlign: 'center' },
});
