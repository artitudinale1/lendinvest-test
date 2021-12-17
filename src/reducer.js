import { formattingToDisplay, formattingToCalculate, filtering } from './utils';

export const GET_LOANS = 'GET_LOANS';
export const GET_SELECTED_INVSTMENT = 'GET_SELECTED_INVESTMENT';
export const GET_TOTAL_AMOUNT = 'GET_TOTAL_AMOUNT';
export const INVEST_IN_LOAN = 'INVEST_IN_LOAN';

/**
 * STATE
 */
export const initialState = {
  loans: [],
  selectedLoanId: '',
  total_available: 0,
};

export const reducerLoans = (state = initialState, action) => {
  switch (action.type) {
    case GET_LOANS: {
      return {
        ...state,
        loans: action.payload,
      };
    }
    case GET_SELECTED_INVSTMENT: {
      return {
        ...state,
        selectedLoanId: action.payload,
      };
    }
    case GET_TOTAL_AMOUNT: {
      return {
        ...state,
        total_available: action.payload,
      };
    }
    case INVEST_IN_LOAN: {
      return {
        ...state,
        loans: filtering(
          state.loans,
          state.selectedLoanId,
          formattingToCalculate(action.payload)
        ),
        total_available: formattingToDisplay(
          formattingToCalculate(state.total_available) -
            formattingToCalculate(action.payload)
        ),
      };
    }
    default:
      return state;
  }
};

/*ACTIONS*/
export function getLoans(payload) {
  return {
    type: GET_LOANS,
    payload,
  };
}

export function getSelectedInvestment(payload) {
  return {
    type: GET_SELECTED_INVSTMENT,
    payload,
  };
}

export function getTotalAvailable(payload) {
  return {
    type: GET_TOTAL_AMOUNT,
    payload,
  };
}

export function investInLoan(payload) {
  return {
    type: INVEST_IN_LOAN,
    payload,
  };
}
