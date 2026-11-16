import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop } from './ui';
import { colors, radius, shadow } from '../theme';

/** Big picture area with the price tab tucked into its lower-left corner. */
export function DetailHero({ emoji, caption, value }: { emoji: string; caption: string; value: string }) {
  return (
    <View style={{ marginTop: 8, marginBottom: 34 }}>
      <LinearGradient colors={['#F4FCF8', '#BFE8D2']} style={{ height: 230, borderRadius: radius.lg + 6, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 112 }}>{emoji}</Text>
      </LinearGradient>
      <View style={[{ position: 'absolute', left: 0, bottom: -16, backgroundColor: '#fff', borderTopRightRadius: radius.lg, borderBottomLeftRadius: radius.lg + 6, borderTopLeftRadius: 6, paddingHorizontal: 20, paddingVertical: 12 }, shadow]}>
        <Text style={{ fontSize: 13, color: colors.muted }}>{caption}</Text>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ok }}>{value}</Text>
      </View>
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
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 4, backgroundColor: 'rgba(244,251,247,0.94)' }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>{bottom}</View>
      </View>
    </Backdrop>
  );
}
