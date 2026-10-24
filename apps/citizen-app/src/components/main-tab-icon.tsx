import {
  ChartNoAxesColumnIncreasing,
  CirclePlus,
  House,
  MapPinned,
  UserRound,
} from "lucide-react-native";
import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

export type MainTabIconName = "home" | "report" | "track" | "insights" | "profile";

type MainTabIconProps = {
  name: MainTabIconName;
  color: ColorValue;
  cutoutColor: ColorValue;
  focused: boolean;
  size?: number;
};

const STROKE_WIDTH = 2.2;

function OutlineIcon({ name, color, size }: Pick<MainTabIconProps, "name" | "color"> & { size: number }) {
  switch (name) {
    case "home":
      return <House color={color} size={size} strokeWidth={STROKE_WIDTH} />;
    case "report":
      return <CirclePlus color={color} size={size} strokeWidth={STROKE_WIDTH} />;
    case "track":
      return <MapPinned color={color} size={size} strokeWidth={STROKE_WIDTH} />;
    case "insights":
      return <ChartNoAxesColumnIncreasing color={color} size={size} strokeWidth={STROKE_WIDTH} />;
    case "profile":
      return <UserRound color={color} size={size} strokeWidth={STROKE_WIDTH} />;
    default: {
      const exhaustiveName: never = name;
      return exhaustiveName;
    }
  }
}

function FilledIcon({ name, color, cutoutColor, size }: Omit<MainTabIconProps, "focused"> & { size: number }) {
  const commonProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  switch (name) {
    case "home":
      return (
        <Svg {...commonProps}>
          <Path d="M2.8 10.4 12 2.8l9.2 7.6v9.1c0 1-.8 1.7-1.7 1.7h-15c-.9 0-1.7-.7-1.7-1.7v-9.1Z" fill={color} />
          <Rect x="10.1" y="15" width="3.8" height="6.3" rx="0.45" fill={cutoutColor} />
        </Svg>
      );
    case "report":
      return (
        <Svg {...commonProps}>
          <Circle cx="12" cy="12" r="10" fill={color} />
          <Path d="M12 7v10M7 12h10" stroke={cutoutColor} strokeWidth="2.25" strokeLinecap="round" />
        </Svg>
      );
    case "track":
      return (
        <Svg {...commonProps}>
          <Path d="M4 20.3c2.2-1.6 4.3-1.6 6.4 0 2 1.5 4.1 1.5 6.1 0 1.2-.9 2.4-1.2 3.5-.9" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <Path d="M12 2.1a7 7 0 0 0-7 7c0 5.4 7 10.5 7 10.5s7-5.1 7-10.5a7 7 0 0 0-7-7Z" fill={color} />
          <Circle cx="12" cy="9.1" r="2.35" fill={cutoutColor} />
        </Svg>
      );
    case "insights":
      return (
        <Svg {...commonProps}>
          <Rect x="3" y="13" width="3.4" height="8" rx="1" fill={color} />
          <Rect x="7.9" y="9" width="3.4" height="12" rx="1" fill={color} />
          <Rect x="12.8" y="5" width="3.4" height="16" rx="1" fill={color} />
          <Rect x="17.7" y="2" width="3.4" height="19" rx="1" fill={color} />
        </Svg>
      );
    case "profile":
      return (
        <Svg {...commonProps}>
          <Circle cx="12" cy="7" r="4.3" fill={color} />
          <Path d="M3.5 21.5c0-4.8 3.8-8.6 8.5-8.6s8.5 3.8 8.5 8.6H3.5Z" fill={color} />
        </Svg>
      );
    default: {
      const exhaustiveName: never = name;
      return exhaustiveName;
    }
  }
}

export function MainTabIcon({ name, color, cutoutColor, focused, size = 28 }: MainTabIconProps) {
  if (!focused) return <OutlineIcon name={name} color={color} size={size} />;
  return <FilledIcon name={name} color={color} cutoutColor={cutoutColor} size={size} />;
}
