import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Props = { lat: unknown; lng: unknown; radius: unknown; disabled?: boolean; onChange: (lat: number, lng: number) => void };
const coordinates = (lat: unknown, lng: unknown): [number, number] | null =>
  lat !== '' && lng !== '' && lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180
    ? [Number(lat), Number(lng)] : null;

export default function AttendanceLocationMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const current = useRef(props); current.current = props;
  const layers = useRef<{ map: L.Map; marker: L.Marker; circle: L.Circle } | null>(null);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    const point = coordinates(current.current.lat, current.current.lng);
    const map = L.map(container.current!, { scrollWheelZoom: false }).setView(point || [26.4207, 50.0888], point ? 16 : 11);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(map);
    tiles.on('tileerror', () => setTileError(true));
    const icon = L.divIcon({ className: 'attendance-map-pin', html: '<span style="font-size:34px;line-height:42px;display:block;text-align:center">📍</span>', iconSize: [42, 42], iconAnchor: [21, 40] });
    const marker = L.marker(point || map.getCenter(), { icon, draggable: !current.current.disabled, title: 'اسحب مؤشر موقع البصمة', alt: 'مؤشر موقع البصمة' });
    const circle = L.circle(point || map.getCenter(), { radius: Math.max(1, Number(current.current.radius) || 150), color: '#0284c7', fillOpacity: 0.15 });
    if (point) { marker.addTo(map); circle.addTo(map); }
    const pick = (position: L.LatLng) => {
      if (current.current.disabled) return;
      const lng = ((position.lng + 180) % 360 + 360) % 360 - 180;
      const lat = Math.max(-90, Math.min(90, position.lat));
      marker.setLatLng([lat, lng]).addTo(map); circle.setLatLng([lat, lng]).addTo(map);
      current.current.onChange(Number(lat.toFixed(7)), Number(lng.toFixed(7)));
    };
    map.on('click', event => pick(event.latlng));
    marker.on('dragend', () => pick(marker.getLatLng()));
    layers.current = { map, marker, circle };
    const resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(container.current!);
    return () => { resize.disconnect(); layers.current = null; map.remove(); };
  }, []);
  useEffect(() => {
    const layer = layers.current, point = coordinates(props.lat, props.lng);
    if (!layer) return;
    if (props.disabled) layer.marker.dragging?.disable(); else layer.marker.dragging?.enable();
    if (point) {
      layer.marker.setLatLng(point).addTo(layer.map); layer.circle.setLatLng(point).addTo(layer.map);
      layer.circle.setRadius(Math.max(1, Number(props.radius) || 150));
      if (!layer.map.getBounds().contains(point)) layer.map.setView(point, 16);
    } else { layer.marker.remove(); layer.circle.remove(); }
  }, [props.lat, props.lng, props.radius, props.disabled]);
  return <div className="space-y-2">
    <p className="text-xs text-slate-600">اضغط على الخريطة لتحديد موقع البصمة، أو اسحب المؤشر. الدائرة توضح النطاق المسموح؛ التغيير يُطبّق بعد الحفظ.</p>
    <div ref={container} role="region" aria-label="خريطة اختيار موقع البصمة" dir="ltr" className="h-72 w-full rounded-xl border relative z-0" />
    {tileError && <p role="alert" className="text-xs text-amber-700">تعذر تحميل بعض أجزاء الخريطة. راجع اتصال الإنترنت؛ يمكنك استخدام الموقع الحالي أو الإحداثيات المتقدمة.</p>}
  </div>;
}
