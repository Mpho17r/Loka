import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Backdrop, Glass } from './ui';
import { colors, radius } from '../theme';

/** Big picture area with the price tab tucked into its lower-left corner. */
export function DetailHero({ emoji, caption, value }: { emoji: string; caption: string; value: string }) {
  return (
    <View style={{ marginTop: 8, marginBottom: 34 }}>
      <LinearGradient colors={['rgba(255,255,255,0.8)', 'rgba(150,230,190,0.55)']} style={{ height: 230, borderRadius: radius.lg + 6, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 112 }}>{emoji}</Text>
      </LinearGradient>
      <Glass intensity={70} radiusSize={radius.lg} style={{ position: 'absolute', left: 12, bottom: -18, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: 'rgba(255,255,255,0.7)' }}>
        <Text style={{ fontSize: 13, color: colors.muted }}>{caption}</Text>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ok }}>{value}</Text>
      </Glass>
    </View>
  );
}

/** A scrolling page with its action buttons pinned to the bottom (heart on the left, the main action filling the rest). */
export function DetailPage({ children, bottom }: { children: React.ReactNode; bottom: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Backdrop>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      <BlurView intensity={50} tint="light" experimentalBlurMethod="dimezisBlurView"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 4, backgroundColor: 'rgba(255,255,255,0.35)', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.75)' }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>{bottom}</View>
      </BlurView>
    </Backdrop>
  );
}
