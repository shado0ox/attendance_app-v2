import React from 'react';
import { Text as WebText, StyleSheet, useWindowDimensions as nativeDimensions } from 'react-native-web';
import type { TextProps } from 'react-native';
export * from 'react-native-web';
const large = () => new URLSearchParams(location.search).has('large');
export function useWindowDimensions() {
  const dimensions = nativeDimensions();
  return {...dimensions,fontScale:large()?2:dimensions.fontScale};
}
export function Text({style,...props}:TextProps) {
  const flat = StyleSheet.flatten(style) || {};
  return <WebText {...props} style={large()?{...flat,fontSize:(flat.fontSize || 14)*2,...(flat.lineHeight?{lineHeight:flat.lineHeight*2}:{})}:style}/>;
}
