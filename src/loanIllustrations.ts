export type LoanIllustration = {
  src: string;
  alt: string;
  width: number;
  height: number;
  objectPosition: string;
};

function loanImage(fileName: string): string {
  return `${import.meta.env.BASE_URL}images/${fileName}`;
}

const illustrations: Record<string, LoanIllustration> = {
  '1': {
    src: loanImage('residence-white.jpg'),
    width: 921,
    height: 818,
    objectPosition: 'center 45%',
    alt: 'Illustrative photograph of a white apartment building. This is not a photograph of 9 Munro Court, Bartin Close, Sheffield.',
  },
  '5': {
    src: loanImage('residence-pale.jpg'),
    width: 989,
    height: 1400,
    objectPosition: 'center 42%',
    alt: 'Illustrative photograph of a white residential building. This is not a photograph of 12 Hollins Green Road, Marple.',
  },
  '12': {
    src: loanImage('apartments.jpg'),
    width: 1067,
    height: 800,
    objectPosition: 'center 45%',
    alt: 'Illustrative photograph of apartment buildings with balconies. This is not a photograph of Robins Gate, Wavering Lane West, Gillingham.',
  },
};

export function illustrationFor(loanId: string): LoanIllustration {
  return illustrations[loanId] ?? illustrations['1'];
}
