import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
  style?: ViewStyle;
}

const AVATAR_COLORS = [
  ['#FF6B6B', '#FF8E8E'],
  ['#4ECDC4', '#7EDAD3'],
  ['#45B7D1', '#6FCBE0'],
  ['#96CEB4', '#B3E0CC'],
  ['#FFEEAD', '#FFF4C3'],
  ['#D4A5A5', '#E5BCBC'],
  ['#9B59B6', '#AF7AC5'],
  ['#3498DB', '#5DADE2'],
  ['#E67E22', '#EB984E'],
  ['#2ECC71', '#58D68D'],
];

export const Avatar: React.FC<AvatarProps> = ({ uri, name, size = 50, style }) => {
  const getInitial = (name: string) => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };

  const getColorIndex = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % AVATAR_COLORS.length;
  };

  const initial = getInitial(name);
  const colorPair = AVATAR_COLORS[getColorIndex(name)];

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <LinearGradient
          colors={colorPair as any}
          style={[styles.initialContainer, { borderRadius: size / 2 }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={[styles.initialText, { fontSize: size * 0.45 }]}>
            {initial}
          </Text>
        </LinearGradient>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
