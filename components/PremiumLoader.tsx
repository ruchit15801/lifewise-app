import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  withSequence, 
  useSharedValue, 
  interpolate,
  withDelay,
  Easing
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/lib/theme-context';

interface PremiumLoaderProps {
  size?: number;
  text?: string;
}

export default function PremiumLoader({ 
  size = 64, 
  text
}: PremiumLoaderProps) {
  const { colors, isDark } = useTheme();
  const progress = useSharedValue(0);
  const ring2Progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
      -1,
      true
    );
    ring2Progress.value = withRepeat(
      withDelay(400, withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) })),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 1], [0.85, 1.15]);
    const opacity = interpolate(progress.value, [0, 1], [0.4, 0.8]);
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const ring2Style = useAnimatedStyle(() => {
    const scale = interpolate(ring2Progress.value, [0, 1], [1, 1.6]);
    const opacity = interpolate(ring2Progress.value, [0, 1], [0.4, 0]);
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const rotateStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${progress.value * 360}deg` }],
    };
  });

  const themeColors = isDark 
    ? [colors.accent, colors.accentMint, colors.accentBlue]
    : [colors.accent, colors.accentBlue, colors.accentMint];

  return (
    <View style={styles.container}>
      <View style={[styles.loaderWrapper, { width: size * 2.5, height: size * 2.5 }]}>
        {/* Outer Glow / Ring 2 */}
        <Animated.View style={[
          styles.ring2, 
          { width: size, height: size, borderColor: colors.accent, borderRadius: size / 2 },
          ring2Style
        ]} />

        {/* Glass Container */}
        <BlurView 
          intensity={Platform.OS === 'ios' ? 25 : 80} 
          tint={isDark ? 'dark' : 'light'} 
          style={[styles.glass, { width: size * 1.6, height: size * 1.6, borderRadius: size * 0.8 }]}
        >
          {/* Pulsing Gradient Ring */}
          <Animated.View style={[styles.outerRing, { width: size, height: size }, pulseStyle]}>
            <LinearGradient
              colors={themeColors as any}
              style={[styles.gradient, { borderRadius: size / 2, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          </Animated.View>

          {/* Rotating Indicator */}
          <Animated.View style={[styles.innerRing, { width: size * 0.7, height: size * 0.7 }, rotateStyle]}>
            <View style={[styles.centerPoint, { backgroundColor: colors.accent, shadowColor: colors.accent }]} />
          </Animated.View>
        </BlurView>

        {text && (
          <Animated.Text style={[styles.message, { color: colors.textSecondary }]}>
            {text}
          </Animated.Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  glass: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  ring2: {
    position: 'absolute',
    borderWidth: 2,
  },
  outerRing: {
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradient: {
    width: '100%',
    height: '100%',
  },
  innerRing: {
    position: 'absolute',
    borderLeftWidth: 3,
    borderTopWidth: 3,
    borderColor: '#FFF',
    borderRadius: 999,
    opacity: 0.9,
  },
  centerPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    top: -3,
    left: '50%',
    marginLeft: -3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 8,
  },
  message: {
    marginTop: 24,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    letterSpacing: 0.5,
    textAlign: 'center',
  }
});
