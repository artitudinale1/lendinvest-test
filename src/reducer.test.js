import * as actions from './reducer';
import data from './current-loans';

describe('the reducer is returning correct states', () => {
  const initialState = {
    loans: [],
    selectedLoanId: '',
    total_available: 0,
  };

  test('should return the initial state', () => {
    expect(actions.reducerLoans(undefined, {})).toEqual(initialState);
  });

  test('it gets correct data', () => {
    const loans = actions.getLoans(data);

    const action = {
      type: actions.GET_LOANS,
      payload: loans,
    };

    const newState = actions.reducerLoans(initialState, action);

    expect(newState).toEqual({
      loans: loans,
      selectedLoanId: '',
      total_available: 0,
    });
  });

  test('it gets loans total amount', () => {
    const action = {
      type: actions.GET_TOTAL_AMOUNT,
      payload: '55,723',
    };

    const newState = actions.reducerLoans(initialState, action);

    expect(newState).toEqual({
      loans: [],
      selectedLoanId: '',
      total_available: '55,723',
    });
  });

  test('it gets selected loan id', () => {
    const action = {
      type: actions.GET_SELECTED_INVSTMENT,
      payload: 5,
    };

    const newState = actions.reducerLoans(initialState, action);

    expect(newState).toEqual({
      loans: [],
      selectedLoanId: 5,
      total_available: 0,
    });
  });

  test('it changes and formats total available amount and when user invests in loan', () => {
    const action = {
      type: actions.INVEST_IN_LOAN,
      payload: 1000,
    };

    const newState = actions.reducerLoans(initialState, action);

    expect(newState).toEqual({
      loans: [],
      selectedLoanId: '',
      total_available: '-1,000',
    });
  });
});
