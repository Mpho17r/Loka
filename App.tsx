import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider, useApp } from './src/store/AppState';
import { colors } from './src/theme';
import { TabBar } from './src/components/TabBar';
import { configureForegroundNotifications } from './src/lib/push';
import type { RootStackParamList, TabParamList } from './src/navigation/types';
import InboxScreen from './src/screens/InboxScreen';
import ChatScreen from './src/screens/ChatScreen';
import HomeScreen from './src/screens/HomeScreen';
import MarketScreen from './src/screens/MarketScreen';
import ServicesScreen from './src/screens/ServicesScreen';
import PromoteScreen from './src/screens/PromoteScreen';
import AccountScreen from './src/screens/AccountScreen';
import HQScreen from './src/screens/HQScreen';
import ProductDetailScreen from './src/screens/ProductDetailScreen';
import ServiceDetailScreen from './src/screens/ServiceDetailScreen';
import RequestQuoteScreen from './src/screens/RequestQuoteScreen';
import CampaignBuilderScreen from './src/screens/CampaignBuilderScreen';
import CampaignDetailScreen from './src/screens/CampaignDetailScreen';
import CreateListingScreen from './src/screens/CreateListingScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary, card: '#BFEBD3', text: colors.ink, border: 'transparent' } };
const headerLook = {
  headerStyle: { backgroundColor: '#BFEBD3' },
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerTitleStyle: { fontWeight: '800' as const, color: colors.ink, fontSize: 20 },
};

function Tabs() {
  const { isStaff, unread } = useApp();
  return (
    <Tab.Navigator tabBar={(p) => <TabBar {...p} />} screenOptions={{ ...headerLook }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ headerShown: false, title: 'Loka' }} />
      <Tab.Screen name="Market" component={MarketScreen} options={{ title: 'Market' }} />
      <Tab.Screen name="Promote" component={PromoteScreen} options={{ title: 'Promote' }} />
      <Tab.Screen name="Services" component={ServicesScreen} options={{ title: 'Services' }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ title: 'Account', tabBarBadge: unread > 0 ? unread : undefined }} />
      {isStaff ? <Tab.Screen name="HQ" component={HQScreen} options={{ title: 'HQ' }} /> : null}
    </Tab.Navigator>
  );
}

function Root() {
  const { ready } = useApp();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  return (
    <NavigationContainer theme={theme}>
      <StatusBar style="dark" />
      <Stack.Navigator screenOptions={{ ...headerLook, headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: 'Product' }} />
        <Stack.Screen name="ServiceDetail" component={ServiceDetailScreen} options={{ title: 'Service' }} />
        <Stack.Screen name="RequestQuote" component={RequestQuoteScreen} options={{ title: 'Request a quotation' }} />
        <Stack.Screen name="CampaignBuilder" component={CampaignBuilderScreen} options={{ title: 'New campaign' }} />
        <Stack.Screen name="CampaignDetail" component={CampaignDetailScreen} options={{ title: 'Campaign' }} />
        <Stack.Screen name="Inbox" component={InboxScreen} options={{ title: 'Messages' }} />
        <Stack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ title: route.params.title ?? 'Message' })} />
        <Stack.Screen name="CreateListing" component={CreateListingScreen} options={({ route }) => ({ title: route.params.type === 'product' ? 'Add product' : 'Add service' })} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// (tab order matters: Promote is the raised middle button)
export default function App() {
  useEffect(() => { configureForegroundNotifications(); }, []);
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <Root />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
