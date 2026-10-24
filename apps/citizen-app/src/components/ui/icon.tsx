import { useColor } from '@/hooks/useColor';
import type { LucideProps } from 'lucide-react-native';
import React from 'react';
import { Platform } from 'react-native';

export type Props = LucideProps & {
  lightColor?: string;
  darkColor?: string;
  name: React.ComponentType<LucideProps>;
};

export function Icon({
  lightColor,
  darkColor,
  name: IconComponent,
  color,
  size = 24,
  strokeWidth = 1.8,
  accessible,
  ...rest
}: Props) {
  const themedColor = useColor('icon', { light: lightColor, dark: darkColor });

  if (!IconComponent) {
    return null;
  }

  // Use provided color prop if available, otherwise use themed color
  const iconColor = color || themedColor;

  const accessibilityProps =
    Platform.OS === 'web'
      ? { 'aria-hidden': !accessible }
      : accessible !== undefined
        ? { accessible }
        : {};

  return (
    <IconComponent
      color={iconColor}
      size={size}
      strokeWidth={strokeWidth}
      strokeLinecap='round'
      {...accessibilityProps}
      {...rest}
    />
  );
}
