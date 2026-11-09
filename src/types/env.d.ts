declare module 'react-native-config' {
  export interface NativeConfig {
    SERVER_URL: string;
    E2E?: string;
  }

  export const Config: NativeConfig;
  export default Config;
}
