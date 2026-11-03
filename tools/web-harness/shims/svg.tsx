// Reemplazo de react-native-svg para el arnés web: dibuja <svg> real del navegador.
import React from 'react';
const Svg = ({ children, ...p }: any) => <svg aria-hidden="true" {...p} style={{ display: 'block', flexShrink: 0, ...(p.width === '100%' ? { width: '100%', height: '100%' } : {}) }}>{children}</svg>;
export default Svg;
export const Path = (p: any) => <path {...p} />;
export const Circle = (p: any) => <circle {...p} />;
export const Rect = (p: any) => <rect {...p} />;
export const Defs = (p: any) => <defs {...p} />;
export const LinearGradient = (p: any) => <linearGradient {...p} />;
export const Stop = (p: any) => <stop {...p} />;
