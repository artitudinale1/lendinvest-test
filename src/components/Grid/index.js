import './index.css';
export const Row = ({ children, className, tag: Element }) => {
  return (
    <Element className={`row ${className}`} >
      {children}
    </Element>
  );
};

export const Col = ({ modifier, children, className, tag: Element }) => {
  return (
    <Element className={`${modifier} ${className}`}>
      {children}
    </Element>
  );
};
