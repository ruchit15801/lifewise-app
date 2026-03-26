import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/lib/theme-context';

interface PremiumLoaderProps {
  size?: number;
  text?: string;
  fullScreen?: boolean;
  overlay?: boolean;
}

export default function PremiumLoader({
  size = 60,
  text,
  fullScreen = false,
  overlay = false,
}: PremiumLoaderProps) {
  const { colors, isDark } = useTheme();
  
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 1500,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      }),
      -1,
      false
    );
    
    scale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.6, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);

  const animatedRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const animatedInnerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const Container = overlay || fullScreen ? (Platform.OS === 'ios' ? BlurView : View) : View;
  const containerProps: any = (overlay || fullScreen) && Platform.OS === 'ios' 
    ? { intensity: 20, tint: isDark ? 'dark' : 'light' } 
    : {};

  const content = (
    <View style={styles.content}>
      <View style={[styles.loaderContainer, { width: size, height: size }]}>
        <Animated.View style={[styles.ringContainer, animatedRingStyle]}>
          <LinearGradient
            colors={[colors.accent, 'transparent']}
            style={[styles.ring, { borderRadius: size / 2, borderWidth: size * 0.05, borderColor: 'transparent' }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>
        
        <Animated.View 
          style={[
            styles.innerCircle, 
            { 
              width: size * 0.7, 
              height: size * 0.7, 
              borderRadius: (size * 0.7) / 2,
              backgroundColor: colors.accentDim,
              borderColor: colors.accent + '33',
            }, 
            animatedInnerStyle
          ]}
        >
          <Text style={[styles.logoText, { color: colors.accent, fontSize: size * 0.2 }]}>MUST</Text>
        </Animated.View>
      </View>
      
      {text && (
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{text}</Text>
      )}
    </View>
  );

  if (fullScreen || overlay) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.overlay, overlay && { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.7)' : 'rgba(248, 250, 252, 0.7)' }]}>
        <Container {...containerProps} style={StyleSheet.absoluteFill}>
          {content}
        </Container>
      </View>
    );
  }

  return <View style={styles.inline}>{content}</View>;
}

const styles = StyleSheet.create({
  overlay: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  inline: {
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  ring: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
  },
  innerCircle: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  logoText: {
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
    fontWeight: '800',
    letterSpacing: 1,
  },
  loadingText: {
    marginTop: 16,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
