import React from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  Modal,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme-context';
import { useSeniorMode } from '@/lib/senior-context';

interface CustomModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  height?: number | string;
  showCloseButton?: boolean;
  fullScreen?: boolean;
  backdropColor?: string;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function CustomModal({
  visible,
  onClose,
  children,
  height = 'auto',
  showCloseButton = true,
  fullScreen = false,
  backdropColor,
}: CustomModalProps) {
  const { colors, isDark } = useTheme();
  const { isSeniorMode } = useSeniorMode();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={[styles.container, fullScreen && styles.fullScreenContainer]}>
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={StyleSheet.absoluteFill}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: backdropColor || 'rgba(0,0,0,0.45)' }]} />
          )}
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.keyboardView, fullScreen && styles.fullScreenContainer]}
        >
          <Animated.View
            entering={fullScreen ? FadeIn.duration(300) : SlideInDown.springify().damping(18).stiffness(120)}
            exiting={fullScreen ? FadeOut.duration(200) : SlideOutDown.duration(200)}
            style={[
              styles.sheet,
              {
                backgroundColor: fullScreen ? (backdropColor || 'rgba(0,0,0,0.95)') : colors.card,
                borderColor: colors.border,
                height: height as any,
                maxHeight: SCREEN_HEIGHT * (fullScreen ? 1 : 0.9),
              },
              fullScreen && styles.fullScreenSheet,
            ]}
          >
            {!fullScreen && (
              <View style={styles.handleContainer}>
                <View style={[styles.handle, { backgroundColor: colors.border }]} />
              </View>
            )}

            {showCloseButton && (
              <Pressable
                onPress={onClose}
                style={[
                  styles.closeBtn,
                  { backgroundColor: colors.inputBg },
                  isSeniorMode && { width: 44, height: 44, borderRadius: 22 }
                ]}
              >
                <Ionicons name="close" size={isSeniorMode ? 28 : 20} color={colors.textSecondary} />
              </Pressable>
            )}

            <View style={styles.content}>
              {children}
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  fullScreenContainer: {
    justifyContent: 'center',
  },
  keyboardView: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  fullScreenSheet: {
    height: '100%',
    maxHeight: '100%',
    borderRadius: 0,
    borderTopWidth: 0,
    paddingBottom: 0,
  },
  handleContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  content: {
    paddingHorizontal: 20,
  },
});
