import './modal.css';

const Modal = ({ show, close, title, children }) => {
  return (
    <>
      {show ? (
        <div className="modalContainer" onClick={() => close()}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal_header">
              <h2 className="modal_header-title">{title}</h2>
              <button className="close" onClick={() => close()}>
                <p>X</p>
              </button>
            </header>
            <main className="modal_content">{children}</main>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default Modal;
