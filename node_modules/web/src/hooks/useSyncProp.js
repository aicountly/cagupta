import { useState } from 'react';

/**
 * State that resets when an external prop changes (React "adjusting state when props change").
 * Avoids useEffect(() => setState(prop), [prop]) which triggers cascading renders.
 */
export function useSyncProp(prop, map = (v) => v) {
  const [value, setValue] = useState(() => map(prop));
  const [prevProp, setPrevProp] = useState(prop);
  if (prop !== prevProp) {
    setPrevProp(prop);
    setValue(map(prop));
  }
  return [value, setValue];
}

/**
 * Loading flag set true during render when a dependency changes, before async work in useEffect.
 */
export function useLoadingOnDepChange(dep, initial = true) {
  const [loading, setLoading] = useState(initial);
  const [prevDep, setPrevDep] = useState(dep);
  if (dep !== prevDep) {
    setPrevDep(dep);
    setLoading(true);
  }
  return [loading, setLoading];
}
