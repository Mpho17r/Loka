import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider, useApp } from './src/store/AppState';
import { colors } from './src/theme';
import type { RootStackParamList, TabParamList } from './src/navigation/types';
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

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary, card: '#fff', text: colors.ink, border: colors.line } };
const icon = (emoji: string) => () => <Text style={{ fontSize: 20 }}>{emoji}</Text>;

function Tabs() {
  const { isStaff, unread } = useApp();
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: colors.primary, headerTitleStyle: { fontWeight: '800' } }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: icon('🏠'), title: 'Loka' }} />
      <Tab.Screen name="Market" component={MarketScreen} options={{ tabBarIcon: icon('🛍️'), title: 'Market' }} />
      <Tab.Screen name="Services" component={ServicesScreen} options={{ tabBarIcon: icon('🧰'), title: 'Services' }} />
      <Tab.Screen name="Promote" component={PromoteScreen} options={{ tabBarIcon: icon('📣'), title: 'Promote' }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ tabBarIcon: icon('👤'), title: 'Account', tabBarBadge: unread > 0 ? unread : undefined }} />
      {isStaff ? <Tab.Screen name="HQ" component={HQScreen} options={{ tabBarIcon: icon('🏢'), title: 'HQ' }} /> : null}
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
      <Stack.Navigator>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: 'Product' }} />
        <Stack.Screen name="ServiceDetail" component={ServiceDetailScreen} options={{ title: 'Service' }} />
        <Stack.Screen name="RequestQuote" component={RequestQuoteScreen} options={{ title: 'Request a quotation' }} />
        <Stack.Screen name="CampaignBuilder" component={CampaignBuilderScreen} options={{ title: 'New campaign' }} />
        <Stack.Screen name="CampaignDetail" component={CampaignDetailScreen} options={{ title: 'Campaign' }} />
        <Stack.Screen name="CreateListing" component={CreateListingScreen} options={({ route }) => ({ title: route.params.type === 'product' ? 'Add product' : 'Add service' })} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <Root />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
