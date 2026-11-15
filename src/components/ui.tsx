import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';
import type { Verification } from '../types';

export function Screen({ children, scroll = true, style }: { children: React.ReactNode; scroll?: boolean; style?: ViewStyle }) {
  if (!scroll) return <View style={[s.screen, style]}>{children}</View>;
  return (
    <ScrollView style={s.screen} contentContainerStyle={[{ padding: spacing.lg, paddingBottom: 48 }, style]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={s.h1}>{children}</Text>;
}
export function H2({ children }: { children: React.ReactNode }) {
  return <Text style={s.h2}>{children}</Text>;
}
export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

export function Card({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: ViewStyle }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({
  label, onPress, variant = 'primary', disabled, style,
}: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; style?: ViewStyle }) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  const fg = variant === 'secondary' ? colors.primary : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, borderColor: variant === 'secondary' ? colors.primary : bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[s.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
    >
      <Text style={[s.chipText, selected && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }} contentContainerStyle={{ gap: spacing.sm }}>
      {options.map((o) => (
        <Chip key={o} label={o} selected={o === value} onPress={() => onChange(o)} />
      ))}
    </ScrollView>
  );
}

export function Field({ label, hint, ...props }: { label: string; hint?: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...props} style={[s.input, props.multiline && { minHeight: 96, textAlignVertical: 'top' }]} />
      {hint ? <Muted style={{ marginTop: 4 }}>{hint}</Muted> : null}
    </View>
  );
}

const VERIFY_LABEL: Record<Verification, string> = {
  unverified: 'Not verified',
  identity: 'ID verified',
  business: 'Verified business',
};

/** Never shows a higher level than the account actually holds (Loka plan, section 6). */
export function VerifiedBadge({ level }: { level: Verification }) {
  const ok = level !== 'unverified';
  return (
    <View style={[s.badge, { backgroundColor: ok ? '#E3F1EC' : '#EEE' }]}>
      <Text style={[s.badgeText, { color: ok ? colors.primaryDark : colors.muted }]}>{ok ? '✓ ' : ''}{VERIFY_LABEL[level]}</Text>
    </View>
  );
}

export function SponsoredTag() {
  return (
    <View style={[s.badge, { backgroundColor: colors.sponsoredBg }]}>
      <Text style={[s.badgeText, { color: colors.warn }]}>Sponsored</Text>
    </View>
  );
}

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const map = {
    neutral: ['#ECECEC', colors.ink],
    good: ['#DDF0E4', colors.ok],
    warn: ['#FBEFD5', colors.warn],
    bad: ['#F6DDDA', colors.danger],
  } as const;
  return (
    <View style={[s.badge, { backgroundColor: map[tone][0] }]}>
      <Text style={[s.badgeText, { color: map[tone][1] }]}>{label}</Text>
    </View>
  );
}

export function Row({ label, value, bold, negative }: { label: string; value: string; bold?: boolean; negative?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, bold && { fontWeight: '700', color: colors.ink }]}>{label}</Text>
      <Text style={[s.rowValue, bold && { fontWeight: '800' }, negative && { color: colors.ok }]}>{value}</Text>
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={s.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <View style={[s.fill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ alignItems: 'center', padding: spacing.xl }}>
      <Text style={[s.h2, { textAlign: 'center' }]}>{title}</Text>
      <Muted style={{ textAlign: 'center', marginTop: 6 }}>{body}</Muted>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  h1: { fontSize: 26, fontWeight: '800', color: colors.ink, marginBottom: spacing.sm },
  h2: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: spacing.sm },
  muted: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.line, marginBottom: spacing.md,
  },
  btn: { borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.lg, alignItems: 'center', borderWidth: 1.5 },
  btnText: { fontSize: 16, fontWeight: '700' },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  chipText: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: colors.ink,
  },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 15, color: colors.muted, flexShrink: 1, paddingRight: 8 },
  rowValue: { fontSize: 15, color: colors.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: '#E8E5DC', overflow: 'hidden', marginVertical: 6 },
  fill: { height: 8, backgroundColor: colors.primary },
});

/** Bottom of a paged list: spinner while loading, an error with retry, and a Load more button. */
export function ListFooter({ loading, loadingMore, hasMore, error, onMore, onRetry }: {
  loading: boolean; loadingMore: boolean; hasMore: boolean; error: string | null; onMore: () => void; onRetry: () => void;
}) {
  if (error) {
    return (
      <View style={{ alignItems: 'center', padding: spacing.lg }}>
        <Muted style={{ color: colors.danger, textAlign: 'center', marginBottom: 8 }}>{error}</Muted>
        <Button label="Try again" variant="secondary" onPress={onRetry} />
      </View>
    );
  }
  if (loading || loadingMore) return <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} accessibilityLabel="Loading" />;
  if (hasMore) return <Button label="Load more" variant="secondary" onPress={onMore} />;
  return null;
}
