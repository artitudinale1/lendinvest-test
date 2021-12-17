## Lendinvest-test


     npm install
     npm start
     npm run test
     npm run cypress:open

## Dependencies Used

 - React 
 - Redux 
 - Moment

I used Redux as state management library as I thought the exercise as a part of wider application. 
Using context and React Hooks is very useful to manage UI states such as close/open Modals or Input fields value,  but not for data states if we have a larger SPA and we want to share data across different views.

I used Moment to format the end dates. JS dates manipulation is complex and it is easy to create solutions that do not cover all cases (leap years and so on) , therefore it is convenient to relay on a framework such as Moment or Luxon.