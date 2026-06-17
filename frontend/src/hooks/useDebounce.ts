/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import { useState, useEffect } from 'react';

/**
 * A custom hook that debounces a value with a specified delay, useful for input handling.
 * @example const debouncedSearch = useDebounce(searchTerm, 300); // Debounce search input by 300ms
 * @developerNotes Uses React's useState and useEffect to manage debounced state. The cleanup ensures timeouts are cleared on unmount.
 */
const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

export default useDebounce;
