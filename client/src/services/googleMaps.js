// Shared Google Maps loader config — import LIBRARIES from here to avoid
// re-creating the array on every render (causes useJsApiLoader to reload).
export const LIBRARIES = ['places'];

// Dark map style matching the app's #0F0F0F theme
export const DARK_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'labels.icon',         stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#8a8a8a' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'administrative',       elementType: 'geometry',           stylers: [{ color: '#333333' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#aaaaaa' }] },
  { featureType: 'poi',                  elementType: 'labels.text.fill',   stylers: [{ color: '#666666' }] },
  { featureType: 'poi.park',             elementType: 'geometry',           stylers: [{ color: '#111111' }] },
  { featureType: 'road',                 elementType: 'geometry',           stylers: [{ color: '#2e2e2e' }] },
  { featureType: 'road',                 elementType: 'geometry.stroke',    stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'road',                 elementType: 'labels.text.fill',   stylers: [{ color: '#777777' }] },
  { featureType: 'road.arterial',        elementType: 'geometry',           stylers: [{ color: '#383838' }] },
  { featureType: 'road.highway',         elementType: 'geometry',           stylers: [{ color: '#444444' }] },
  { featureType: 'road.highway',         elementType: 'geometry.stroke',    stylers: [{ color: '#222222' }] },
  { featureType: 'road.highway',         elementType: 'labels.text.fill',   stylers: [{ color: '#999999' }] },
  { featureType: 'transit',              elementType: 'geometry',           stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'water',                elementType: 'geometry',           stylers: [{ color: '#0a0a0a' }] },
  { featureType: 'water',                elementType: 'labels.text.fill',   stylers: [{ color: '#3d3d3d' }] },
];

export const MAP_OPTIONS = {
  disableDefaultUI:        true,
  gestureHandling:         'greedy',  // single-finger pan on mobile
  backgroundColor:         '#1a1a1a',
  styles:                  DARK_STYLE,
  clickableIcons:          false,
};
