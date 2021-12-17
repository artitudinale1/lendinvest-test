/// <reference types="cypress" />

describe('Loans workflow', () => {
  beforeEach(function () {
    cy.visit('http://localhost:3000/3');
  });

  it('correctly renders the layout', () => {
    cy.get('.loansContainer').should('exist');
    cy.get('.loan').should('have.length', 3);
    cy.get('button').should('have.length', 3);
  });

  it('correctly open modal', () => {
    cy.get('button').first().click();
    cy.get('.modal').should('exist');
    cy.get('input').should('exist');
    cy.get('button').should('exist');
  });

  it('correctly let you invenst on loan, updating data and layout', () => {
    cy.get('.loansContainer').find('p').contains('£ 55,723');
    cy.get('.loanDetails').first().find('span').contains('£ 11,959');
    cy.get('button').first().click();
    cy.get('input').type(1000);
    cy.get('.modalBtn').first().find('button').click();
    cy.get('.modal').should('not.exist');
    cy.get('.loanDetails').first().find('.investedHighlight').should('exist');
    cy.get('.loansContainer').find('p').contains('£ 54,723');
    cy.get('.loanDetails').first().find('span').contains('£ 10,959');
  });
});
