/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import backgroundTask from './src/background/backgroundTask';

AppRegistry.registerComponent(appName, () => App);

// Runs headlessly when the foreground service ticks (see AzmTaskService.kt).
AppRegistry.registerHeadlessTask('AzmBackground', () => backgroundTask);