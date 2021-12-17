export function formattingToCalculate(amount) {
  return typeof amount === 'string'
    ? parseInt(amount.replace(/,/g, ''))
    : amount;
}

export function formattingToDisplay(amount) {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function getLoanSelected(arr, id) {
  return arr.find((element) => element.id === id);
}

export function filtering(arr, id, amount) {
  arr.forEach((element) => {
    if (element.id === id) {
      element.available_amount = formattingToDisplay(
        formattingToCalculate(element.available_amount) -
          formattingToCalculate(amount)
      );
      element.invested = true;
    }
  });
  return arr;
}
