import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import DashboardScreen from '../screens/DashboardScreen';
import SettingsScreen from '../screens/SettingsScreen';


const Stack = createNativeStackNavigator();


export default function AppNavigator(){

return(

<Stack.Navigator>

<Stack.Screen
name="Home"
component={HomeScreen}
/>

<Stack.Screen
name="Dashboard"
component={DashboardScreen}
/>

<Stack.Screen
name="Settings"
component={SettingsScreen}
/>

</Stack.Navigator>

)

}