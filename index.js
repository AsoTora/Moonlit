/**
 * @format
 */

import 'react-native-get-random-values';

import { AppRegistry, LogBox } from 'react-native';

import Config from 'react-native-config';

import App from './App';
import { name as appName } from './app.json';

if (__DEV__) {
  require('./ReactotronConfig');
}

// LogBox toasts cover the tab bar and player controls that end-to-end flows tap.
if (__DEV__ && Config.E2E === 'true') {
  LogBox.ignoreAllLogs();
}

AppRegistry.registerComponent(appName, () => App);
