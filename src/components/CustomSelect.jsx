import { useEffect, useId, useRef, useState } from 'react';

function useDismiss(ref, open, onDismiss) {
  useEffect(() => {
    if (!open) return undefined;
    function dismiss(event) {
      if (!ref.current?.contains(event.target)) onDismiss();
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, onDismiss, ref]);
}

export function CustomSelect({ value, options, onValueChange, disabled = false, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const id = useId();
  const selectedIndex = options.findIndex((option) => String(option.value) === String(value));
  const selected = options[selectedIndex];
  const dismiss = () => setOpen(false);

  useDismiss(rootRef, open, dismiss);

  function choose(index) {
    const option = options[index];
    if (!option) return;
    onValueChange(option.value);
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      if (!open) {
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
      } else {
        setActiveIndex((index) => (index + direction + options.length) % options.length);
      }
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className={`custom-select${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="custom-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => {
          setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
          setOpen((current) => !current);
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{selected?.label || 'Pilih'}</span>
        <span className="custom-select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="custom-select-menu" id={id} role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={String(option.value) === String(value)}
              className={`custom-select-option${activeIndex === index ? ' is-active' : ''}`}
              key={String(option.value)}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {String(option.value) === String(value) && <span className="custom-select-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CustomCombobox({ value, options, onValueChange, ariaLabel, placeholder, required = false }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const id = useId();
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(String(value).toLowerCase())
  );
  const dismiss = () => setOpen(false);

  useDismiss(rootRef, open, dismiss);

  function choose(option) {
    onValueChange(option.value);
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      if (!open) {
        setActiveIndex(direction === 1 ? 0 : Math.max(0, filteredOptions.length - 1));
        setOpen(true);
        return;
      }
      setOpen(true);
      setActiveIndex((index) => filteredOptions.length
        ? (index + direction + filteredOptions.length) % filteredOptions.length
        : 0);
    } else if (event.key === 'Enter' && open && filteredOptions[activeIndex]) {
      event.preventDefault();
      choose(filteredOptions[activeIndex]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className={`custom-select custom-combobox${open && filteredOptions.length ? ' is-open' : ''}`} ref={rootRef}>
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open && filteredOptions.length > 0}
        aria-controls={id}
        aria-activedescendant={open && filteredOptions[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(event) => {
          onValueChange(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && filteredOptions.length > 0 && (
        <div className="custom-select-menu" id={id} role="listbox" aria-label={ariaLabel}>
          {filteredOptions.map((option, index) => (
            <button
              type="button"
              role="option"
              id={`${id}-option-${index}`}
              aria-selected={String(option.value) === String(value)}
              className={`custom-select-option${activeIndex === index ? ' is-active' : ''}`}
              key={option.value}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
