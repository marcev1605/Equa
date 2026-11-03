// Tipos mínimos para chequear el proyecto SIN instalar dependencias. Los módulos externos quedan como `any`;
// el código propio (src/, app/) sí se chequea de verdad (tipos de dominio, props de nuestros componentes, etc.).
declare module 'react' {
  export type ReactNode = any; export type ReactElement = any; export type ComponentType<P = any> = any;
  export type CSSProperties = any; export type PropsWithChildren<P = {}> = P & { children?: any };
  namespace React { type ReactNode = any; type ReactElement = any; type ComponentType<P = any> = any; type CSSProperties = any }
  const React: any; export default React;
  export interface Context<T> { Provider: any; Consumer: any; __t?: T }
  export const createContext: <T>(v: T) => Context<T>;
  export const useContext: <T>(c: Context<T>) => T;
  export const useState: <T>(v: T | (() => T)) => [T, (v: T | ((p: T) => T)) => void];
  export const useEffect: (f: () => any, d?: any[]) => void;
  export const useLayoutEffect: (f: () => any, d?: any[]) => void;
  export const useMemo: <T>(f: () => T, d?: any[]) => T;
  export const useCallback: <T extends (...a: any[]) => any>(f: T, d?: any[]) => T;
  export const useRef: <T>(v: T) => { current: T };
  export const forwardRef: any; export const Fragment: any; export const Children: any; export const cloneElement: any; export const isValidElement: any; export const createElement: any;
}
declare module 'react/jsx-runtime' { export const jsx: any, jsxs: any, Fragment: any }
declare module 'react-dom/client' { export const createRoot: any }
declare module 'react-native' {
  export type StyleProp<T> = T | T[] | null | undefined | false; export type ViewStyle = any; export type TextStyle = any; export type TextInputProps = any;
  export const View: any, Text: any, Pressable: any, TextInput: any, ScrollView: any, KeyboardAvoidingView: any, Image: any, ActivityIndicator: any, StyleSheet: any, Platform: any, Share: any;
  export function findNodeHandle(x: any): number | null;
  export function useWindowDimensions(): { width: number; height: number };
  export function useColorScheme(): 'light' | 'dark' | null;
}
declare module 'expo-router' { export const Slot: any, Stack: any, Redirect: any; export function usePathname(): string; export function useRouter(): any }
declare module 'expo-file-system' { export class File { constructor(...a: any[]); exists: boolean; uri: string; create(): void; delete(): void; write(c: string | Uint8Array): void } export const Paths: { cache: any } }
declare module 'expo-sharing' { export function isAvailableAsync(): Promise<boolean>; export function shareAsync(uri: string, o?: any): Promise<void> }
declare module 'expo-status-bar' { export const StatusBar: any }
declare module 'react-native-safe-area-context' { export const SafeAreaProvider: any; export function useSafeAreaInsets(): { top: number; bottom: number; left: number; right: number } }
declare module '@expo-google-fonts/bricolage-grotesque' { export const useFonts: any, BricolageGrotesque_400Regular: any, BricolageGrotesque_600SemiBold: any, BricolageGrotesque_800ExtraBold: any }
declare module '@react-native-async-storage/async-storage' { const s: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> }; export default s }
declare module 'react-native-svg' { const Svg: any; export default Svg; export const Path: any, Circle: any, Rect: any, Defs: any, LinearGradient: any, Stop: any }
declare module 'react-native-url-polyfill/auto' {}
declare module '@supabase/supabase-js' {
  export type Session = { user: { id: string; email?: string } };
  export type SupabaseClient = any;
  export const createClient: (...a: any[]) => any;
}
declare module '*.png' { const v: any; export default v }
declare function require(m: string): any;
declare const process: { env: Record<string, string | undefined> };
declare const __DEV__: boolean;
declare const structuredClone: <T>(v: T) => T;
declare namespace JSX { interface IntrinsicElements { [k: string]: any } interface ElementChildrenAttribute { children: {} } interface IntrinsicAttributes { key?: any } type Element = any }
