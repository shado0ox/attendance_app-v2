import React from 'react';
// Browser SVG adapter for the exact paths/geometry passed by native UI components.
function element(tag:string) { return ({accessible: _accessible, pointerEvents, rotation, origin, style, ...props}: Record<string,unknown>) => {
  const center = String(origin || '0,0').replace(',',' ');
  return React.createElement(tag,{...props,style, ...(pointerEvents ? {pointerEvents}:{}), ...(rotation ? {transform:`rotate(${rotation} ${center})`}:{})});
}; }
export const Circle=element('circle'), Path=element('path'), Rect=element('rect'), Line=element('line'), Polyline=element('polyline');
export default element('svg');
