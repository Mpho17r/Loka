import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { colors, glass, radius, shadow, spacing } from '../theme';
import type { Verification } from '../types';

/** Soft mint background that every screen sits on. */
export function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <LinearGradient colors={['#BFEBD3', '#DDF3EA', '#EAF6F4']} locations={[0, 0.5, 1]} style={{ flex: 1 }}>
      {/* soft colour behind the glass, so the blur has something to frost */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={{ position: 'absolute', top: -70, right: -80, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(61,220,151,0.55)' }} />
        <View style={{ position: 'absolute', top: 260, left: -120, width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(56,189,248,0.30)' }} />
        <View style={{ position: 'absolute', bottom: 40, right: -90, width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(163,230,53,0.30)' }} />
        <View style={{ position: 'absolute', bottom: 260, left: 30, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(14,75,58,0.18)' }} />
      </View>
      {children}
    </LinearGradient>
  );
}

const OUTER_KEYS = ['margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'flex', 'flexGrow', 'alignSelf', 'position', 'left', 'right', 'top', 'bottom'];

/** Frosted glass panel. Layout styles (margin, width...) go on the outside; padding, fill and border on the glass itself. */
export function Glass({ children, style, radiusSize = radius.lg, intensity = 45, tint = 'light', flat }: {
  children?: React.ReactNode; style?: ViewStyle; radiusSize?: number; intensity?: number; tint?: 'light' | 'dark'; flat?: boolean;
}) {
  const flatStyle = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  Object.keys(flatStyle).forEach((k) => { (OUTER_KEYS.includes(k) ? outer : inner)[k] = flatStyle[k]; });
  const dark = tint === 'dark';
  const fill = (inner.backgroundColor as string | undefined) ?? (dark ? glass.dark : glass.fill);
  delete inner.backgroundColor;
  return (
    <View style={[{ borderRadius: radiusSize }, !flat && shadow, outer, typeof flatStyle.width === 'number' ? { width: flatStyle.width as number } : null]}>
      <BlurView intensity={intensity} tint="light" experimentalBlurMethod="dimezisBlurView"
        style={[{ borderRadius: radiusSize, overflow: 'hidden', borderWidth: 1, borderColor: dark ? glass.darkEdge : glass.edge }, inner]}>
        {/* the tint is a separate layer so it is not replaced by the blur's own background */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
        {children}
      </BlurView>
    </View>
  );
}

/** Bottom padding leaves room for the floating tab bar. */
export const TAB_SPACE = 120;

export function Screen({ children, scroll = true, style }: { children: React.ReactNode; scroll?: boolean; style?: ViewStyle }) {
  if (!scroll) return <Backdrop><View style={[s.screen, style]}>{children}</View></Backdrop>;
  return (
    <Backdrop>
      <ScrollView style={s.screen} contentContainerStyle={[{ padding: spacing.lg, paddingBottom: TAB_SPACE }, style]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </Backdrop>
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
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const body = <Glass style={{ padding: spacing.lg, marginBottom: spacing.md, ...flat }}>{children}</Glass>;
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)} accessibilityRole="button">
        {body}
      </Pressable>
    );
  }
  return body;
}

export function Button({
  label, onPress, variant = 'primary', disabled, style,
}: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; style?: ViewStyle }) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : glass.fillStrong;
  const fg = variant === 'secondary' ? colors.primary : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, borderColor: variant === 'secondary' ? glass.edge : bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
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
      style={[s.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary, ...shadow }]}
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
    <View style={[s.badge, { backgroundColor: ok ? colors.accentSoft : '#EEF2EF' }]}>
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
    neutral: ['#E6EEE9', colors.ink],
    good: [colors.accentSoft, colors.ok],
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
  screen: { flex: 1 },
  h1: { fontSize: 28, fontWeight: '800', color: colors.ink, marginBottom: spacing.sm, letterSpacing: -0.3 },
  h2: { fontSize: 19, fontWeight: '800', color: colors.ink, marginBottom: spacing.sm },
  muted: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.md, ...shadow,
  },
  btn: { borderRadius: radius.pill, paddingVertical: 16, paddingHorizontal: spacing.xl, alignItems: 'center', borderWidth: 1.5 },
  btnText: { fontSize: 16, fontWeight: '700' },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: glass.edge, backgroundColor: glass.fillStrong },
  chipText: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  input: {
    backgroundColor: glass.fillStrong, borderWidth: 1, borderColor: glass.edge, borderRadius: radius.md,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.ink,
  },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 15, color: colors.muted, flexShrink: 1, paddingRight: 8 },
  rowValue: { fontSize: 15, color: colors.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.accentSoft, overflow: 'hidden', marginVertical: 6 },
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

// ---------------------------------------------------------------- building blocks for the rounded, mint look

/** Round white button with an icon (back, share, heart...). */
export function RoundIconButton({ name, onPress, label, active, size = 48 }: {
  name: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; label: string; active?: boolean; size?: number;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <Glass radiusSize={size * 0.34} intensity={55} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={name} size={size * 0.46} color={active ? colors.danger : colors.primary} />
      </Glass>
    </Pressable>
  );
}

/** Heart that sits on a product card. */
export function HeartButton({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={on ? 'Remove from saved' : 'Save'} accessibilityState={{ selected: on }}>
      <Ionicons name={on ? 'heart' : 'heart-outline'} size={24} color={on ? colors.danger : colors.primary} />
    </Pressable>
  );
}

/** Rounded white search field with a magnifier. With onPress it acts as a button that opens search. */
export function SearchBar({ value, onChangeText, placeholder, onPress }: { value?: string; onChangeText?: (t: string) => void; placeholder: string; onPress?: () => void }) {
  const inner = (
    <Glass radiusSize={radius.pill} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 52, marginBottom: spacing.md }}>
      <Ionicons name="search" size={20} color={colors.muted} />
      {onPress ? (
        <Text style={{ marginLeft: 10, fontSize: 16, color: colors.muted }}>{placeholder}</Text>
      ) : (
        <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} accessibilityLabel={placeholder}
          style={{ flex: 1, marginLeft: 10, fontSize: 16, color: colors.ink }} />
      )}
    </Glass>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="search" accessibilityLabel={placeholder}>{inner}</Pressable> : inner;
}

