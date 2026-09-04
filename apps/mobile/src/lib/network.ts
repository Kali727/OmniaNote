import { useEffect, useState } from "react";

/** Tracks the browser's online/offline signal — see syncQueue.ts for why this alone
 *  isn't trusted to gate actually sending anything (it only reflects the network
 *  interface, not real reachability), but it's a good-enough signal for UI copy. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const setTrue = () => setOnline(true);
    const setFalse = () => setOnline(false);
    window.addEventListener("online", setTrue);
    window.addEventListener("offline", setFalse);
    return () => {
      window.removeEventListener("online", setTrue);
      window.removeEventListener("offline", setFalse);
    };
  }, []);
  return online;
}
