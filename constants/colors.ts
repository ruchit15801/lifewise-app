const Colors = {
  dark: {
    bg: '#0F172A',
    bgSecondary: '#1E293B',
    card: '#1E293B',
    cardElevated: '#334155',
    accent: '#8B5CF6',
    accentDim: 'rgba(139, 92, 246, 0.12)',
    accentBlue: '#3B82F6',
    accentBlueDim: 'rgba(59, 130, 246, 0.12)',
    accentMint: '#10B981',
    accentMintDim: 'rgba(16, 185, 129, 0.12)',
    danger: '#EF4444',
    dangerDim: 'rgba(239, 68, 68, 0.12)',
    warning: '#F59E0B',
    warningDim: 'rgba(245, 158, 11, 0.12)',
    text: '#F1F5F9',
    textSecondary: 'rgba(241, 245, 249, 0.65)',
    textTertiary: 'rgba(241, 245, 249, 0.35)',
    border: 'rgba(255, 255, 255, 0.08)',
    tint: '#8B5CF6',
    tabIconDefault: 'rgba(241, 245, 249, 0.35)',
    tabIconSelected: '#8B5CF6',
    inputBg: '#1E293B',
    inputBorder: 'rgba(255, 255, 255, 0.10)',
    statusBarStyle: 'light' as const,
    tabBarBg: '#0F172A',
    blurTint: 'dark' as const,
    gradientStart: '#0F172A',
    gradientEnd: '#1E293B',
    heroGradient: ['#1E1B4B', '#312E81', '#1E293B'] as readonly string[],
    buttonGradient: ['#8B5CF6', '#7C3AED'] as readonly string[],
    surfaceGlow: 'rgba(139, 92, 246, 0.06)',
  },
  light: {
    bg: '#F8FAFC',
    bgSecondary: '#FFFFFF',
    card: '#FFFFFF',
    cardElevated: '#F1F5F9',
    accent: '#7C3AED',
    accentDim: 'rgba(124, 58, 237, 0.08)',
    accentBlue: '#3B82F6',
    accentBlueDim: 'rgba(59, 130, 246, 0.06)',
    accentMint: '#10B981',
    accentMintDim: 'rgba(16, 185, 129, 0.06)',
    danger: '#EF4444',
    dangerDim: 'rgba(239, 68, 68, 0.06)',
    warning: '#F59E0B',
    warningDim: 'rgba(245, 158, 11, 0.06)',
    text: '#0F172A',
    textSecondary: 'rgba(15, 23, 42, 0.60)',
    textTertiary: 'rgba(15, 23, 42, 0.35)',
    border: 'rgba(15, 23, 42, 0.06)',
    tint: '#7C3AED',
    tabIconDefault: 'rgba(15, 23, 42, 0.30)',
    tabIconSelected: '#7C3AED',
    inputBg: '#F1F5F9',
    inputBorder: 'rgba(15, 23, 42, 0.08)',
    statusBarStyle: 'dark' as const,
    tabBarBg: '#FFFFFF',
    blurTint: 'light' as const,
    gradientStart: '#F8FAFC',
    gradientEnd: '#EEF2FF',
    heroGradient: ['#EEF2FF', '#E0E7FF', '#F8FAFC'] as readonly string[],
    buttonGradient: ['#7C3AED', '#6D28D9'] as readonly string[],
    surfaceGlow: 'rgba(124, 58, 237, 0.04)',
  },
  categories: {
    food: '#F97316',
    shopping: '#8B5CF6',
    transport: '#3B82F6',
    entertainment: '#EC4899',
    bills: '#6366F1',
    healthcare: '#10B981',
    education: '#06B6D4',
    investment: '#F59E0B',
    others: '#64748B',
  },
};

export interface ThemeColors {
  bg: string;
  bgSecondary: string;
  card: string;
  cardElevated: string;
  accent: string;
  accentDim: string;
  accentBlue: string;
  accentBlueDim: string;
  accentMint: string;
  accentMintDim: string;
  danger: string;
  dangerDim: string;
  warning: string;
  warningDim: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  tint: string;
  tabIconDefault: string;
  tabIconSelected: string;
  inputBg: string;
  inputBorder: string;
  statusBarStyle: 'light' | 'dark';
  tabBarBg: string;
  blurTint: 'light' | 'dark';
  gradientStart: string;
  gradientEnd: string;
  heroGradient: readonly string[];
  buttonGradient: readonly string[];
  surfaceGlow: string;
}

export default Colors;
