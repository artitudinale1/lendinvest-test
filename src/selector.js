import { useSelector } from 'react-redux';

export function useLoanId() {
  return useSelector((state) => state.selectedLoanId);
}

export function useTotalAmount() {
  return useSelector((state) => state.total_available);
}
