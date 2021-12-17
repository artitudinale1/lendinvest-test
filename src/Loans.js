import React, { useState, useEffect, useRef } from 'react';
import data from './current-loans';
import moment from 'moment';

import {
  getSelectedInvestment,
  getLoans,
  investInLoan,
  getTotalAvailable,
} from './reducer';
import { connect } from 'react-redux';

import { useLoanId, useTotalAmount } from './selector';
import {
  formattingToDisplay,
  formattingToCalculate,
  getLoanSelected,
} from './utils';

import Modal from './components/Modal';
import Button from './components/Button';
import Input from './components/Input';
import { Row, Col } from './components/Grid/';

import './reset.css';
import './loans.css';

const Loans = ({
  loans,
  getSelectedInvestment,
  investInLoan,
  getTotalAvailable,
  getLoans,
}) => {
  const [input, setInput] = useState('');

  const [modal, setModal] = useState(false);
  const Toggle = () => {
    setModal(!modal);
  };

  const selectedLoanId = useLoanId();
  const total_available = useRef(null);

  useEffect(
    () => {
      data.loans.map((l) => {
        return (total_available.current =
          total_available.current + formattingToCalculate(l.available_amount));
      });
      getLoans(data.loans);
      getTotalAvailable(total_available.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <section className="loansContainer">
      <h1>Current Loans</h1>
      {loans.map((l) => {
        return (
          <Row tag="article" key={l.id} className="loan">
            <Col modifier="col-xs-9" tag="ul" className="loanDetails">
              <li>
                <h2>{l.title}</h2>
              </li>
              <li>
                Available Amount: <span> £ {l.available_amount}</span>
              </li>
              <li>
                Deadline:{' '}
                <span>
                  {' '}
                  {moment.duration(l.term_remaining, 'seconds').humanize()}
                </span>{' '}
              </li>
              <li>
                {l.invested ? (
                  <p className="investedHighlight">INVESTED</p>
                ) : null}
              </li>
            </Col>
            <Col modifier="col-xs-3" tag="div" className="loanButton">
              <Button
                text={'INVEST'}
                onClick={() => {
                  getSelectedInvestment(l.id);
                  Toggle();
                }}
              />
            </Col>
          </Row>
        );
      })}
      <p>{`Total amount available for investments: £ ${formattingToDisplay(
        useTotalAmount()
      )}`}</p>
      <Modal show={modal} title="Invest in Loan" close={Toggle}>
        <p>{getLoanSelected(loans, selectedLoanId)?.title}</p>
        <p>
          Available Amount:{' '}
          {getLoanSelected(loans, selectedLoanId)?.available_amount}
        </p>
        <p>
          Deadline:{' '}
          {moment
            .duration(
              getLoanSelected(loans, selectedLoanId)?.term_remaining,
              'seconds'
            )
            .humanize()}
        </p>
        <Row tag="div" className="modalActions">
          <Col modifier="col-xs-6" tag="div" className="modalInput">
            <Input
              type="number"
              value={input}
              onInput={(e) => setInput(e.target.value)}
            />
          </Col>
          <Col modifier="col-xs-6" tag="div"  className="modalBtn">
            <Button
              text={'INVEST'}
              onClick={() => {
                !input ? Toggle() : investInLoan(input);
                setInput('');
                Toggle();
              }}
            />
          </Col>
        </Row>
      </Modal>
    </section>
  );
};

const mapStateToProps = (state) => {
  const loans = state;
  return loans;
};

const mapDispatchToProps = (dispatch) => {
  return {
    getLoans: (loans) => dispatch(getLoans(loans)),
    getSelectedInvestment: (l) => dispatch(getSelectedInvestment(l)),
    investInLoan: (value) => dispatch(investInLoan(value)),
    getTotalAvailable: (prevCount, increment) =>
      dispatch(getTotalAvailable(prevCount, increment)),
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(Loans);
