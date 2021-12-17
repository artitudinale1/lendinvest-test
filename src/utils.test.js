import { formattingToDisplay, formattingToCalculate, filtering } from './utils';
import data from './current-loans';

describe('formattingToDisplay func', () => {
  test('it returns a string formatted with comma ', () => {
    const input = 1000;
    const formattedToDisplay = '1,000';
    const result = formattingToDisplay(input);
    expect(result).toEqual(formattedToDisplay);
  });
});

describe('formattingToCalculate func', () => {
  test('it returns number without any comma ', () => {
    const input = '1,000';
    const formattedToCalculate = 1000;
    const result = formattingToCalculate(input);
    expect(result).toEqual(formattedToCalculate);
  });
});

describe('filtering func', () => {
  test('it returns an array with the available_amount proprety of the obj with same id given decresed of given amount ', () => {
    const array = data.loans;
    const id = '5';
    const input = 1000;
    const result = filtering(array, id, input);
    const filteredArray = [
      {
        id: '1',
        title: '9 Munro Court, Bartin Close, Sheffield',
        tranche: 'A',
        available_amount: '11,959',
        annualised_return: '8.60',
        term_remaining: '864000',
        ltv: '48.80',
        loan_value: '85,754',
      },
      {
        id: '5',
        invested: true,
        title: '12 Hollins Green Road, Marple',
        tranche: 'B',
        available_amount: '30,405',
        annualised_return: '7.10',
        term_remaining: '1620000',
        ltv: '48.80',
        loan_value: '85,754',
      },
      {
        id: '12',
        title: 'Robins Gate, Wavering Lane West, Gillingham',
        tranche: 'C',
        available_amount: '12,359',
        annualised_return: '4.80',
        term_remaining: '879000',
        ltv: '48.80',
        loan_value: '85,754',
      },
    ];
    expect(result).toEqual(filteredArray);
  });
});