/** Title with a "View all" link on the right. */
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.lg, marginBottom: spacing.sm }}>
      <Text style={[s.h2, { marginBottom: 0 }]}>{title}</Text>
      {action ? <Pressable onPress={onAction} accessibilityRole="link"><Text style={{ color: colors.ok, fontWeight: '700', fontSize: 15 }}>{action}</Text></Pressable> : null}
    </View>
  );
}

/** One square shortcut in the row under the banner. The selected one is filled deep green. */
export function IconTile({ icon, label, selected, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={label}
      style={[{ width: 72, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center', backgroundColor: selected ? colors.primary : 'transparent' }, selected && shadow]}>
      <Ionicons name={icon} size={26} color={selected ? '#fff' : colors.primary} />
      <Text numberOfLines={1} style={{ marginTop: 6, fontSize: 13, fontWeight: '600', color: selected ? '#fff' : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

/** Product card for horizontal rails and grids: mint picture tile, heart, title, price and a go button. */
export function ListingCard({ emoji, title, subtitle, price, saved, onToggleSaved, onPress, width }: {
  emoji: string; title: string; subtitle: string; price: string; saved: boolean; onToggleSaved: () => void; onPress: () => void; width?: number;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, ${price}`} style={({ pressed }) => ({ width, opacity: pressed ? 0.9 : 1 })}>
     <Glass style={{ padding: 10 }}>
      <LinearGradient colors={['rgba(255,255,255,0.75)', 'rgba(167,235,204,0.55)']} style={{ height: 128, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: glass.edge }}>
        <Text style={{ fontSize: 58 }}>{emoji}</Text>
        <View style={{ position: 'absolute', top: 10, left: 10 }}><HeartButton on={saved} onPress={onToggleSaved} /></View>
      </LinearGradient>
      <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 10 }}>{title}</Text>
      <Text numberOfLines={1} style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>{subtitle}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ flex: 1, fontSize: 17, fontWeight: '800', color: colors.ok, marginRight: 6 }}>{price}</Text>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </View>
      </View>
     </Glass>
    </Pressable>
  );
}
