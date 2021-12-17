import './input.css';

const Input = ({ type, inputMode, value, onInput }) => {
  return (
    <input type={type} inputMode={inputMode} value={value} onInput={onInput} />
  );
};

export default Input;
