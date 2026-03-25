import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Bottom padding needed so content doesn't sit under the custom pill tab bar.
 * Keep these values in sync with `app/(tabs)/_layout.tsx`.
 */
export function useTabBarContentInset() {
  const insets = useSafeAreaInsets();

  const TAB_BAR_HEIGHT = 64;
  const TAB_BAR_BOTTOM_GAP = 12; // matches `tabBarBottom` base in tabs layout
  // Extra breathing room above the pill. Keep this high enough for devices
  // with ~0 bottom inset (older Android / no home indicator).
  const CONTENT_EXTRA = 24;

  return {
    bottom: (insets.bottom || 0) + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT + CONTENT_EXTRA,
  };
}

