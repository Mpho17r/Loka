import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../theme';
import { Glass } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<string, { on: IconName; off: IconName; label: string }> = {
  Home: { on: 'home', off: 'home-outline', label: 'Home' },
  Market: { on: 'bag-handle', off: 'bag-handle-outline', label: 'Market' },
  Promote: { on: 'megaphone', off: 'megaphone-outline', label: 'Promote' },
  Services: { on: 'construct', off: 'construct-outline', label: 'Services' },
  Account: { on: 'person', off: 'person-outline', label: 'Account' },
  HQ: { on: 'business', off: 'business-outline', label: 'HQ' },
};
const CENTER = 'Promote';

/** A dark green pill floating above the content, with Promote as the raised round button in the middle. */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const items = state.routes.map((route, index) => ({ route, index, focused: state.index === index }));
  const centerItem = items.find((i) => i.route.name === CENTER);
  const others = items.filter((i) => i.route.name !== CENTER);
  const half = Math.ceil(others.length / 2) > 2 ? 2 : Math.ceil(others.length / 2);
  const left = others.slice(0, half);
  const right = others.slice(half);

  const go = (i: (typeof items)[number]) => {
    const e = navigation.emit({ type: 'tabPress', target: i.route.key, canPreventDefault: true });
    if (!i.focused && !e.defaultPrevented) navigation.navigate(i.route.name as never);
  };

  const tab = (i: (typeof items)[number]) => {
    const meta = ICONS[i.route.name] ?? ICONS.Home;
    const badge = descriptors[i.route.key].options.tabBarBadge;
    return (
      <Pressable key={i.route.key} onPress={() => go(i)} accessibilityRole="tab" accessibilityLabel={meta.label}
        accessibilityState={{ selected: i.focused }} style={{ flex: 1, height: 68, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={i.focused ? meta.on : meta.off} size={26} color={i.focused ? colors.accent : '#9DC4B3'} />
        {badge ? (
          <View style={{ position: 'absolute', top: 12, right: '24%', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{badge}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 14, right: 14, bottom: Math.max(insets.bottom, 10) + 4 }}>
      <Glass tint="dark" intensity={60} radiusSize={34} style={{ flexDirection: 'row', alignItems: 'center', height: 68, paddingHorizontal: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row' }}>{left.map(tab)}</View>
        <View style={{ width: 84 }} />
        <View style={{ flex: 1, flexDirection: 'row' }}>{right.map(tab)}</View>
      </Glass>
      {centerItem ? (
        <Pressable onPress={() => go(centerItem)} accessibilityRole="tab" accessibilityLabel="Promote" accessibilityState={{ selected: centerItem.focused }}
          style={[{ position: 'absolute', alignSelf: 'center', top: -26, width: 72, height: 72, borderRadius: 36, backgroundColor: centerItem.focused ? colors.accent : '#2FB584', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.7)' }, shadow]}>
          <Ionicons name="megaphone" size={30} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}
