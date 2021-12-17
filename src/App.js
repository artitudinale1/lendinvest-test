import { Provider } from 'react-redux';
import { createStore } from 'redux';
import Loans from './Loans';
import { reducerLoans } from './reducer';

export const store = createStore(reducerLoans);

function App() {
  return (
    <Provider store={store}>
      <div className="App">
        <Loans />
      </div>
    </Provider>
  );
}

export default App;
