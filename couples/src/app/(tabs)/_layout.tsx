import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../theme';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
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
