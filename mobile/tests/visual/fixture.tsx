import React from 'react';
import { createRoot } from 'react-dom/client';
import { AccessibilityInfo, Alert, Text, View } from 'react-native';
import Home from '../../src/screens/Home';
import { AppLaunch } from '../../src/components/LaunchScreen';
import Notifications from '../../src/screens/Notifications';
import LocationSettings from '../../src/screens/LocationSettings';
import { Action } from '../../src/components/ui';
import Settings from '../../src/screens/Settings';
import { colors, styles } from '../../src/components/ui';
// Layout-only adapter: native confirmation is separately tested on device/CI.
Alert.alert = (_title,_message,buttons) => { buttons?.find(button => button.text==='تأكيد')?.onPress?.(); };
AccessibilityInfo.isReduceMotionEnabled = async () => !new URLSearchParams(location.search).has('motion');
const screen = new URLSearchParams(location.search).get('screen');
createRoot(document.getElementById('root')!).render(<View style={{flex:1,height:'100%'}}>
  {screen==='launch'?<AppLaunch><Action label="دخول الموظف" onPress={() => undefined}/></AppLaunch>:screen==='notifications'?<Notifications/>:screen==='location'?<LocationSettings/>:screen==='settings'?<Settings/>:<Home/>}
  {!['settings','launch','notifications','location'].includes(screen || '') && <View style={{position:'absolute',bottom:0,left:0,right:0,backgroundColor:colors.surface,borderTopWidth:1,borderColor:colors.line,paddingBottom:18,paddingTop:14,flexDirection:'row-reverse',justifyContent:'space-around'}}>
    {['الرئيسية','سجل الحضور','الجدول','الطلبات'].map(label=><Text key={label} style={[styles.subtitle,{color:label==='الرئيسية'?colors.accent:colors.muted,fontSize:12}]}>{label}</Text>)}
  </View>}
</View>);
