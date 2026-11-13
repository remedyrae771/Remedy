import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../../theme';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  // Иконка активной вкладки мягко «подпрыгивает».
  const [bounce] = useState(() => new Animated.Value(focused ? 1 : 0));
  useEffect(() => {
    if (focused) {
      bounce.setValue(0);
      Animated.spring(bounce, { toValue: 1, friction: 4, tension: 160, useNativeDriver: Platform.OS !== 'web' }).start();
    } else {
      Animated.timing(bounce, { toValue: 0, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }).start();
    }
  }, [focused, bounce]);
  const scale = bounce.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  return (
    <Animated.View
      style={{
        width: 52,
        height: 32,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.primarySoft : 'transparent',
        transform: [{ scale }],
      }}
    >
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
    </Animated.View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // Под полоской жестов iPhone оставляем её высоту плюс воздух; без неё — просто воздух.
  const bottomPad = Math.max(insets.bottom, 0) + (Platform.OS === 'web' ? 14 : 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 72 + bottomPad,
          paddingTop: 6,
          paddingBottom: bottomPad,
          shadowColor: '#7A2E48',
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
          elevation: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2, lineHeight: 14 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Мы', tabBarIcon: ({ focused }) => <TabIcon emoji="💞" focused={focused} /> }}
      />
      <Tabs.Screen
        name="dates"
        options={{ title: 'Даты', tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} /> }}
      />
      <Tabs.Screen
        name="questions"
        options={{ title: 'Вопросы', tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} /> }}
      />
      <Tabs.Screen
        name="lists"
        options={{ title: 'Списки', tabBarIcon: ({ focused }) => <TabIcon emoji="📝" focused={focused} /> }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: 'Чат', tabBarIcon: ({ focused }) => <TabIcon emoji="💌" focused={focused} /> }}
      />
    </Tabs>
  );
}
