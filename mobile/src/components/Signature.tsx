import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { PanResponder, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { Action, Body } from "./ui";
export type SignatureHandle = { capture: () => Promise<string> };
export default forwardRef<SignatureHandle, { disabled?: boolean }>(
  function Signature({ disabled = false }, ref) {
    const view = useRef<React.ElementRef<typeof View>>(null),
      [paths, setPaths] = useState<string[]>([]),
      strokes = useRef<string[]>([]),
      points = useRef(0);
    const responder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => !disabled,
          onMoveShouldSetPanResponder: () => !disabled,
          onPanResponderGrant: (event) => {
            const { locationX: x, locationY: y } = event.nativeEvent;
            strokes.current.push(`${x},${y}`);
            points.current++;
            setPaths([...strokes.current]);
          },
          onPanResponderMove: (event) => {
            const { locationX: x, locationY: y } = event.nativeEvent;
            const last = strokes.current.length - 1;
            if (last >= 0) strokes.current[last] += ` ${x},${y}`;
            points.current++;
            setPaths([...strokes.current]);
          },
          onPanResponderTerminationRequest: () => false,
        }),
      [disabled],
    );
    useImperativeHandle(ref, () => ({
      capture: async () => {
        if (points.current < 8)
          throw new Error("وقّع داخل المساحة قبل الإرسال");
        const png = await captureRef(view, {
          format: "png",
          result: "base64",
          width: 640,
          height: 320,
        });
        return "data:image/png;base64," + png;
      },
    }));
    return (
      <View style={{ gap: 10 }}>
        <Body>توقيعك</Body>
        <View
          ref={view}
          collapsable={false}
          {...responder.panHandlers}
          accessibilityLabel="مساحة التوقيع، ارسم بإصبعك"
          style={{
            height: 180,
            backgroundColor: "white",
            borderWidth: 1,
            borderColor: "#829E98",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <Svg width="100%" height="100%">
            {paths.map((points, index) => (
              <Polyline
                key={index}
                points={points}
                fill="none"
                stroke="#101010"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        </View>
        <Action
          secondary
          label="مسح التوقيع"
          disabled={disabled}
          onPress={() => {
            strokes.current = [];
            points.current = 0;
            setPaths([]);
          }}
        />
      </View>
    );
  },
);
