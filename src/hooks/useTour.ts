import { useCallback } from 'react';

const TOUR_KEY = 'app:flow-tour-seen:v1';

export const useTourStorage = () => {
  const hasSeen = useCallback(() => {
    try {
      const v = localStorage.getItem(TOUR_KEY);
      return v === '1';
    } catch (e) {
      return false;
    }
  }, []);

  const markSeen = useCallback(() => {
    try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { }
  }, []);

  const clearSeen = useCallback(() => {
    try { localStorage.removeItem(TOUR_KEY); } catch (e) { }
  }, []);

  return { hasSeen, markSeen, clearSeen };
};

export default useTourStorage;
